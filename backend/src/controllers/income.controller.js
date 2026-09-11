import { query, withTransaction } from '../config/db.js';
import { asyncHandler, buildPagination } from '../utils/helpers.js';
import { targetUserIdForRead, targetUserIdForWrite } from '../services/scope.js';
import { recomputeAllBalances } from '../services/balance.js';
import { logAudit } from '../services/audit.js';

const SELECT = `
  SELECT i.*, a.name AS account_name, c.name AS category_name
    FROM income i
    LEFT JOIN accounts a ON a.id = i.account_id
    LEFT JOIN categories c ON c.id = i.category_id`;

export const listIncome = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const { page, limit, offset } = buildPagination(req.query);
  const conditions = ['i.user_id = $1'];
  const params = [userId];
  let n = 1;

  if (req.query.from) { params.push(req.query.from); conditions.push(`i.date >= $${++n}`); }
  if (req.query.to) { params.push(req.query.to); conditions.push(`i.date <= $${++n}`); }
  if (req.query.account_id) { params.push(req.query.account_id); conditions.push(`i.account_id = $${++n}`); }
  if (req.query.category_id) { params.push(req.query.category_id); conditions.push(`i.category_id = $${++n}`); }
  if (req.query.search) { params.push(`%${req.query.search}%`); conditions.push(`i.description ILIKE $${++n}`); }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const { rows: countRows } = await query(`SELECT count(*)::int AS total FROM income i ${where}`, params);
  const { rows } = await query(
    `${SELECT} ${where} ORDER BY i.date DESC, i.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  res.json({ data: rows, total: countRows[0].total, page, limit });
});

export const getIncome = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const { rows } = await query(`${SELECT} WHERE i.id = $1 AND i.user_id = $2`, [req.params.id, userId]);
  if (!rows.length) return res.status(404).json({ message: 'Ingreso no encontrado.' });
  res.json({ income: rows[0] });
});

export const createIncome = asyncHandler(async (req, res) => {
  const userId = targetUserIdForWrite(req, req.body.user_id);
  const {
    account_id, category_id, date, description, amount, income_method, income_type, is_recurring = false, notes,
  } = req.body;

  const income = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO income (user_id, account_id, category_id, date, description, amount, income_method, income_type, is_recurring, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [userId, account_id, category_id || null, date, description || null, amount, income_method || null, income_type || null, is_recurring, notes || null]
    );
    await recomputeAllBalances(client, userId);
    await logAudit(client, { userId: req.user.id, action: 'create', module: 'ingresos', recordId: rows[0].id, newData: rows[0], req });
    return rows[0];
  });
  res.status(201).json({ income });
});

export const updateIncome = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const id = req.params.id;
  const { account_id, category_id, date, description, amount, income_method, income_type, is_recurring, notes } = req.body;

  const income = await withTransaction(async (client) => {
    const { rows: oldRows } = await client.query('SELECT * FROM income WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!oldRows.length) {
      const e = new Error('Ingreso no encontrado.');
      e.status = 404;
      throw e;
    }
    const old = oldRows[0];
    const { rows } = await client.query(
      `UPDATE income SET
         account_id = COALESCE($2, account_id),
         category_id = $3,
         date = COALESCE($4, date),
         description = $5,
         amount = COALESCE($6, amount),
         income_method = $7,
         income_type = $8,
         is_recurring = COALESCE($9, is_recurring),
         notes = $10,
         updated_at = now()
       WHERE id = $1 RETURNING *`,
      [id, account_id ?? old.account_id, category_id ?? old.category_id, date ?? old.date, description ?? old.description,
        amount ?? old.amount, income_method ?? old.income_method, income_type ?? old.income_type, is_recurring ?? old.is_recurring, notes ?? old.notes]
    );
    await recomputeAllBalances(client, userId);
    await logAudit(client, { userId: req.user.id, action: 'update', module: 'ingresos', recordId: id, oldData: old, newData: rows[0], req });
    return rows[0];
  });
  res.json({ income });
});

export const removeIncome = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const id = req.params.id;
  await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM income WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!rows.length) {
      const e = new Error('Ingreso no encontrado.');
      e.status = 404;
      throw e;
    }
    await client.query('DELETE FROM income WHERE id = $1', [id]);
    await recomputeAllBalances(client, userId);
    await logAudit(client, { userId: req.user.id, action: 'delete', module: 'ingresos', recordId: id, oldData: rows[0], req });
  });
  res.json({ message: 'Ingreso eliminado.' });
});
