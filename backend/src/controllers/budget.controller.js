import { query, withTransaction } from '../config/db.js';
import { asyncHandler } from '../utils/helpers.js';
import { targetUserIdForRead, targetUserIdForWrite } from '../services/scope.js';
import { logAudit } from '../services/audit.js';

function normalizePeriod(p) {
  if (!p) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  }
  if (/^\d{4}-\d{2}$/.test(p)) return `${p}-01`;
  return p;
}

const BUDGET_SELECT = `
  SELECT b.*, c.name AS category_name, c.color AS category_color, c.type AS category_type,
         COALESCE((
           SELECT SUM(e.amount) FROM expenses e
           WHERE e.category_id = b.category_id
             AND e.user_id = b.user_id
             AND e.date >= b.period
             AND e.date < (b.period + interval '1 month')
         ), 0) AS spent
    FROM budgets b
    JOIN categories c ON c.id = b.category_id`;

function summarizeBudget(b) {
  const spent = Number(b.spent || 0);
  const amount = Number(b.amount);
  const available = amount - spent;
  const percent = amount > 0 ? (spent / amount) * 100 : 0;
  return { ...b, spent, available, percent: Math.round(percent * 100) / 100 };
}

export const listBudgets = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const period = normalizePeriod(req.query.period);
  const { rows } = await query(
    `${BUDGET_SELECT} WHERE b.user_id = $1 AND b.period = $2 ORDER BY c.name`,
    [userId, period]
  );
  res.json({ data: rows.map(summarizeBudget) });
});

export const getBudget = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const { rows } = await query(`${BUDGET_SELECT} WHERE b.id = $1 AND b.user_id = $2`, [req.params.id, userId]);
  if (!rows.length) return res.status(404).json({ message: 'Presupuesto no encontrado.' });
  res.json({ budget: summarizeBudget(rows[0]) });
});

export const createBudget = asyncHandler(async (req, res) => {
  const userId = targetUserIdForWrite(req, req.body.user_id);
  const { category_id, amount, period } = req.body;
  const p = normalizePeriod(period);

  const budget = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO budgets (user_id, category_id, period, amount)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, category_id, period)
       DO UPDATE SET amount = EXCLUDED.amount
       RETURNING *`,
      [userId, category_id, p, amount]
    );
    await logAudit(client, { userId: req.user.id, action: 'create', module: 'presupuestos', recordId: rows[0].id, newData: rows[0], req });
    return rows[0];
  });
  res.status(201).json({ budget });
});

export const updateBudget = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const id = req.params.id;
  const { amount } = req.body;

  const budget = await withTransaction(async (client) => {
    const { rows: oldRows } = await client.query('SELECT * FROM budgets WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!oldRows.length) {
      const e = new Error('Presupuesto no encontrado.');
      e.status = 404;
      throw e;
    }
    const { rows } = await client.query(
      'UPDATE budgets SET amount = COALESCE($2, amount), updated_at = now() WHERE id = $1 RETURNING *',
      [id, amount ?? oldRows[0].amount]
    );
    await logAudit(client, { userId: req.user.id, action: 'update', module: 'presupuestos', recordId: id, oldData: oldRows[0], newData: rows[0], req });
    return rows[0];
  });
  res.json({ budget });
});

export const removeBudget = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const id = req.params.id;
  await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM budgets WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!rows.length) {
      const e = new Error('Presupuesto no encontrado.');
      e.status = 404;
      throw e;
    }
    await client.query('DELETE FROM budgets WHERE id = $1', [id]);
    await logAudit(client, { userId: req.user.id, action: 'delete', module: 'presupuestos', recordId: id, oldData: rows[0], req });
  });
  res.json({ message: 'Presupuesto eliminado.' });
});

export const budgetHistory = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const categoryId = req.query.category_id;
  const { rows } = await query(
    `SELECT b.*, c.name AS category_name, c.color AS category_color,
            COALESCE((
              SELECT SUM(e.amount) FROM expenses e
              WHERE e.category_id = b.category_id AND e.user_id = b.user_id
                AND e.date >= b.period AND e.date < (b.period + interval '1 month')
            ), 0) AS spent
       FROM budgets b JOIN categories c ON c.id = b.category_id
      WHERE b.user_id = $1 AND ($2::int IS NULL OR b.category_id = $2)
      ORDER BY b.period DESC
      LIMIT 24`,
    [userId, categoryId || null]
  );
  res.json({ data: rows.map(summarizeBudget) });
});
