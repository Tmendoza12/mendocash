// Recalcula el saldo actual de una cuenta a partir de los movimientos.
export async function recomputeAccountBalance(client, accountId) {
  const { rows } = await client.query(
    `SELECT
       initial_balance
       + COALESCE((SELECT SUM(amount) FROM income WHERE account_id = $1), 0)
       - COALESCE((SELECT SUM(amount) FROM expenses WHERE account_id = $1), 0)
       + COALESCE((SELECT SUM(amount) FROM transfers WHERE to_account_id = $1), 0)
       - COALESCE((SELECT SUM(amount) FROM transfers WHERE from_account_id = $1), 0)
       + COALESCE((SELECT SUM(lp.amount) FROM loan_payments lp JOIN loans l ON l.id = lp.loan_id WHERE l.type = 'lent' AND lp.account_id = $1), 0)
       - COALESCE((SELECT SUM(lp.amount) FROM loan_payments lp JOIN loans l ON l.id = lp.loan_id WHERE l.type = 'borrowed' AND lp.account_id = $1), 0)
       - COALESCE((SELECT SUM(amount) FROM debt_payments WHERE account_id = $1), 0)
       AS balance
     FROM accounts WHERE id = $1`,
    [accountId]
  );
  if (!rows.length) return 0;
  await client.query(
    'UPDATE accounts SET current_balance = $2 WHERE id = $1',
    [accountId, rows[0].balance]
  );
  return rows[0].balance;
}

export async function recomputeAllBalances(client, userId) {
  const { rows } = await client.query(
    'SELECT id FROM accounts WHERE user_id = $1',
    [userId]
  );
  for (const r of rows) {
    await recomputeAccountBalance(client, r.id);
  }
}

// Verifica fondos suficientes en la cuenta (considerando sobregiro).
export async function ensureFunds(client, accountId, amount) {
  const { rows } = await client.query(
    'SELECT current_balance, allow_overdraft FROM accounts WHERE id = $1',
    [accountId]
  );
  const account = rows[0];
  if (!account) {
    const err = new Error('Cuenta no encontrada.');
    err.status = 404;
    throw err;
  }
  if (!account.allow_overdraft && account.current_balance < amount) {
    const err = new Error('La cuenta no tiene fondos suficientes.');
    err.status = 400;
    throw err;
  }
}
