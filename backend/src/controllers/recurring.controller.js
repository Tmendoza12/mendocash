import { query, withTransaction } from '../config/db.js';
import { asyncHandler } from '../utils/helpers.js';
import { targetUserIdForRead, targetUserIdForWrite } from '../services/scope.js';
import { recomputeAllBalances } from '../services/balance.js';
import { logAudit } from '../services/audit.js';

const SELECT = `
  SELECT r.*, c.name AS category_name, a.name AS account_name
    FROM recurring_expenses r
    LEFT JOIN categories c ON c.id = r.category_id
    LEFT JOIN accounts a ON a.id = r.account_id`;

export const listRecurring = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const { rows } = await query(`${SELECT} WHERE r.user_id = $1 ORDER BY r.next_due_date ASC NULLS LAST`, [userId]);
  res.json({ data: rows });
});

export const createRecurring = asyncHandler(async (req, res) => {
  const userId = targetUserIdForWrite(req, req.body.user_id);
  const { name, amount, category_id, account_id, frequency, next_due_date, end_date, status = 'active' } = req.body;
  const { rows } = await query(
    `INSERT INTO recurring_expenses (user_id, name, amount, category_id, account_id, frequency, next_due_date, end_date, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [userId, name, amount, category_id || null, account_id || null, frequency, next_due_date || null, end_date || null, status]
  );
  res.status(201).json({ recurring: rows[0] });
});

export const updateRecurring = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const id = req.params.id;
  const { name, amount, category_id, account_id, frequency, next_due_date, end_date, status } = req.body;
  const { rows: oldRows } = await query('SELECT * FROM recurring_expenses WHERE id = $1 AND user_id = $2', [id, userId]);
  if (!oldRows.length) return res.status(404).json({ message: 'Gasto recurrente no encontrado.' });
  const old = oldRows[0];
  const { rows } = await query(
    `UPDATE recurring_expenses SET
       name = COALESCE($2, name), amount = COALESCE($3, amount), category_id = $4, account_id = $5,
       frequency = COALESCE($6, frequency), next_due_date = $7, end_date = $8, status = COALESCE($9, status)
     WHERE id = $1 RETURNING *`,
    [id, name ?? old.name, amount ?? old.amount, category_id ?? old.category_id, account_id ?? old.account_id,
      frequency ?? old.frequency, next_due_date ?? old.next_due_date, end_date ?? old.end_date, status ?? old.status]
  );
  await withTransaction(async (client) => {
    await logAudit(client, { userId: req.user.id, action: 'update', module: 'recurrentes', recordId: id, oldData: old, newData: rows[0], req });
  });
  res.json({ recurring: rows[0] });
});

export const removeRecurring = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const id = req.params.id;
  await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM recurring_expenses WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!rows.length) {
      const e = new Error('Gasto recurrente no encontrado.');
      e.status = 404;
      throw e;
    }
    await client.query('DELETE FROM recurring_expenses WHERE id = $1', [id]);
    await logAudit(client, { userId: req.user.id, action: 'delete', module: 'recurrentes', recordId: id, oldData: rows[0], req });
  });
  res.json({ message: 'Gasto recurrente eliminado.' });
});

function nextDateFromFrequency(dateStr, frequency) {
  const d = new Date(`${dateStr}T00:00:00`);
  switch (frequency) {
    case 'daily': d.setDate(d.getDate() + 1); break;
    case 'weekly': d.setDate(d.getDate() + 7); break;
    case 'biweekly': d.setDate(d.getDate() + 15); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break;
    default: d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString().slice(0, 10);
}

export const generateRecurring = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const id = req.params.id;

  const result = await withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT * FROM recurring_expenses WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (!rows.length) {
      const e = new Error('Gasto recurrente no encontrado.');
      e.status = 404;
      throw e;
    }
    const r = rows[0];
    if (r.status !== 'active' || !r.next_due_date) {
      const e = new Error('El gasto recurrente no está activo o no tiene próxima fecha.');
      e.status = 400;
      throw e;
    }
    const { rows: expenseRows } = await client.query(
      `INSERT INTO expenses (user_id, account_id, category_id, date, description, amount, payment_method, is_recurring, notes)
       VALUES ($1, $2, $3, $4, $5, $6, 'Automático', TRUE, 'Generado desde gasto recurrente')
       RETURNING *`,
      [userId, r.account_id, r.category_id, r.next_due_date, r.name, r.amount]
    );
    const nextDate = nextDateFromFrequency(r.next_due_date, r.frequency);
    const finished = r.end_date && nextDate > r.end_date;
    await client.query(
      'UPDATE recurring_expenses SET next_due_date = $2, status = $3 WHERE id = $1',
      [id, finished ? null : nextDate, finished ? 'finished' : 'active']
    );
    await recomputeAllBalances(client, userId);
    await logAudit(client, { userId: req.user.id, action: 'generate', module: 'recurrentes', recordId: id, newData: expenseRows[0], req });
    return expenseRows[0];
  });
  res.status(201).json({ expense: result });
});
