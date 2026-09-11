import crypto from 'node:crypto';
import { query, withTransaction } from '../config/db.js';
import { asyncHandler } from '../utils/helpers.js';
import { targetUserIdForRead, targetUserIdForWrite } from '../services/scope.js';
import { ensureFunds, recomputeAllBalances } from '../services/balance.js';
import { logAudit } from '../services/audit.js';

const SELECT = `
  SELECT t.*, fa.name AS from_account_name, ta.name AS to_account_name
    FROM transfers t
    JOIN accounts fa ON fa.id = t.from_account_id
    JOIN accounts ta ON ta.id = t.to_account_id`;

export const listTransfers = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const { rows } = await query(
    `${SELECT} WHERE t.user_id = $1 ORDER BY t.date DESC, t.id DESC LIMIT 200`,
    [userId]
  );
  res.json({ data: rows });
});

export const createTransfer = asyncHandler(async (req, res) => {
  const userId = targetUserIdForWrite(req, req.body.user_id);
  const { from_account_id, to_account_id, amount, date, description } = req.body;

  if (from_account_id === to_account_id) {
    return res.status(400).json({ message: 'La cuenta origen y destino deben ser diferentes.' });
  }

  const transfer = await withTransaction(async (client) => {
    await ensureFunds(client, from_account_id, amount);
    const { rows } = await client.query(
      `INSERT INTO transfers (user_id, from_account_id, to_account_id, amount, date, description, group_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [userId, from_account_id, to_account_id, amount, date, description || null, crypto.randomUUID()]
    );
    await recomputeAllBalances(client, userId);
    await logAudit(client, { userId: req.user.id, action: 'create', module: 'transferencias', recordId: rows[0].id, newData: rows[0], req });
    return rows[0];
  });
  res.status(201).json({ transfer });
});

export const removeTransfer = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const id = req.params.id;
  await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM transfers WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!rows.length) {
      const e = new Error('Transferencia no encontrada.');
      e.status = 404;
      throw e;
    }
    await client.query('DELETE FROM transfers WHERE id = $1', [id]);
    await recomputeAllBalances(client, userId);
    await logAudit(client, { userId: req.user.id, action: 'delete', module: 'transferencias', recordId: id, oldData: rows[0], req });
  });
  res.json({ message: 'Transferencia eliminada.' });
});
