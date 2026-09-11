import { query, withTransaction } from '../config/db.js';
import { asyncHandler } from '../utils/helpers.js';
import { targetUserIdForRead, targetUserIdForWrite } from '../services/scope.js';
import { recomputeAllBalances } from '../services/balance.js';
import { logAudit } from '../services/audit.js';

const LOAN_SELECT = `
  SELECT l.*, p.full_name AS person_name,
         COALESCE((SELECT SUM(lp.amount) FROM loan_payments lp WHERE lp.loan_id = l.id), 0) AS paid,
         COALESCE((SELECT SUM(lp.principal) FROM loan_payments lp WHERE lp.loan_id = l.id), 0) AS principal_paid,
         COALESCE((SELECT SUM(lp.interest) FROM loan_payments lp WHERE lp.loan_id = l.id), 0) AS interest_paid,
         (SELECT count(*)::int FROM loan_payments lp WHERE lp.loan_id = l.id) AS payments_count,
         (SELECT MAX(lp.date) FROM loan_payments lp WHERE lp.loan_id = l.id) AS last_payment_date
    FROM loans l
    LEFT JOIN people p ON p.id = l.person_id`;

function periodicityToDays(periodicity) {
  switch (periodicity) {
    case 'semanal': return 7;
    case 'quincenal': return 15;
    case 'mensual': return 30;
    case 'bimestral': return 60;
    case 'trimestral': return 90;
    default: return 30;
  }
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function summarizeLoan(l) {
  const pending = Math.max(0, Number(l.amount) - Number(l.principal_paid));
  const paidCount = l.payments_count || 0;
  const days = periodicityToDays(l.periodicity);
  const today = new Date().toISOString().slice(0, 10);

  let overdueCount = 0;
  const start = new Date(`${l.date}T00:00:00`);
  for (let k = 0; k < (l.num_installments || 1); k++) {
    const due = new Date(start);
    due.setDate(due.getDate() + days * k);
    const dueStr = due.toISOString().slice(0, 10);
    if (dueStr < today && k >= paidCount) overdueCount += 1;
  }

  return {
    ...l,
    pending,
    next_installment_number: pending > 0 ? paidCount + 1 : null,
    next_due_date: pending > 0 ? addDays(l.date, days * paidCount) : null,
    paid_installments: paidCount,
    pending_installments: Math.max(0, (l.num_installments || 1) - paidCount),
    overdue_installments: overdueCount,
  };
}

export const listLoans = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const conditions = ['l.user_id = $1'];
  const params = [userId];
  let n = 1;
  if (req.query.type) { params.push(req.query.type); conditions.push(`l.type = $${++n}`); }
  if (req.query.status) { params.push(req.query.status); conditions.push(`l.status = $${++n}`); }
  if (req.query.person_id) { params.push(req.query.person_id); conditions.push(`l.person_id = $${++n}`); }
  const where = `WHERE ${conditions.join(' AND ')}`;
  const { rows } = await query(`${LOAN_SELECT} ${where} ORDER BY l.date DESC`, params);
  res.json({ data: rows.map(summarizeLoan) });
});

export const getLoan = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const { rows } = await query(`${LOAN_SELECT} WHERE l.id = $1 AND l.user_id = $2`, [req.params.id, userId]);
  if (!rows.length) return res.status(404).json({ message: 'Préstamo no encontrado.' });
  const { rows: payments } = await query(
    `SELECT lp.*, a.name AS account_name FROM loan_payments lp
       LEFT JOIN accounts a ON a.id = lp.account_id
      WHERE lp.loan_id = $1 ORDER BY lp.date, lp.id`,
    [req.params.id]
  );
  res.json({ loan: summarizeLoan(rows[0]), payments });
});

function computeStatus(loan) {
  const pending = Math.max(0, Number(loan.amount) - Number(loan.principal_paid || 0));
  const paidCount = loan.payments_count || 0;
  if (loan.status === 'cancelled') return 'cancelled';
  if (pending <= 0) return 'paid';
  const today = new Date().toISOString().slice(0, 10);
  if (loan.due_date && loan.due_date < today) return 'overdue';
  if (paidCount > 0) return 'partially_paid';
  if (loan.status === 'active') return 'active';
  return loan.status === 'pending' ? 'pending' : 'active';
}

async function refreshLoanStatus(client, loanId) {
  const { rows } = await client.query(
    `SELECT l.*,
       COALESCE((SELECT SUM(lp.principal) FROM loan_payments lp WHERE lp.loan_id = l.id), 0) AS principal_paid,
       (SELECT count(*)::int FROM loan_payments lp WHERE lp.loan_id = l.id) AS payments_count
     FROM loans l WHERE l.id = $1`,
    [loanId]
  );
  if (rows.length) {
    const status = computeStatus(rows[0]);
    await client.query('UPDATE loans SET status = $2, updated_at = now() WHERE id = $1', [loanId, status]);
  }
}

export const createLoan = asyncHandler(async (req, res) => {
  const userId = targetUserIdForWrite(req, req.body.user_id);
  const {
    person_id, type, amount, interest_rate = 0, date, due_date, num_installments = 1,
    periodicity = 'mensual', installment_amount = 0, description, status = 'pending',
  } = req.body;

  const loan = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO loans (user_id, person_id, type, amount, interest_rate, date, due_date, num_installments, periodicity, installment_amount, description, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [userId, person_id || null, type, amount, interest_rate, date, due_date || null, num_installments,
        periodicity, installment_amount, description || null, status]
    );
    await logAudit(client, { userId: req.user.id, action: 'create', module: 'prestamos', recordId: rows[0].id, newData: rows[0], req });
    return rows[0];
  });
  res.status(201).json({ loan });
});

export const updateLoan = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const id = req.params.id;
  const {
    person_id, type, amount, interest_rate, date, due_date, num_installments,
    periodicity, installment_amount, description, status,
  } = req.body;

  const loan = await withTransaction(async (client) => {
    const { rows: oldRows } = await client.query('SELECT * FROM loans WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!oldRows.length) {
      const e = new Error('Préstamo no encontrado.');
      e.status = 404;
      throw e;
    }
    const old = oldRows[0];
    const { rows } = await client.query(
      `UPDATE loans SET
         person_id = $2, type = COALESCE($3, type), amount = COALESCE($4, amount),
         interest_rate = COALESCE($5, interest_rate), date = COALESCE($6, date), due_date = $7,
         num_installments = COALESCE($8, num_installments), periodicity = COALESCE($9, periodicity),
         installment_amount = COALESCE($10, installment_amount), description = $11, status = COALESCE($12, status),
         updated_at = now()
       WHERE id = $1 RETURNING *`,
      [id, person_id ?? old.person_id, type ?? old.type, amount ?? old.amount, interest_rate ?? old.interest_rate,
        date ?? old.date, due_date ?? old.due_date, num_installments ?? old.num_installments,
        periodicity ?? old.periodicity, installment_amount ?? old.installment_amount, description ?? old.description, status ?? old.status]
    );
    await refreshLoanStatus(client, id);
    await logAudit(client, { userId: req.user.id, action: 'update', module: 'prestamos', recordId: id, oldData: old, newData: rows[0], req });
    return rows[0];
  });
  res.json({ loan });
});

export const removeLoan = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const id = req.params.id;
  await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM loans WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!rows.length) {
      const e = new Error('Préstamo no encontrado.');
      e.status = 404;
      throw e;
    }
    await client.query('DELETE FROM loans WHERE id = $1', [id]);
    await recomputeAllBalances(client, userId);
    await logAudit(client, { userId: req.user.id, action: 'delete', module: 'prestamos', recordId: id, oldData: rows[0], req });
  });
  res.json({ message: 'Préstamo eliminado.' });
});

// ---------- Pagos / abonos ----------
export const listLoanPayments = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const { rows } = await query(
    `SELECT lp.*, a.name AS account_name FROM loan_payments lp
       JOIN loans l ON l.id = lp.loan_id
       LEFT JOIN accounts a ON a.id = lp.account_id
      WHERE lp.loan_id = $1 AND l.user_id = $2 ORDER BY lp.date, lp.id`,
    [req.params.id, userId]
  );
  res.json({ data: rows });
});

export const createLoanPayment = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const loanId = req.params.id;
  const { date, amount, installment_number, account_id, principal, interest = 0, notes } = req.body;

  const result = await withTransaction(async (client) => {
    const { rows: loanRows } = await client.query(
      `SELECT l.*,
         COALESCE((SELECT SUM(lp.principal) FROM loan_payments lp WHERE lp.loan_id = l.id), 0) AS principal_paid
       FROM loans l WHERE l.id = $1 AND l.user_id = $2`,
      [loanId, userId]
    );
    if (!loanRows.length) {
      const e = new Error('Préstamo no encontrado.');
      e.status = 404;
      throw e;
    }
    const loan = loanRows[0];
    const principalAmount = principal ?? amount;
    const pending = Math.max(0, Number(loan.amount) - Number(loan.principal_paid));
    if (principalAmount > pending + 0.001) {
      const e = new Error('El pago supera el saldo pendiente del préstamo.');
      e.status = 400;
      throw e;
    }

    const { rows } = await client.query(
      `INSERT INTO loan_payments (loan_id, account_id, date, amount, installment_number, principal, interest, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [loanId, account_id || null, date, amount, installment_number || null, principalAmount, interest, notes || null]
    );
    await recomputeAllBalances(client, userId);
    await refreshLoanStatus(client, loanId);
    await logAudit(client, { userId: req.user.id, action: 'create_payment', module: 'prestamos', recordId: loanId, newData: rows[0], req });
    return rows[0];
  });
  res.status(201).json({ payment: result });
});

export const removeLoanPayment = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const loanId = req.params.id;
  const paymentId = req.params.paymentId;
  await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT lp.* FROM loan_payments lp JOIN loans l ON l.id = lp.loan_id
        WHERE lp.id = $1 AND l.id = $2 AND l.user_id = $3`,
      [paymentId, loanId, userId]
    );
    if (!rows.length) {
      const e = new Error('Pago no encontrado.');
      e.status = 404;
      throw e;
    }
    await client.query('DELETE FROM loan_payments WHERE id = $1', [paymentId]);
    await recomputeAllBalances(client, userId);
    await refreshLoanStatus(client, loanId);
    await logAudit(client, { userId: req.user.id, action: 'delete_payment', module: 'prestamos', recordId: loanId, oldData: rows[0], req });
  });
  res.json({ message: 'Pago eliminado.' });
});
