import { query, withTransaction } from '../config/db.js';
import { asyncHandler } from '../utils/helpers.js';
import { catalogs, statusLabels } from '../utils/catalogs.js';
import { logAudit } from '../services/audit.js';

export const listSettings = asyncHandler(async (req, res) => {
  const { rows } = await query(
    'SELECT key, value, description FROM settings WHERE user_id IS NULL ORDER BY key'
  );
  const map = {};
  for (const r of rows) map[r.key] = r.value;
  res.json({ settings: map, catalogs, status_labels: statusLabels });
});

export const updateSettings = asyncHandler(async (req, res) => {
  const updates = req.body.settings || {};
  await withTransaction(async (client) => {
    for (const [key, value] of Object.entries(updates)) {
      await client.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key, user_id) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [key, String(value)]
      );
    }
    await logAudit(client, { userId: req.user.id, action: 'update', module: 'configuracion', newData: updates, req });
  });
  res.json({ message: 'Configuración actualizada.' });
});
