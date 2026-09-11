import { verifyToken } from '../utils/jwt.js';
import { query } from '../config/db.js';
import { asyncHandler } from '../utils/helpers.js';

async function loadPermissions(userId) {
  const { rows } = await query(
    `SELECT DISTINCT p.name
       FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       JOIN user_roles ur ON ur.role_id = rp.role_id
      WHERE ur.user_id = $1`,
    [userId]
  );
  return rows.map((r) => r.name);
}

export const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ message: 'No autenticado.' });
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return res.status(401).json({ message: 'Sesión inválida o expirada.' });
  }

  const { rows: sessions } = await query(
    'SELECT * FROM sessions WHERE id = $1',
    [payload.sid]
  );
  const session = sessions[0];
  if (!session || session.revoked_at) {
    return res.status(401).json({ message: 'Sesión revocada.' });
  }
  if (new Date(session.expires_at) < new Date()) {
    return res.status(401).json({ message: 'Sesión expirada.' });
  }

  const { rows: users } = await query(
    'SELECT id, full_name, email, phone, avatar_url, is_active, last_login_at, created_at FROM users WHERE id = $1',
    [payload.sub]
  );
  const user = users[0];
  if (!user || !user.is_active) {
    return res.status(401).json({ message: 'Usuario inactivo o no encontrado.' });
  }

  const permissions = await loadPermissions(user.id);
  req.user = user;
  req.permissions = permissions;
  req.session = session;
  next();
});
