import { query, withTransaction } from '../config/db.js';
import { asyncHandler } from '../utils/helpers.js';
import { targetUserIdForRead, targetUserIdForWrite } from '../services/scope.js';
import { recomputeAllBalances } from '../services/balance.js';
import { logAudit } from '../services/audit.js';

export const listAccounts = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const { rows } = await query(
    'SELECT * FROM accounts WHERE user_id = $1 ORDER BY id',
    [userId]
  );
  res.json({ data: rows });
});

export const getAccount = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const { rows } = await query(
    'SELECT * FROM accounts WHERE id = $1 AND user_id = $2',
    [req.params.id, userId]
  );
  if (!rows.length) return res.status(404).json({ message: 'Cuenta no encontrada.' });
  res.json({ account: rows[0] });
});

export const createAccount = asyncHandler(async (req, res) => {
  const userId = targetUserIdForWrite(req, req.body.user_id);
  const {
    name, type, bank, number, initial_balance = 0, currency = 'COP', status = 'active', allow_overdraft = false, description,
  } = req.body;

  const account = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO accounts (user_id, name, type, bank, number, initial_balance, current_balance, currency, status, allow_overdraft, description)
       VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9, $10) RETURNING *`,
      [userId, name, type, bank || null, number || null, initial_balance, currency, status, allow_overdraft, description || null]
    );
    await logAudit(client, { userId: req.user.id, action: 'create', module: 'cuentas', recordId: rows[0].id, newData: rows[0], req });
    return rows[0];
  });
  res.status(201).json({ account });
});

export const updateAccount = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const id = req.params.id;
  const {
    name, type, bank, number, initial_balance, currency, status, allow_overdraft, description,
  } = req.body;

  const account = await withTransaction(async (client) => {
    const { rows: oldRows } = await client.query('SELECT * FROM accounts WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!oldRows.length) {
      const e = new Error('Cuenta no encontrada.');
      e.status = 404;
      throw e;
    }
    const old = oldRows[0];
    const { rows } = await client.query(
      `UPDATE accounts SET
         name = COALESCE($2, name),
         type = COALESCE($3, type),
         bank = $4,
         number = $5,
         initial_balance = COALESCE($6, initial_balance),
         currency = COALESCE($7, currency),
         status = COALESCE($8, status),
         allow_overdraft = COALESCE($9, allow_overdraft),
         description = $10
       WHERE id = $1 RETURNING *`,
      [id, name ?? old.name, type ?? old.type, bank ?? old.bank, number ?? old.number,
        initial_balance ?? old.initial_balance, currency ?? old.currency, status ?? old.status,
        allow_overdraft ?? old.allow_overdraft, description ?? old.description]
    );
    await recomputeAllBalances(client, userId);
    await logAudit(client, { userId: req.user.id, action: 'update', module: 'cuentas', recordId: id, oldData: old, newData: rows[0], req });
    return rows[0];
  });
  res.json({ account });
});

export const removeAccount = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const id = req.params.id;
  await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM accounts WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!rows.length) {
      const e = new Error('Cuenta no encontrada.');
      e.status = 404;
      throw e;
    }
    const { rows: usage } = await client.query(
      `SELECT
         (SELECT count(*) FROM income WHERE account_id = $1) +
         (SELECT count(*) FROM expenses WHERE account_id = $1) +
         (SELECT count(*) FROM transfers WHERE from_account_id = $1 OR to_account_id = $1) +
         (SELECT count(*) FROM loan_payments WHERE account_id = $1) +
         (SELECT count(*) FROM debt_payments WHERE account_id = $1) AS c`,
      [id]
    );
    if (usage[0].c > 0) {
      const e = new Error('La cuenta tiene movimientos asociados. Desactívala en lugar de eliminarla.');
      e.status = 400;
      throw e;
    }
    await client.query('DELETE FROM accounts WHERE id = $1', [id]);
    await logAudit(client, { userId: req.user.id, action: 'delete', module: 'cuentas', recordId: id, oldData: rows[0], req });
  });
  res.json({ message: 'Cuenta eliminada.' });
});
