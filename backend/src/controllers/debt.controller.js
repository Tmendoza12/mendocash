import { query, withTransaction } from '../config/db.js';
import { asyncHandler } from '../utils/helpers.js';
import { targetUserIdForRead, targetUserIdForWrite } from '../services/scope.js';
import { recomputeAllBalances } from '../services/balance.js';
import { logAudit } from '../services/audit.js';

const DEBT_SELECT = `
  SELECT d.*,
         COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp WHERE dp.debt_id = d.id), 0) AS paid,
         (SELECT count(*)::int FROM debt_payments dp WHERE dp.debt_id = d.id) AS payments_count,
         (SELECT MAX(dp.date) FROM debt_payments dp WHERE dp.debt_id = d.id) AS last_payment_date
    FROM debts d`;

function summarizeDebt(d) {
  const pending = Math.max(0, Number(d.amount) - Number(d.paid));
  return { ...d, pending };
}

export const listDebts = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const conditions = ['d.user_id = $1'];
  const params = [userId];
  let n = 1;
  if (req.query.status) { params.push(req.query.status); conditions.push(`d.status = $${++n}`); }
  const where = `WHERE ${conditions.join(' AND ')}`;
  const { rows } = await query(`${DEBT_SELECT} ${where} ORDER BY d.due_date ASC NULLS LAST`, params);
  res.json({ data: rows.map(summarizeDebt) });
});

export const getDebt = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const { rows } = await query(`${DEBT_SELECT} WHERE d.id = $1 AND d.user_id = $2`, [req.params.id, userId]);
  if (!rows.length) return res.status(404).json({ message: 'Deuda no encontrada.' });
  const { rows: payments } = await query(
    `SELECT dp.*, a.name AS account_name FROM debt_payments dp
       LEFT JOIN accounts a ON a.id = dp.account_id
      WHERE dp.debt_id = $1 ORDER BY dp.date, dp.id`,
    [req.params.id]
  );
  res.json({ debt: summarizeDebt(rows[0]), payments });
});

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

export const createDebt = asyncHandler(async (req, res) => {
  const userId = targetUserIdForWrite(req, req.body.user_id);
  const {
    creditor, concept, amount, start_date, due_date, interest_rate = 0,
    num_installments = 1, installment_amount = 0, status = 'pending',
  } = req.body;

  const { rows } = await query(
    `INSERT INTO debts (user_id, creditor, concept, amount, start_date, due_date, interest_rate, num_installments, installment_amount, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [userId, creditor, concept || null, amount, start_date, due_date || null, interest_rate, num_installments, installment_amount, status]
  );
  res.status(201).json({ debt: rows[0] });
});

export const updateDebt = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const id = req.params.id;
  const {
    creditor, concept, amount, start_date, due_date, interest_rate, num_installments, installment_amount, status,
  } = req.body;

  const debt = await withTransaction(async (client) => {
    const { rows: oldRows } = await client.query('SELECT * FROM debts WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!oldRows.length) {
      const e = new Error('Deuda no encontrada.');
      e.status = 404;
      throw e;
    }
    const old = oldRows[0];
    const { rows } = await client.query(
      `UPDATE debts SET
         creditor = COALESCE($2, creditor), concept = $3, amount = COALESCE($4, amount),
         start_date = COALESCE($5, start_date), due_date = $6, interest_rate = COALESCE($7, interest_rate),
         num_installments = COALESCE($8, num_installments), installment_amount = COALESCE($9, installment_amount),
         status = COALESCE($10, status), updated_at = now()
       WHERE id = $1 RETURNING *`,
      [id, creditor ?? old.creditor, concept ?? old.concept, amount ?? old.amount, start_date ?? old.start_date,
        due_date ?? old.due_date, interest_rate ?? old.interest_rate, num_installments ?? old.num_installments,
        installment_amount ?? old.installment_amount, status ?? old.status]
    );
    await refreshDebtStatus(client, id);
    await logAudit(client, { userId: req.user.id, action: 'update', module: 'deudas', recordId: id, oldData: old, newData: rows[0], req });
    return rows[0];
  });
  res.json({ debt });
});

export const removeDebt = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const id = req.params.id;
  await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM debts WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!rows.length) {
      const e = new Error('Deuda no encontrada.');
      e.status = 404;
      throw e;
    }
    await client.query('DELETE FROM debts WHERE id = $1', [id]);
    await recomputeAllBalances(client, userId);
    await logAudit(client, { userId: req.user.id, action: 'delete', module: 'deudas', recordId: id, oldData: rows[0], req });
  });
  res.json({ message: 'Deuda eliminada.' });
});

export const createDebtPayment = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const debtId = req.params.id;
  const { date, amount, account_id, notes } = req.body;

  const payment = await withTransaction(async (client) => {
    const { rows: debtRows } = await client.query(
      `SELECT d.*, COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp WHERE dp.debt_id = d.id), 0) AS paid
         FROM debts d WHERE d.id = $1 AND d.user_id = $2`,
      [debtId, userId]
    );
    if (!debtRows.length) {
      const e = new Error('Deuda no encontrada.');
      e.status = 404;
      throw e;
    }
    const pending = Math.max(0, Number(debtRows[0].amount) - Number(debtRows[0].paid));
    if (amount > pending + 0.001) {
      const e = new Error('El pago supera el saldo pendiente de la deuda.');
      e.status = 400;
      throw e;
    }
    const { rows } = await client.query(
      `INSERT INTO debt_payments (debt_id, account_id, date, amount, notes) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [debtId, account_id || null, date, amount, notes || null]
    );
    await recomputeAllBalances(client, userId);
    await refreshDebtStatus(client, debtId);
    await logAudit(client, { userId: req.user.id, action: 'create_payment', module: 'deudas', recordId: debtId, newData: rows[0], req });
    return rows[0];
  });
  res.status(201).json({ payment });
});

export const removeDebtPayment = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const debtId = req.params.id;
  const paymentId = req.params.paymentId;
  await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT dp.* FROM debt_payments dp JOIN debts d ON d.id = dp.debt_id
        WHERE dp.id = $1 AND d.id = $2 AND d.user_id = $3`,
      [paymentId, debtId, userId]
    );
    if (!rows.length) {
      const e = new Error('Pago no encontrado.');
      e.status = 404;
      throw e;
    }
    await client.query('DELETE FROM debt_payments WHERE id = $1', [paymentId]);
    await recomputeAllBalances(client, userId);
    await refreshDebtStatus(client, debtId);
    await logAudit(client, { userId: req.user.id, action: 'delete_payment', module: 'deudas', recordId: debtId, oldData: rows[0], req });
  });
  res.json({ message: 'Pago eliminado.' });
});
