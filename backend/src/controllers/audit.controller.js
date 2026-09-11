import { query } from '../config/db.js';
import { asyncHandler, buildPagination } from '../utils/helpers.js';

export const listAuditLogs = asyncHandler(async (req, res) => {
  const { page, limit, offset } = buildPagination(req.query);
  const conditions = [];
  const params = [];
  let n = 0;

  if (req.query.module) { params.push(req.query.module); conditions.push(`a.module = $${++n}`); }
  if (req.query.action) { params.push(req.query.action); conditions.push(`a.action = $${++n}`); }
  if (req.query.user_id) { params.push(req.query.user_id); conditions.push(`a.user_id = $${++n}`); }
  if (req.query.from) { params.push(req.query.from); conditions.push(`a.created_at::date >= $${++n}`); }
  if (req.query.to) { params.push(req.query.to); conditions.push(`a.created_at::date <= $${++n}`); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows: countRows } = await query(`SELECT count(*)::int AS total FROM audit_logs a ${where}`, params);
  const { rows } = await query(
    `SELECT a.*, u.full_name AS user_name, u.email AS user_email
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
       ${where} ORDER BY a.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  res.json({ data: rows, total: countRows[0].total, page, limit });
});
