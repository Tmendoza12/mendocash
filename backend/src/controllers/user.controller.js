import { query, withTransaction } from '../config/db.js';
import { hashPassword } from '../utils/password.js';
import { asyncHandler, buildPagination } from '../utils/helpers.js';
import { logAudit } from '../services/audit.js';

const USER_COLUMNS =
  'id, full_name, email, phone, avatar_url, is_active, last_login_at, created_at';

async function attachRoles(users) {
  if (!users.length) return users;
  const ids = users.map((u) => u.id);
  const { rows } = await query(
    `SELECT ur.user_id, r.id, r.name, r.slug
       FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ANY($1::int[])`,
    [ids]
  );
  const map = {};
  for (const r of rows) {
    if (!map[r.user_id]) map[r.user_id] = [];
    map[r.user_id].push({ id: r.id, name: r.name, slug: r.slug });
  }
  return users.map((u) => ({ ...u, roles: map[u.id] || [] }));
}

export const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, offset } = buildPagination(req.query);
  const search = req.query.search || '';
  const where = search ? 'WHERE full_name ILIKE $1 OR email ILIKE $1' : '';
  const params = search ? [`%${search}%`] : [];

  const { rows: countRows } = await query(
    `SELECT count(*)::int AS total FROM users ${where}`,
    params
  );
  const { rows } = await query(
    `SELECT ${USER_COLUMNS} FROM users ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  const total = countRows[0].total;
  res.json({ data: await attachRoles(rows), total, page, limit });
});

export const getUser = asyncHandler(async (req, res) => {
  const { rows } = await query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ message: 'Usuario no encontrado.' });
  const [user] = await attachRoles(rows);
  res.json({ user });
});

export const createUser = asyncHandler(async (req, res) => {
  const { full_name, email, phone, avatar_url, roles = [], password } = req.body;
  const exists = await query('SELECT 1 FROM users WHERE email = $1', [email]);
  if (exists.rows.length) {
    return res.status(400).json({ message: 'Ya existe un usuario con ese correo.' });
  }
  const password_hash = await hashPassword(password);
  const created = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO users (full_name, email, phone, avatar_url, password_hash)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${USER_COLUMNS}`,
      [full_name, email, phone || null, avatar_url || null, password_hash]
    );
    const user = rows[0];
    for (const roleId of roles) {
      await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [user.id, roleId]);
    }
    await logAudit(client, { userId: req.user.id, action: 'create', module: 'usuarios', recordId: user.id, newData: user, req });
    return user;
  });
  res.status(201).json({ user: created });
});

export const updateUser = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const { full_name, email, phone, avatar_url, is_active, roles, password } = req.body;

  if (id == req.user.id && is_active === false) {
    return res.status(400).json({ message: 'No puedes desactivarte a ti mismo.' });
  }

  const updated = await withTransaction(async (client) => {
    const { rows: oldRows } = await client.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
    if (!oldRows.length) {
      const e = new Error('Usuario no encontrado.');
      e.status = 404;
      throw e;
    }
    const old = oldRows[0];

    const { rows } = await client.query(
      `UPDATE users SET
         full_name = COALESCE($2, full_name),
         email = COALESCE($3, email),
         phone = $4,
         avatar_url = $5,
         is_active = COALESCE($6, is_active),
         updated_at = now()
       WHERE id = $1 RETURNING ${USER_COLUMNS}`,
      [id, full_name ?? old.full_name, email ?? old.email, phone ?? old.phone, avatar_url ?? old.avatar_url, is_active ?? old.is_active]
    );
    const user = rows[0];

    if (password) {
      const password_hash = await hashPassword(password);
      await client.query('UPDATE users SET password_hash = $2 WHERE id = $1', [id, password_hash]);
    }
    if (Array.isArray(roles)) {
      await client.query('DELETE FROM user_roles WHERE user_id = $1', [id]);
      for (const roleId of roles) {
        await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, roleId]);
      }
    }
    await logAudit(client, { userId: req.user.id, action: 'update', module: 'usuarios', recordId: id, oldData: old, newData: user, req });
    return user;
  });
  res.json({ user: updated });
});

export const removeUser = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (id == req.user.id) {
    return res.status(400).json({ message: 'No puedes eliminar tu propio usuario.' });
  }
  await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT id FROM users WHERE id = $1', [id]);
    if (!rows.length) {
      const e = new Error('Usuario no encontrado.');
      e.status = 404;
      throw e;
    }
    await client.query('DELETE FROM users WHERE id = $1', [id]);
    await logAudit(client, { userId: req.user.id, action: 'delete', module: 'usuarios', recordId: id, req });
  });
  res.json({ message: 'Usuario eliminado.' });
});

export const changeStatus = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const { is_active } = req.body;
  if (id == req.user.id && is_active === false) {
    return res.status(400).json({ message: 'No puedes desactivarte a ti mismo.' });
  }
  const { rows } = await query(
    `UPDATE users SET is_active = $2, updated_at = now() WHERE id = $1 RETURNING ${USER_COLUMNS}`,
    [id, is_active]
  );
  if (!rows.length) return res.status(404).json({ message: 'Usuario no encontrado.' });
  await withTransaction(async (client) => {
    await logAudit(client, { userId: req.user.id, action: is_active ? 'activate' : 'deactivate', module: 'usuarios', recordId: id, req });
  });
  res.json({ user: rows[0] });
});
