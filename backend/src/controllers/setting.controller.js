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
      const { rowCount } = await client.query(
        'UPDATE settings SET value = $2, updated_at = now() WHERE key = $1 AND user_id IS NULL',
        [key, String(value)]
      );
      if (rowCount === 0) {
        await client.query('INSERT INTO settings (key, value) VALUES ($1, $2)', [key, String(value)]);
      }
    }
    await logAudit(client, { userId: req.user.id, action: 'update', module: 'configuracion', newData: updates, req });
  });
  res.json({ message: 'Configuración actualizada.' });
});
