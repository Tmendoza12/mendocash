import { query } from '../config/db.js';
import { asyncHandler } from '../utils/helpers.js';
import { targetUserIdForRead } from '../services/scope.js';
import { exportData } from '../services/export.js';

export const monthlyReport = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const now = new Date();
  const year = Number(req.query.year || now.getFullYear());
  const month = Number(req.query.month || now.getMonth() + 1);
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const [totals, byCategoryExpense, byCategoryIncome] = await Promise.all([
    query(
      `SELECT
         COALESCE((SELECT SUM(amount) FROM income WHERE user_id = $1 AND date BETWEEN $2 AND $3), 0) AS income,
         COALESCE((SELECT SUM(amount) FROM expenses WHERE user_id = $1 AND date BETWEEN $2 AND $3), 0) AS expense`,
      [userId, start, end]
    ),
    query(
      `SELECT c.name, c.color, SUM(e.amount) AS total, count(*)::int AS count
         FROM expenses e JOIN categories c ON c.id = e.category_id
        WHERE e.user_id = $1 AND e.date BETWEEN $2 AND $3
        GROUP BY c.id ORDER BY total DESC`,
      [userId, start, end]
    ),
    query(
      `SELECT c.name, c.color, SUM(i.amount) AS total, count(*)::int AS count
         FROM income i JOIN categories c ON c.id = i.category_id
        WHERE i.user_id = $1 AND i.date BETWEEN $2 AND $3
        GROUP BY c.id ORDER BY total DESC`,
      [userId, start, end]
    ),
  ]);

  const income = Number(totals.rows[0].income);
  const expense = Number(totals.rows[0].expense);
  res.json({
    year,
    month,
    totals: { income, expense, balance: income - expense },
    expense_by_category: byCategoryExpense.rows.map((r) => ({ ...r, total: Number(r.total) })),
    income_by_category: byCategoryIncome.rows.map((r) => ({ ...r, total: Number(r.total) })),
  });
});

export const annualReport = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const now = new Date();
  const year = Number(req.query.year || now.getFullYear());
  const { rows } = await query(
    `SELECT m.month,
            COALESCE(inc.income, 0) AS income,
            COALESCE(exp.expense, 0) AS expense
       FROM generate_series(1, 12) AS m(month)
       LEFT JOIN (
         SELECT EXTRACT(MONTH FROM date)::int AS month, SUM(amount) AS income
           FROM income WHERE user_id = $1 AND EXTRACT(YEAR FROM date) = $2
          GROUP BY 1
       ) inc ON inc.month = m.month
       LEFT JOIN (
         SELECT EXTRACT(MONTH FROM date)::int AS month, SUM(amount) AS expense
           FROM expenses WHERE user_id = $1 AND EXTRACT(YEAR FROM date) = $2
          GROUP BY 1
       ) exp ON exp.month = m.month
      ORDER BY m.month`,
    [userId, year]
  );
  res.json({
    year,
    data: rows.map((r) => ({
      month: r.month,
      income: Number(r.income),
      expense: Number(r.expense),
      balance: Number(r.income) - Number(r.expense),
    })),
  });
});

export const loansReport = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const { rows } = await query(
    `SELECT l.type, l.status, count(*)::int AS count,
            COALESCE(SUM(l.amount), 0) AS total,
            COALESCE(SUM(p.total_paid), 0) AS recovered
       FROM loans l
       LEFT JOIN (
         SELECT loan_id, SUM(amount) AS total_paid FROM loan_payments GROUP BY loan_id
       ) p ON p.loan_id = l.id
      WHERE l.user_id = $1
      GROUP BY l.type, l.status
      ORDER BY l.type, l.status`,
    [userId]
  );
  const active = await query(
    `SELECT count(*)::int AS count,
            COALESCE(SUM(l.amount), 0) AS total,
            COALESCE(SUM(GREATEST(l.amount - COALESCE(p.principal_paid, 0), 0)), 0) AS pending
       FROM loans l
       LEFT JOIN (
         SELECT loan_id, SUM(principal) AS principal_paid FROM loan_payments GROUP BY loan_id
       ) p ON p.loan_id = l.id
      WHERE l.user_id = $1 AND l.status NOT IN ('paid', 'cancelled')`,
    [userId]
  );
  res.json({
    by_type_status: rows.map((r) => ({ ...r, total: Number(r.total), recovered: Number(r.recovered) })),
    active_summary: {
      count: active.rows[0].count,
      total: Number(active.rows[0].total),
      pending: Number(active.rows[0].pending),
    },
  });
});

export const debtsReport = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const { rows } = await query(
    `SELECT d.status, count(*)::int AS count,
            COALESCE(SUM(d.amount), 0) AS total,
            COALESCE(SUM(p.total_paid), 0) AS paid
       FROM debts d
       LEFT JOIN (
         SELECT debt_id, SUM(amount) AS total_paid FROM debt_payments GROUP BY debt_id
       ) p ON p.debt_id = d.id
      WHERE d.user_id = $1
      GROUP BY d.status`,
    [userId]
  );
  const upcoming = await query(
    `SELECT d.id, d.creditor, d.concept, d.due_date, d.amount,
            GREATEST(d.amount - COALESCE(p.total_paid, 0), 0) AS pending
       FROM debts d
       LEFT JOIN (
         SELECT debt_id, SUM(amount) AS total_paid FROM debt_payments GROUP BY debt_id
       ) p ON p.debt_id = d.id
      WHERE d.user_id = $1 AND d.status NOT IN ('paid', 'cancelled') AND d.due_date IS NOT NULL
      ORDER BY d.due_date LIMIT 50`,
    [userId]
  );
  res.json({
    by_status: rows.map((r) => ({ ...r, total: Number(r.total), paid: Number(r.paid) })),
    upcoming: upcoming.rows.map((r) => ({ ...r, amount: Number(r.amount), pending: Number(r.pending) })),
  });
});

export const categoriesReport = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const from = req.query.from || '1900-01-01';
  const to = req.query.to || '2999-12-31';
  const { rows } = await query(
    `SELECT c.name, c.color, c.type,
            COALESCE(SUM(e.amount), 0) AS total, count(e.id)::int AS count
       FROM categories c
       LEFT JOIN expenses e ON e.category_id = c.id AND e.user_id = $1 AND e.date BETWEEN $2 AND $3
      WHERE (c.is_global = TRUE OR c.user_id = $1) AND c.type = 'expense'
      GROUP BY c.id ORDER BY total DESC`,
    [userId, from, to]
  );
  res.json({ data: rows.map((r) => ({ ...r, total: Number(r.total) })) });
});

export const exportReport = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const type = req.query.type || 'monthly';
  const format = req.query.format || 'csv';
  const year = Number(req.query.year || new Date().getFullYear());
  const month = Number(req.query.month || new Date().getMonth() + 1);

  let rows = [];
  let headers = [];
  let title = 'Reporte';

  if (type === 'annual') {
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    const { rows: r } = await query(
      `SELECT EXTRACT(MONTH FROM date)::int AS month,
              COALESCE(SUM(amount) FILTER (WHERE kind = 'income'), 0) AS income,
              COALESCE(SUM(amount) FILTER (WHERE kind = 'expense'), 0) AS expense
         FROM (
           SELECT date, amount, 'income' AS kind FROM income WHERE user_id = $1 AND date BETWEEN $2 AND $3
           UNION ALL
           SELECT date, amount, 'expense' FROM expenses WHERE user_id = $1 AND date BETWEEN $2 AND $3
         ) t GROUP BY 1 ORDER BY 1`,
      [userId, start, end]
    );
    rows = r.map((x) => ({ month: x.month, income: Number(x.income), expense: Number(x.expense), balance: Number(x.income) - Number(x.expense) }));
    headers = [
      { key: 'month', label: 'Mes' },
      { key: 'income', label: 'Ingresos' },
      { key: 'expense', label: 'Gastos' },
      { key: 'balance', label: 'Balance' },
    ];
    title = `Reporte anual ${year}`;
  } else if (type === 'categories') {
    const from = req.query.from || '1900-01-01';
    const to = req.query.to || '2999-12-31';
    const { rows: r } = await query(
      `SELECT c.name, SUM(e.amount) AS total, count(*)::int AS count
         FROM expenses e JOIN categories c ON c.id = e.category_id
        WHERE e.user_id = $1 AND e.date BETWEEN $2 AND $3
        GROUP BY c.id ORDER BY total DESC`,
      [userId, from, to]
    );
    rows = r.map((x) => ({ name: x.name, total: Number(x.total), count: x.count }));
    headers = [
      { key: 'name', label: 'Categoría' },
      { key: 'total', label: 'Total gastado' },
      { key: 'count', label: 'Movimientos' },
    ];
    title = 'Reporte por categorías';
  } else {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const { rows: r } = await query(
      `SELECT c.name, SUM(e.amount) AS total, count(*)::int AS count
         FROM expenses e JOIN categories c ON c.id = e.category_id
        WHERE e.user_id = $1 AND e.date BETWEEN $2 AND $3
        GROUP BY c.id ORDER BY total DESC`,
      [userId, start, end]
    );
    rows = r.map((x) => ({ name: x.name, total: Number(x.total), count: x.count }));
    headers = [
      { key: 'name', label: 'Categoría' },
      { key: 'total', label: 'Total gastado' },
      { key: 'count', label: 'Movimientos' },
    ];
    title = `Reporte mensual ${year}-${month}`;
  }

  const file = await exportData({ format, rows, headers, title, filename: `reporte_${type}_${Date.now()}` });
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.send(file.buffer);
});
