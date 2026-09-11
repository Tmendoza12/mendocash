import { getIp } from '../utils/helpers.js';

export async function logAudit(
  client,
  { userId, action, module, recordId = null, oldData = null, newData = null, req = null }
) {
  await client.query(
    `INSERT INTO audit_logs (user_id, action, module, record_id, old_data, new_data, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      userId || null,
      action,
      module,
      recordId ? String(recordId) : null,
      oldData ? JSON.stringify(oldData) : null,
      newData ? JSON.stringify(newData) : null,
      req ? getIp(req) : null,
      req ? req.headers['user-agent']?.slice(0, 500) || null : null,
    ]
  );
}
