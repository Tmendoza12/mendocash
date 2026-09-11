import { query, withTransaction } from '../config/db.js';
import { asyncHandler } from '../utils/helpers.js';
import { targetUserIdForRead, targetUserIdForWrite } from '../services/scope.js';
import { logAudit } from '../services/audit.js';

export const listPeople = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const search = req.query.search || '';
  const where = search ? 'AND full_name ILIKE $2' : '';
  const params = search ? [userId, `%${search}%`] : [userId];
  const { rows } = await query(
    `SELECT p.*,
            (SELECT count(*)::int FROM loans l WHERE l.person_id = p.id) AS loans_count
       FROM people p WHERE p.user_id = $1 ${where} ORDER BY p.full_name`,
    params
  );
  res.json({ data: rows });
});

export const createPerson = asyncHandler(async (req, res) => {
  const userId = targetUserIdForWrite(req, req.body.user_id);
  const { full_name, phone, email, relation_type, notes, status = 'active' } = req.body;
  const { rows } = await query(
    `INSERT INTO people (user_id, full_name, phone, email, relation_type, notes, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [userId, full_name, phone || null, email || null, relation_type || null, notes || null, status]
  );
  res.status(201).json({ person: rows[0] });
});

export const updatePerson = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const id = req.params.id;
  const { full_name, phone, email, relation_type, notes, status } = req.body;
  const { rows: oldRows } = await query('SELECT * FROM people WHERE id = $1 AND user_id = $2', [id, userId]);
  if (!oldRows.length) return res.status(404).json({ message: 'Persona no encontrada.' });
  const old = oldRows[0];
  const { rows } = await query(
    `UPDATE people SET
       full_name = COALESCE($2, full_name), phone = $3, email = $4, relation_type = $5, notes = $6, status = COALESCE($7, status)
     WHERE id = $1 RETURNING *`,
    [id, full_name ?? old.full_name, phone ?? old.phone, email ?? old.email, relation_type ?? old.relation_type, notes ?? old.notes, status ?? old.status]
  );
  await withTransaction(async (client) => {
    await logAudit(client, { userId: req.user.id, action: 'update', module: 'personas', recordId: id, oldData: old, newData: rows[0], req });
  });
  res.json({ person: rows[0] });
});

export const removePerson = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const id = req.params.id;
  const { rows: usage } = await query('SELECT count(*)::int AS c FROM loans WHERE person_id = $1', [id]);
  if (usage[0].c > 0) {
    return res.status(400).json({ message: 'La persona tiene préstamos asociados.' });
  }
  await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM people WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!rows.length) {
      const e = new Error('Persona no encontrada.');
      e.status = 404;
      throw e;
    }
    await client.query('DELETE FROM people WHERE id = $1', [id]);
    await logAudit(client, { userId: req.user.id, action: 'delete', module: 'personas', recordId: id, oldData: rows[0], req });
  });
  res.json({ message: 'Persona eliminada.' });
});
