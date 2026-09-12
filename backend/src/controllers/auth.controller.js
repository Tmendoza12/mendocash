import crypto from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { query, withTransaction } from '../config/db.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { signToken } from '../utils/jwt.js';
import { asyncHandler, getIp } from '../utils/helpers.js';
import { logAudit } from '../services/audit.js';
import { env } from '../config/env.js';
import { isMailConfigured, sendPasswordResetEmail } from '../services/mail.js';

function userPayload(user, permissions, roles) {
  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    avatar_url: user.avatar_url,
    is_active: user.is_active,
    last_login_at: user.last_login_at,
    created_at: user.created_at,
    permissions,
    roles,
  };
}

async function getUserWithAccess(userId) {
  const { rows: users } = await query('SELECT * FROM users WHERE id = $1', [userId]);
  const user = users[0];
  if (!user) return null;
  const { rows: perms } = await query(
    `SELECT DISTINCT p.name FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       JOIN user_roles ur ON ur.role_id = rp.role_id WHERE ur.user_id = $1`,
    [userId]
  );
  const { rows: roles } = await query(
    `SELECT r.id, r.name, r.slug FROM roles r
       JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = $1`,
    [userId]
  );
  return { user, permissions: perms.map((p) => p.name), roles };
}

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return res.status(401).json({ message: 'Credenciales inválidas.' });
  }
  if (!user.is_active) {
    return res.status(403).json({ message: 'Usuario desactivado. Contacta al administrador.' });
  }

  const access = await getUserWithAccess(user.id);
  const token = signToken({ sub: user.id });

  const { rows: sessionRows } = await query(
    `INSERT INTO sessions (user_id, token, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, now() + interval '3650 days') RETURNING id`,
    [user.id, token, getIp(req), req.headers['user-agent']?.slice(0, 500) || null]
  );
  const session = sessionRows[0];

  // Volver a firmar el token incluyendo el id de sesión.
  const finalToken = signToken({ sub: user.id, sid: session.id });
  await query('UPDATE sessions SET token = $2 WHERE id = $1', [session.id, finalToken]);
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);

  res.json({
    token: finalToken,
    user: userPayload(access.user, access.permissions, access.roles),
  });
});

export const logout = asyncHandler(async (req, res) => {
  await query('UPDATE sessions SET revoked_at = now() WHERE id = $1', [req.session.id]);
  res.json({ message: 'Sesión cerrada.' });
});

export const me = asyncHandler(async (req, res) => {
  const access = await getUserWithAccess(req.user.id);
  res.json({ user: userPayload(access.user, access.permissions, access.roles) });
});

export const register = asyncHandler(async (req, res) => {
  const { full_name, email, password } = req.body;
  const existing = await query('SELECT 1 FROM users WHERE email = $1', [email]);
  if (existing.rows.length) {
    return res.status(400).json({ message: 'Ya existe una cuenta con ese correo.' });
  }
  const password_hash = await hashPassword(password);
  const { rows: roleRows } = await query("SELECT id FROM roles WHERE slug = 'user'");
  const { rows: created } = await query(
    `INSERT INTO users (full_name, email, password_hash) VALUES ($1, $2, $3) RETURNING *`,
    [full_name, email, password_hash]
  );
  const user = created[0];
  if (roleRows.length) {
    await query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [user.id, roleRows[0].id]);
  }
  const access = await getUserWithAccess(user.id);
  const token = signToken({ sub: user.id });
  const { rows: sessionRows } = await query(
    `INSERT INTO sessions (user_id, token, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, now() + interval '3650 days') RETURNING id`,
    [user.id, token, getIp(req), req.headers['user-agent']?.slice(0, 500) || null]
  );
  const finalToken = signToken({ sub: user.id, sid: sessionRows[0].id });
  await query('UPDATE sessions SET token = $2 WHERE id = $1', [sessionRows[0].id, finalToken]);
  res.json({ token: finalToken, user: userPayload(access.user, access.permissions, access.roles) });
});

export const googleLogin = asyncHandler(async (req, res) => {
  const { credential } = req.body;
  if (!env.googleClientId) {
    return res.status(400).json({ message: 'Google OAuth no está configurado (falta GOOGLE_CLIENT_ID).' });
  }

  const client = new OAuth2Client();
  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: env.googleClientId });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ message: 'Token de Google inválido.' });
  }

  const email = payload.email;
  if (!email) {
    return res.status(400).json({ message: 'No se pudo obtener el correo de Google.' });
  }

  const { rows: existing } = await query('SELECT * FROM users WHERE email = $1', [email]);
  let user = existing[0];
  let isNew = false;

  if (!user) {
    const randomPassword = crypto.randomBytes(16).toString('hex');
    const password_hash = await hashPassword(randomPassword);
    const { rows: created } = await query(
      `INSERT INTO users (full_name, email, password_hash, avatar_url, password_set)
       VALUES ($1, $2, $3, $4, FALSE) RETURNING *`,
      [payload.name || email, email, password_hash, payload.picture || null]
    );
    user = created[0];
    isNew = true;
    const { rows: roleRows } = await query("SELECT id FROM roles WHERE slug = 'user'");
    if (roleRows.length) {
      await query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [user.id, roleRows[0].id]);
    }
  } else if (payload.name || payload.picture) {
    await query(
      `UPDATE users SET full_name = COALESCE($2, full_name), avatar_url = COALESCE($3, avatar_url), updated_at = now()
       WHERE id = $1`,
      [user.id, payload.name || null, payload.picture || null]
    );
  }

  if (!user.is_active) {
    return res.status(403).json({ message: 'Usuario desactivado. Contacta al administrador.' });
  }

  const access = await getUserWithAccess(user.id);
  const token = signToken({ sub: user.id });
  const { rows: sessionRows } = await query(
    `INSERT INTO sessions (user_id, token, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, now() + interval '3650 days') RETURNING id`,
    [user.id, token, getIp(req), req.headers['user-agent']?.slice(0, 500) || null]
  );
  const finalToken = signToken({ sub: user.id, sid: sessionRows[0].id });
  await query('UPDATE sessions SET token = $2 WHERE id = $1', [sessionRows[0].id, finalToken]);
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);

  await withTransaction(async (client) => {
    await logAudit(client, { userId: user.id, action: 'login_google', module: 'auth', recordId: user.id, req });
  });

  res.json({
    token: finalToken,
    user: userPayload(access.user, access.permissions, access.roles),
    is_new: isNew,
    must_set_password: !user.password_set,
    google: { email, name: payload.name || null, picture: payload.picture || null },
  });
});

export const setPassword = asyncHandler(async (req, res) => {
  const { password } = req.body;
  const password_hash = await hashPassword(password);
  await query("UPDATE users SET password_hash = $2, password_set = TRUE, updated_at = now() WHERE id = $1", [req.user.id, password_hash]);
  await withTransaction(async (client) => {
    await logAudit(client, { userId: req.user.id, action: 'set_password', module: 'auth', recordId: req.user.id, req });
  });
  res.json({ message: 'Contraseña configurada correctamente.' });
});

export const changePassword = asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body;
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  const user = rows[0];
  if (!(await verifyPassword(current_password, user.password_hash))) {
    return res.status(400).json({ message: 'La contraseña actual es incorrecta.' });
  }
  const password_hash = await hashPassword(new_password);
  await withTransaction(async (client) => {
    await client.query('UPDATE users SET password_hash = $2 WHERE id = $1', [req.user.id, password_hash]);
    await client.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [req.user.id]);
    await logAudit(client, {
      userId: req.user.id, action: 'change_password', module: 'auth', recordId: req.user.id, req,
    });
  });
  res.json({ message: 'Contraseña actualizada. Debes iniciar sesión nuevamente.' });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
  const user = rows[0];
  if (!user) {
    return res.status(200).json({ message: 'Si el correo existe, se enviarán las instrucciones.' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  await query(
    `INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, now() + interval '1 hour')`,
    [user.id, token]
  );

  if (isMailConfigured()) {
    try {
      await sendPasswordResetEmail(email, token);
    } catch (err) {
      console.error('No se pudo enviar el correo:', err.message);
    }
  }

  // En desarrollo (sin SMTP configurado) se devuelve el token para facilitar las pruebas.
  res.json({
    message: isMailConfigured()
      ? 'Se envió un correo con las instrucciones para restablecer tu contraseña.'
      : 'Se generó el token de recuperación (SMTP no configurado).',
    reset_token: isMailConfigured() ? undefined : token,
  });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { token, new_password } = req.body;
  const { rows } = await query(
    'SELECT * FROM password_resets WHERE token = $1 AND used_at IS NULL AND expires_at > now()',
    [token]
  );
  const reset = rows[0];
  if (!reset) {
    return res.status(400).json({ message: 'Token inválido o expirado.' });
  }
  const password_hash = await hashPassword(new_password);
  await withTransaction(async (client) => {
    await client.query('UPDATE users SET password_hash = $2 WHERE id = $1', [reset.user_id, password_hash]);
    await client.query('UPDATE password_resets SET used_at = now() WHERE id = $1', [reset.id]);
    await client.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [reset.user_id]);
    await logAudit(client, { userId: reset.user_id, action: 'reset_password', module: 'auth', recordId: reset.user_id, req });
  });
  res.json({ message: 'Contraseña restablecida correctamente.' });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const { full_name, phone, avatar_url } = req.body;
  const old = req.user;
  const { rows } = await query(
    `UPDATE users SET full_name = COALESCE($2, full_name), phone = $3, avatar_url = $4, updated_at = now()
     WHERE id = $1 RETURNING id, full_name, email, phone, avatar_url, is_active, last_login_at, created_at`,
    [req.user.id, full_name ?? old.full_name, phone ?? old.phone, avatar_url ?? old.avatar_url]
  );
  await withTransaction(async (client) => {
    await logAudit(client, { userId: req.user.id, action: 'update_profile', module: 'auth', recordId: req.user.id, req });
  });
  res.json({ user: rows[0] });
});
