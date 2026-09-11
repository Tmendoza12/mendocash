import { query, withTransaction } from '../config/db.js';
import { asyncHandler } from '../utils/helpers.js';
import { logAudit } from '../services/audit.js';

export const listRoles = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT r.id, r.name, r.slug, r.description, r.is_system, r.created_at,
            (SELECT count(*)::int FROM role_permissions rp WHERE rp.role_id = r.id) AS permissions_count,
            (SELECT count(*)::int FROM user_roles ur WHERE ur.role_id = r.id) AS users_count
       FROM roles r ORDER BY r.id`
  );
  res.json({ data: rows });
});

export const getRole = asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT * FROM roles WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ message: 'Rol no encontrado.' });
  const { rows: perms } = await query(
    `SELECT p.id, p.name, p.module FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id WHERE rp.role_id = $1`,
    [req.params.id]
  );
  res.json({ role: { ...rows[0], permissions: perms } });
});

export const listPermissions = asyncHandler(async (req, res) => {
  const { rows } = await query(
    'SELECT id, name, module, description FROM permissions ORDER BY module, name'
  );
  res.json({ data: rows });
});

export const createRole = asyncHandler(async (req, res) => {
  const { name, slug, description, permissions = [] } = req.body;
  const exists = await query('SELECT 1 FROM roles WHERE slug = $1', [slug]);
  if (exists.rows.length) return res.status(400).json({ message: 'Ya existe un rol con ese slug.' });

  const role = await withTransaction(async (client) => {
    const { rows } = await client.query(
      'INSERT INTO roles (name, slug, description, is_system) VALUES ($1, $2, $3, FALSE) RETURNING *',
      [name, slug, description]
    );
    for (const p of permissions) {
      await client.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [rows[0].id, p]);
    }
    await logAudit(client, { userId: req.user.id, action: 'create', module: 'roles', recordId: rows[0].id, newData: rows[0], req });
    return rows[0];
  });
  res.status(201).json({ role });
});

export const updateRole = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const { name, description, permissions } = req.body;

  const updated = await withTransaction(async (client) => {
    const { rows: oldRows } = await client.query('SELECT * FROM roles WHERE id = $1', [id]);
    if (!oldRows.length) {
      const e = new Error('Rol no encontrado.');
      e.status = 404;
      throw e;
    }
    if (oldRows[0].is_system && oldRows[0].slug === 'admin' && (name && name !== oldRows[0].name)) {
      const e = new Error('No se puede renombrar el rol de administrador del sistema.');
      e.status = 400;
      throw e;
    }
    const { rows } = await client.query(
      'UPDATE roles SET name = COALESCE($2, name), description = $3 WHERE id = $1 RETURNING *',
      [id, name ?? oldRows[0].name, description ?? oldRows[0].description]
    );
    if (Array.isArray(permissions)) {
      await client.query('DELETE FROM role_permissions WHERE role_id = $1', [id]);
      for (const p of permissions) {
        await client.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, p]);
      }
    }
    await logAudit(client, { userId: req.user.id, action: 'update', module: 'roles', recordId: id, oldData: oldRows[0], newData: rows[0], req });
    return rows[0];
  });
  res.json({ role: updated });
});

export const removeRole = asyncHandler(async (req, res) => {
  const id = req.params.id;
  await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM roles WHERE id = $1', [id]);
    if (!rows.length) {
      const e = new Error('Rol no encontrado.');
      e.status = 404;
      throw e;
    }
    if (rows[0].is_system) {
      const e = new Error('No se pueden eliminar roles del sistema.');
      e.status = 400;
      throw e;
    }
    const { rows: countRows } = await client.query('SELECT count(*)::int AS c FROM user_roles WHERE role_id = $1', [id]);
    if (countRows[0].c > 0) {
      const e = new Error('El rol tiene usuarios asignados. Reasígnalos antes de eliminar.');
      e.status = 400;
      throw e;
    }
    await client.query('DELETE FROM roles WHERE id = $1', [id]);
    await logAudit(client, { userId: req.user.id, action: 'delete', module: 'roles', recordId: id, oldData: rows[0], req });
  });
  res.json({ message: 'Rol eliminado.' });
});
