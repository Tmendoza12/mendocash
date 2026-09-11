import { query, withTransaction } from '../config/db.js';
import { asyncHandler, buildPagination } from '../utils/helpers.js';
import { targetUserIdForRead, targetUserIdForWrite } from '../services/scope.js';
import { recomputeAllBalances } from '../services/balance.js';
import { logAudit } from '../services/audit.js';
import { exportData } from '../services/export.js';

const SELECT = `
  SELECT e.*, a.name AS account_name, c.name AS category_name, s.name AS subcategory_name, p.full_name AS person_name
    FROM expenses e
    LEFT JOIN accounts a ON a.id = e.account_id
    LEFT JOIN categories c ON c.id = e.category_id
    LEFT JOIN subcategories s ON s.id = e.subcategory_id
    LEFT JOIN people p ON p.id = e.person_id`;

function buildFilters(req, userId, params, conditions) {
  let n = 1;
  if (req.query.from) { params.push(req.query.from); conditions.push(`e.date >= $${++n}`); }
  if (req.query.to) { params.push(req.query.to); conditions.push(`e.date <= $${++n}`); }
  if (req.query.category_id) { params.push(req.query.category_id); conditions.push(`e.category_id = $${++n}`); }
  if (req.query.subcategory_id) { params.push(req.query.subcategory_id); conditions.push(`e.subcategory_id = $${++n}`); }
  if (req.query.account_id) { params.push(req.query.account_id); conditions.push(`e.account_id = $${++n}`); }
  if (req.query.payment_method) { params.push(req.query.payment_method); conditions.push(`e.payment_method = $${++n}`); }
  if (req.query.min_amount) { params.push(req.query.min_amount); conditions.push(`e.amount >= $${++n}`); }
  if (req.query.max_amount) { params.push(req.query.max_amount); conditions.push(`e.amount <= $${++n}`); }
  if (req.query.search) { params.push(`%${req.query.search}%`); conditions.push(`(e.description ILIKE $${++n} OR e.merchant ILIKE $${++n})`); }
}

export const listExpenses = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const { page, limit, offset } = buildPagination(req.query);
  const conditions = ['e.user_id = $1'];
  const params = [userId];
  buildFilters(req, userId, params, conditions);

  const where = `WHERE ${conditions.join(' AND ')}`;
  const orderCol = ['date', 'amount', 'description', 'created_at'].includes(req.query.sort) ? req.query.sort : 'date';
  const orderDir = req.query.order === 'asc' ? 'ASC' : 'DESC';

  const { rows: countRows } = await query(`SELECT count(*)::int AS total FROM expenses e ${where}`, params);
  const { rows } = await query(
    `${SELECT} ${where} ORDER BY e.${orderCol} ${orderDir}, e.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  res.json({ data: rows, total: countRows[0].total, page, limit });
});

export const getExpense = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const { rows } = await query(`${SELECT} WHERE e.id = $1 AND e.user_id = $2`, [req.params.id, userId]);
  if (!rows.length) return res.status(404).json({ message: 'Gasto no encontrado.' });
  res.json({ expense: rows[0] });
});

// ---------------------------------------------------------------------------
// Pago a una persona: descuenta del préstamo o deuda activa relacionada.
// ---------------------------------------------------------------------------
function computeLoanStatus(loan) {
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
    await client.query('UPDATE loans SET status = $2, updated_at = now() WHERE id = $1', [loanId, computeLoanStatus(rows[0])]);
  }
}

async function refreshDebtStatus(client, debtId) {
  const { rows } = await client.query(
    `SELECT d.*, COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp WHERE dp.debt_id = d.id), 0) AS paid
     FROM debts d WHERE d.id = $1`,
    [debtId]
  );
  if (rows.length) {
    const d = rows[0];
    const pending = Math.max(0, Number(d.amount) - Number(d.paid));
    let status = d.status;
    if (d.status !== 'cancelled') {
      if (pending <= 0) status = 'paid';
      else if (d.due_date && d.due_date < new Date().toISOString().slice(0, 10)) status = 'overdue';
      else if (Number(d.paid) > 0) status = 'partially_paid';
    }
    await client.query('UPDATE debts SET status = $2, updated_at = now() WHERE id = $1', [debtId, status]);
  }
}

async function applyPaymentToPerson(client, userId, personId, amount, date, expenseId) {
  if (!personId || !amount || Number(amount) <= 0) return null;

  const { rows: loanRows } = await client.query(
    `SELECT l.*,
       GREATEST(l.amount - COALESCE((SELECT SUM(lp.principal) FROM loan_payments lp WHERE lp.loan_id = l.id), 0), 0) AS pending
     FROM loans l
    WHERE l.user_id = $1 AND l.person_id = $2 AND l.type = 'borrowed'
      AND l.status NOT IN ('paid', 'cancelled')
    ORDER BY l.date DESC LIMIT 1`,
    [userId, personId]
  );
  const loan = loanRows[0];
  if (loan && Number(loan.pending) > 0) {
    const pay = Math.min(Number(amount), Number(loan.pending));
    await client.query(
      `INSERT INTO loan_payments (loan_id, account_id, date, amount, principal, interest, notes)
       VALUES ($1, NULL, $2, $3, $3, 0, $4)`,
      [loan.id, date, pay, `Pago desde gasto #${expenseId}`]
    );
    await refreshLoanStatus(client, loan.id);
    return { type: 'loan', id: loan.id, amount: pay };
  }

  const { rows: debtRows } = await client.query(
    `SELECT d.*,
       GREATEST(d.amount - COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp WHERE dp.debt_id = d.id), 0), 0) AS pending
     FROM debts d
    WHERE d.user_id = $1 AND d.person_id = $2 AND d.status NOT IN ('paid', 'cancelled')
    ORDER BY d.start_date DESC LIMIT 1`,
    [userId, personId]
  );
  const debt = debtRows[0];
  if (debt && Number(debt.pending) > 0) {
    const pay = Math.min(Number(amount), Number(debt.pending));
    await client.query(
      `INSERT INTO debt_payments (debt_id, account_id, date, amount, notes)
       VALUES ($1, NULL, $2, $3, $4)`,
      [debt.id, date, pay, `Pago desde gasto #${expenseId}`]
    );
    await refreshDebtStatus(client, debt.id);
    return { type: 'debt', id: debt.id, amount: pay };
  }

  return null;
}

export const createExpense = asyncHandler(async (req, res) => {
  const userId = targetUserIdForWrite(req, req.body.user_id);
  const {
    account_id, category_id, subcategory_id, date, description, amount, payment_method, merchant, is_recurring = false, notes,
    person_id = null, is_payment_to_person = false,
  } = req.body;

  const expense = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO expenses (user_id, account_id, category_id, subcategory_id, date, description, amount, payment_method, merchant, is_recurring, notes, person_id, is_payment_to_person)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [userId, account_id, category_id || null, subcategory_id || null, date, description || null, amount,
        payment_method || null, merchant || null, is_recurring, notes || null, person_id || null, Boolean(is_payment_to_person)]
    );
    const created = rows[0];

    if (person_id && is_payment_to_person) {
      await applyPaymentToPerson(client, userId, person_id, amount, date, created.id);
    }

    await recomputeAllBalances(client, userId);
    await logAudit(client, { userId: req.user.id, action: 'create', module: 'gastos', recordId: created.id, newData: created, req });
    return created;
  });
  res.status(201).json({ expense });
});

export const updateExpense = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const id = req.params.id;
  const {
    account_id, category_id, subcategory_id, date, description, amount, payment_method, merchant, is_recurring, notes,
    person_id, is_payment_to_person,
  } = req.body;

  const expense = await withTransaction(async (client) => {
    const { rows: oldRows } = await client.query('SELECT * FROM expenses WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!oldRows.length) {
      const e = new Error('Gasto no encontrado.');
      e.status = 404;
      throw e;
    }
    const old = oldRows[0];
    const { rows } = await client.query(
      `UPDATE expenses SET
         account_id = COALESCE($2, account_id),
         category_id = $3,
         subcategory_id = $4,
         date = COALESCE($5, date),
         description = $6,
         amount = COALESCE($7, amount),
         payment_method = $8,
         merchant = $9,
         is_recurring = COALESCE($10, is_recurring),
         notes = $11,
         person_id = $12,
         is_payment_to_person = COALESCE($13, is_payment_to_person),
         updated_at = now()
       WHERE id = $1 RETURNING *`,
      [id, account_id ?? old.account_id, category_id ?? old.category_id, subcategory_id ?? old.subcategory_id,
        date ?? old.date, description ?? old.description, amount ?? old.amount, payment_method ?? old.payment_method,
        merchant ?? old.merchant, is_recurring ?? old.is_recurring, notes ?? old.notes,
        person_id ?? old.person_id, is_payment_to_person ?? old.is_payment_to_person]
    );
    await recomputeAllBalances(client, userId);
    await logAudit(client, { userId: req.user.id, action: 'update', module: 'gastos', recordId: id, oldData: old, newData: rows[0], req });
    return rows[0];
  });
  res.json({ expense });
});

export const removeExpense = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const id = req.params.id;
  await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM expenses WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!rows.length) {
      const e = new Error('Gasto no encontrado.');
      e.status = 404;
      throw e;
    }

    // Revertir los pagos de préstamo/deuda generados desde este gasto.
    const note = `Pago desde gasto #${id}`;
    const { rows: lpRows } = await client.query('SELECT DISTINCT loan_id FROM loan_payments WHERE notes = $1', [note]);
    for (const r of lpRows) {
      await client.query('DELETE FROM loan_payments WHERE notes = $1 AND loan_id = $2', [note, r.loan_id]);
      await refreshLoanStatus(client, r.loan_id);
    }
    const { rows: dpRows } = await client.query('SELECT DISTINCT debt_id FROM debt_payments WHERE notes = $1', [note]);
    for (const r of dpRows) {
      await client.query('DELETE FROM debt_payments WHERE notes = $1 AND debt_id = $2', [note, r.debt_id]);
      await refreshDebtStatus(client, r.debt_id);
    }

    await client.query('DELETE FROM expenses WHERE id = $1', [id]);
    await recomputeAllBalances(client, userId);
    await logAudit(client, { userId: req.user.id, action: 'delete', module: 'gastos', recordId: id, oldData: rows[0], req });
  });
  res.json({ message: 'Gasto eliminado.' });
});

export const exportExpenses = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const conditions = ['e.user_id = $1'];
  const params = [userId];
  buildFilters(req, userId, params, conditions);
  const where = `WHERE ${conditions.join(' AND ')}`;
  const { rows } = await query(`${SELECT} ${where} ORDER BY e.date DESC`, params);

  const headers = [
    { key: 'date', label: 'Fecha' },
    { key: 'description', label: 'Descripción' },
    { key: 'category_name', label: 'Categoría' },
    { key: 'subcategory_name', label: 'Subcategoría' },
    { key: 'account_name', label: 'Cuenta' },
    { key: 'payment_method', label: 'Método' },
    { key: 'merchant', label: 'Comercio' },
    { key: 'amount', label: 'Valor' },
  ];
  const format = req.query.format || 'csv';
  const file = await exportData({ format, rows, headers, title: 'Gastos', filename: `gastos_${Date.now()}` });
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.send(file.buffer);
});
