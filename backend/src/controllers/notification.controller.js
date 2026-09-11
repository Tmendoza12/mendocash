import { query } from '../config/db.js';
import { asyncHandler } from '../utils/helpers.js';
import { generateNotifications } from '../services/notifications.js';

const TYPES = ['cuota_por_vencer', 'deuda_vencida', 'presupuesto_excedido', 'gasto_recurrente', 'saldo_bajo', 'pago_pendiente'];

export const listNotifications = asyncHandler(async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100',
    [req.user.id]
  );
  const { rows: unread } = await query(
    'SELECT count(*)::int AS c FROM notifications WHERE user_id = $1 AND is_read = FALSE',
    [req.user.id]
  );
  res.json({ data: rows, unread: unread[0].c });
});

export const refreshNotifications = asyncHandler(async (req, res) => {
  const items = await generateNotifications(req.user.id);
  // Evitar duplicados: eliminar notificaciones generadas hoy y regenerar.
  await query('DELETE FROM notifications WHERE user_id = $1 AND created_at::date = CURRENT_DATE', [req.user.id]);
  for (const [type, title, message, link] of items) {
    await query(
      'INSERT INTO notifications (user_id, type, title, message, link) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, type, title, message, link]
    );
  }
  const { rows } = await query(
    'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100',
    [req.user.id]
  );
  const { rows: unread } = await query(
    'SELECT count(*)::int AS c FROM notifications WHERE user_id = $1 AND is_read = FALSE',
    [req.user.id]
  );
  res.json({ data: rows, unread: unread[0].c });
});

export const markRead = asyncHandler(async (req, res) => {
  await query('UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  res.json({ message: 'Notificación marcada como leída.' });
});

export const markAllRead = asyncHandler(async (req, res) => {
  await query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1', [req.user.id]);
  res.json({ message: 'Todas las notificaciones marcadas como leídas.' });
});

export const getPreferences = asyncHandler(async (req, res) => {
  const { rows } = await query(
    'SELECT type, enabled FROM notification_preferences WHERE user_id = $1',
    [req.user.id]
  );
  const map = {};
  for (const r of rows) map[r.type] = r.enabled;
  res.json({ preferences: TYPES.map((t) => ({ type: t, enabled: map[t] ?? true })) });
});

export const updatePreferences = asyncHandler(async (req, res) => {
  const { preferences } = req.body;
  for (const p of preferences) {
    if (TYPES.includes(p.type)) {
      await query(
        `INSERT INTO notification_preferences (user_id, type, enabled) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, type) DO UPDATE SET enabled = EXCLUDED.enabled`,
        [req.user.id, p.type, p.enabled]
      );
    }
  }
  res.json({ message: 'Preferencias actualizadas.' });
});
