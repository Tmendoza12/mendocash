import { query, withTransaction } from '../config/db.js';
import { asyncHandler, buildPagination } from '../utils/helpers.js';
import { targetUserIdForRead, targetUserIdForWrite } from '../services/scope.js';
import { recomputeAllBalances } from '../services/balance.js';
import { logAudit } from '../services/audit.js';
import { exportData } from '../services/export.js';

const SELECT = `
  SELECT e.*, a.name AS account_name, c.name AS category_name, s.name AS subcategory_name
    FROM expenses e
    LEFT JOIN accounts a ON a.id = e.account_id
    LEFT JOIN categories c ON c.id = e.category_id
    LEFT JOIN subcategories s ON s.id = e.subcategory_id`;

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

export const createExpense = asyncHandler(async (req, res) => {
  const userId = targetUserIdForWrite(req, req.body.user_id);
  const {
    account_id, category_id, subcategory_id, date, description, amount, payment_method, merchant, is_recurring = false, notes,
  } = req.body;

  const expense = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO expenses (user_id, account_id, category_id, subcategory_id, date, description, amount, payment_method, merchant, is_recurring, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [userId, account_id, category_id || null, subcategory_id || null, date, description || null, amount,
        payment_method || null, merchant || null, is_recurring, notes || null]
    );
    await recomputeAllBalances(client, userId);
    await logAudit(client, { userId: req.user.id, action: 'create', module: 'gastos', recordId: rows[0].id, newData: rows[0], req });
    return rows[0];
  });
  res.status(201).json({ expense });
});

export const updateExpense = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const id = req.params.id;
  const {
    account_id, category_id, subcategory_id, date, description, amount, payment_method, merchant, is_recurring, notes,
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
         updated_at = now()
       WHERE id = $1 RETURNING *`,
      [id, account_id ?? old.account_id, category_id ?? old.category_id, subcategory_id ?? old.subcategory_id,
        date ?? old.date, description ?? old.description, amount ?? old.amount, payment_method ?? old.payment_method,
        merchant ?? old.merchant, is_recurring ?? old.is_recurring, notes ?? old.notes]
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
