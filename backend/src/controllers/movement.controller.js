import { query } from '../config/db.js';
import { asyncHandler, buildPagination } from '../utils/helpers.js';
import { targetUserIdForRead } from '../services/scope.js';
import { exportData } from '../services/export.js';

export const listMovements = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const { page, limit, offset } = buildPagination(req.query);

  const conditions = ['m.user_id = $1'];
  const params = [userId];
  let n = 1;

  if (req.query.from) { params.push(req.query.from); conditions.push(`m.date >= $${++n}`); }
  if (req.query.to) { params.push(req.query.to); conditions.push(`m.date <= $${++n}`); }
  if (req.query.type) { params.push(req.query.type); conditions.push(`m.type = $${++n}`); }
  if (req.query.account) { params.push(req.query.account); conditions.push(`m.account ILIKE $${++n}`); }
  if (req.query.search) { params.push(`%${req.query.search}%`); conditions.push(`(m.description ILIKE $${++n} OR m.category ILIKE $${++n})`); }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const orderCol = ['date', 'amount', 'type', 'created_at'].includes(req.query.sort) ? req.query.sort : 'date';
  const orderDir = req.query.order === 'asc' ? 'ASC' : 'DESC';

  const { rows: countRows } = await query(`SELECT count(*)::int AS total FROM movements m ${where}`, params);
  const { rows } = await query(
    `SELECT * FROM movements m ${where} ORDER BY m.${orderCol} ${orderDir}, m.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  res.json({ data: rows, total: countRows[0].total, page, limit });
});

export const exportMovements = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const conditions = ['m.user_id = $1'];
  const params = [userId];
  let n = 1;
  if (req.query.from) { params.push(req.query.from); conditions.push(`m.date >= $${++n}`); }
  if (req.query.to) { params.push(req.query.to); conditions.push(`m.date <= $${++n}`); }
  if (req.query.type) { params.push(req.query.type); conditions.push(`m.type = $${++n}`); }
  const where = `WHERE ${conditions.join(' AND ')}`;
  const { rows } = await query(`SELECT * FROM movements m ${where} ORDER BY m.date DESC`, params);

  const headers = [
    { key: 'date', label: 'Fecha' },
    { key: 'type_label', label: 'Tipo' },
    { key: 'description', label: 'Descripción' },
    { key: 'category', label: 'Categoría' },
    { key: 'account', label: 'Cuenta' },
    { key: 'amount', label: 'Valor' },
    { key: 'status', label: 'Estado' },
  ];
  const format = req.query.format || 'csv';
  const file = await exportData({ format, rows, headers, title: 'Movimientos', filename: `movimientos_${Date.now()}` });
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.send(file.buffer);
});
