import { query } from '../config/db.js';
import { asyncHandler, toDate } from '../utils/helpers.js';
import { targetUserIdForRead } from '../services/scope.js';

export const getDashboard = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const { start, end } = toDate(req.query.period || 'month');

  const [
    kpis,
    monthly,
    expenseByCategory,
    accountDistribution,
    incomeRange,
    expenseRange,
    loanStatus,
    debtStatus,
    budgets,
    upcomingDebts,
    upcomingLoans,
    lowAccounts,
    upcomingRecurring,
  ] = await Promise.all([
    // KPIs
    query(
      `SELECT
         COALESCE((SELECT SUM(current_balance) FROM accounts WHERE user_id = $1 AND status = 'active'), 0) AS total_balance,
         COALESCE((SELECT SUM(amount) FROM income WHERE user_id = $1 AND date BETWEEN $2 AND $3), 0) AS income,
         COALESCE((SELECT SUM(amount) FROM expenses WHERE user_id = $1 AND date BETWEEN $2 AND $3), 0) AS expense`,
      [userId, start, end]
    ),
    // Ingresos vs gastos por mes (últimos 12 meses)
    query(
      `SELECT to_char(m, 'YYYY-MM') AS month,
              COALESCE((SELECT SUM(amount) FROM income WHERE user_id = $1 AND date_trunc('month', date) = m), 0) AS income,
              COALESCE((SELECT SUM(amount) FROM expenses WHERE user_id = $1 AND date_trunc('month', date) = m), 0) AS expense
         FROM generate_series(date_trunc('month', now() - interval '11 months'), date_trunc('month', now()), interval '1 month') AS m
        ORDER BY m`,
      [userId]
    ),
    // Gastos por categoría (período)
    query(
      `SELECT c.name, c.color, COALESCE(SUM(e.amount), 0) AS total
         FROM expenses e JOIN categories c ON c.id = e.category_id
        WHERE e.user_id = $1 AND e.date BETWEEN $2 AND $3
        GROUP BY c.id ORDER BY total DESC LIMIT 10`,
      [userId, start, end]
    ),
    // Distribución por cuenta
    query(
      `SELECT name, type, current_balance FROM accounts WHERE user_id = $1 AND status = 'active' ORDER BY current_balance DESC`,
      [userId]
    ),
    // Ingresos últimos 7/30/90
    query(
      `SELECT
         COALESCE((SELECT SUM(amount) FROM income WHERE user_id = $1 AND date >= (CURRENT_DATE - interval '7 days')), 0) AS d7,
         COALESCE((SELECT SUM(amount) FROM income WHERE user_id = $1 AND date >= (CURRENT_DATE - interval '30 days')), 0) AS d30,
         COALESCE((SELECT SUM(amount) FROM income WHERE user_id = $1 AND date >= (CURRENT_DATE - interval '90 days')), 0) AS d90`,
      [userId]
    ),
    // Gastos últimos 7/30/90
    query(
      `SELECT
         COALESCE((SELECT SUM(amount) FROM expenses WHERE user_id = $1 AND date >= (CURRENT_DATE - interval '7 days')), 0) AS d7,
         COALESCE((SELECT SUM(amount) FROM expenses WHERE user_id = $1 AND date >= (CURRENT_DATE - interval '30 days')), 0) AS d30,
         COALESCE((SELECT SUM(amount) FROM expenses WHERE user_id = $1 AND date >= (CURRENT_DATE - interval '90 days')), 0) AS d90`,
      [userId]
    ),
    // Estado de préstamos
    query(
      `SELECT status, count(*)::int AS count,
              COALESCE(SUM(GREATEST(amount - COALESCE((SELECT SUM(lp.principal) FROM loan_payments lp WHERE lp.loan_id = loans.id), 0), 0)), 0) AS pending
         FROM loans WHERE user_id = $1 GROUP BY status`,
      [userId]
    ),
    // Estado de deudas
    query(
      `SELECT status, count(*)::int AS count,
              COALESCE(SUM(GREATEST(amount - COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp WHERE dp.debt_id = debts.id), 0), 0)), 0) AS pending
         FROM debts WHERE user_id = $1 GROUP BY status`,
      [userId]
    ),
    // Presupuestos del mes actual
    query(
      `SELECT b.*, c.name AS category_name, c.color AS category_color,
              COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.category_id = b.category_id AND e.user_id = b.user_id
                 AND e.date >= b.period AND e.date < (b.period + interval '1 month')), 0) AS spent
         FROM budgets b JOIN categories c ON c.id = b.category_id
        WHERE b.user_id = $1 AND b.period = date_trunc('month', CURRENT_DATE)::date`,
      [userId]
    ),
    // Deudas próximas a vencer
    query(
      `SELECT id, creditor, concept, due_date, amount,
              GREATEST(amount - COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp WHERE dp.debt_id = debts.id), 0), 0) AS pending
         FROM debts
        WHERE user_id = $1 AND status NOT IN ('paid', 'cancelled')
          AND due_date IS NOT NULL AND due_date <= (CURRENT_DATE + interval '7 days')
        ORDER BY due_date LIMIT 10`,
      [userId]
    ),
    // Préstamos próximos a vencer
    query(
      `SELECT l.id, l.type, l.due_date, l.amount, p.full_name AS person_name,
              GREATEST(l.amount - COALESCE((SELECT SUM(lp.principal) FROM loan_payments lp WHERE lp.loan_id = l.id), 0), 0) AS pending
         FROM loans l LEFT JOIN people p ON p.id = l.person_id
        WHERE l.user_id = $1 AND l.status NOT IN ('paid', 'cancelled')
          AND l.due_date IS NOT NULL AND l.due_date <= (CURRENT_DATE + interval '7 days')
        ORDER BY l.due_date LIMIT 10`,
      [userId]
    ),
    // Cuentas con saldo bajo
    query(
      `SELECT id, name, type, current_balance FROM accounts WHERE user_id = $1 AND status = 'active' AND current_balance < 50000`,
      [userId]
    ),
    // Gastos recurrentes próximos
    query(
      `SELECT id, name, amount, next_due_date FROM recurring_expenses
        WHERE user_id = $1 AND status = 'active' AND next_due_date IS NOT NULL
          AND next_due_date <= (CURRENT_DATE + interval '7 days')
        ORDER BY next_due_date LIMIT 10`,
      [userId]
    ),
  ]);

  const k = kpis.rows[0];
  const receivable = await query(
    `SELECT COALESCE(SUM(GREATEST(l.amount - COALESCE((SELECT SUM(lp.principal) FROM loan_payments lp WHERE lp.loan_id = l.id), 0), 0)), 0) AS total
       FROM loans l WHERE l.user_id = $1 AND l.type = 'lent' AND l.status NOT IN ('paid', 'cancelled')`,
    [userId]
  );
  const borrowedPending = await query(
    `SELECT COALESCE(SUM(GREATEST(l.amount - COALESCE((SELECT SUM(lp.principal) FROM loan_payments lp WHERE lp.loan_id = l.id), 0), 0)), 0) AS total
       FROM loans l WHERE l.user_id = $1 AND l.type = 'borrowed' AND l.status NOT IN ('paid', 'cancelled')`,
    [userId]
  );
  const debtsPending = await query(
    `SELECT COALESCE(SUM(GREATEST(d.amount - COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp WHERE dp.debt_id = d.id), 0), 0)), 0) AS total
       FROM debts d WHERE d.user_id = $1 AND d.status NOT IN ('paid', 'cancelled')`,
    [userId]
  );
  const activeLoans = await query(
    `SELECT count(*)::int AS count FROM loans WHERE user_id = $1 AND status NOT IN ('paid', 'cancelled')`,
    [userId]
  );

  const totalReceivable = receivable.rows[0].total;
  const totalBorrowed = borrowedPending.rows[0].total;
  const totalDebts = debtsPending.rows[0].total;

  // Evolución del saldo (acumulado de ingresos - gastos)
  const monthlyRows = monthly.rows;
  let cumulative = 0;
  const evolution = monthlyRows.map((r) => {
    cumulative += Number(r.income) - Number(r.expense);
    return { month: r.month, income: Number(r.income), expense: Number(r.expense), cumulative };
  });

  // Alertas
  const alerts = [];
  for (const b of budgets.rows) {
    const spent = Number(b.spent);
    const amount = Number(b.amount);
    const pct = amount > 0 ? (spent / amount) * 100 : 0;
    if (pct >= 100) alerts.push({ type: 'budget', severity: 'danger', message: `Presupuesto de ${b.category_name} superado (${pct.toFixed(0)}%).` });
    else if (pct >= 90) alerts.push({ type: 'budget', severity: 'warning', message: `Presupuesto de ${b.category_name} casi agotado (${pct.toFixed(0)}%).` });
    else if (pct >= 70) alerts.push({ type: 'budget', severity: 'info', message: `Presupuesto de ${b.category_name} al ${pct.toFixed(0)}%.` });
  }
  for (const d of upcomingDebts.rows) {
    const overdue = d.due_date < new Date().toISOString().slice(0, 10);
    alerts.push({ type: 'debt', severity: overdue ? 'danger' : 'warning', message: `${overdue ? 'Deuda vencida' : 'Deuda próxima a vencer'}: ${d.creditor} (${d.due_date}).` });
  }
  for (const l of upcomingLoans.rows) {
    const overdue = l.due_date < new Date().toISOString().slice(0, 10);
    const kind = l.type === 'lent' ? 'préstamo por cobrar' : 'préstamo por pagar';
    alerts.push({ type: 'loan', severity: overdue ? 'danger' : 'warning', message: `${overdue ? 'Vencido' : 'Próximo'}: ${kind} (${l.due_date}).` });
  }
  for (const a of lowAccounts.rows) {
    alerts.push({ type: 'account', severity: 'info', message: `Saldo bajo en la cuenta ${a.name}.` });
  }
  for (const r of upcomingRecurring.rows) {
    alerts.push({ type: 'recurring', severity: 'info', message: `Gasto recurrente próximo: ${r.name} (${r.next_due_date}).` });
  }

  res.json({
    period: { start, end },
    kpis: {
      total_balance: Number(k.total_balance),
      income: Number(k.income),
      expense: Number(k.expense),
      balance: Number(k.income) - Number(k.expense),
      total_debts: totalDebts,
      receivable: totalReceivable,
      payable: totalBorrowed + totalDebts,
      active_loans: activeLoans.rows[0].count,
      net_worth: (Number(k.total_balance) + totalReceivable) - (totalBorrowed + totalDebts),
    },
    charts: {
      monthly: monthlyRows.map((r) => ({ month: r.month, income: Number(r.income), expense: Number(r.expense) })),
      balance_evolution: evolution,
      expense_by_category: expenseByCategory.rows.map((r) => ({ name: r.name, color: r.color, total: Number(r.total) })),
      account_distribution: accountDistribution.rows.map((r) => ({ name: r.name, type: r.type, balance: Number(r.current_balance) })),
      income_range: incomeRange.rows[0],
      expense_range: expenseRange.rows[0],
      loan_status: loanStatus.rows.map((r) => ({ status: r.status, count: r.count, pending: Number(r.pending) })),
      debt_status: debtStatus.rows.map((r) => ({ status: r.status, count: r.count, pending: Number(r.pending) })),
    },
    alerts,
  });
});

export const getCalendar = asyncHandler(async (req, res) => {
  const userId = targetUserIdForRead(req);
  const from = req.query.from;
  const to = req.query.to;

  const [income, expenses, loans, debts, recurring, loanPayments, debtPayments] = await Promise.all([
    query('SELECT id, date, description, amount FROM income WHERE user_id = $1 AND ($2::date IS NULL OR date >= $2) AND ($3::date IS NULL OR date <= $3)', [userId, from || null, to || null]),
    query('SELECT id, date, description, amount FROM expenses WHERE user_id = $1 AND ($2::date IS NULL OR date >= $2) AND ($3::date IS NULL OR date <= $3)', [userId, from || null, to || null]),
    query("SELECT id, date, due_date, type, amount, description FROM loans WHERE user_id = $1", [userId]),
    query("SELECT id, due_date, start_date, creditor, concept, amount FROM debts WHERE user_id = $1", [userId]),
    query("SELECT id, next_due_date, name, amount FROM recurring_expenses WHERE user_id = $1 AND status = 'active' AND next_due_date IS NOT NULL", [userId]),
    query("SELECT lp.id, lp.date, lp.amount, l.type FROM loan_payments lp JOIN loans l ON l.id = lp.loan_id WHERE l.user_id = $1", [userId]),
    query("SELECT dp.id, dp.date, dp.amount FROM debt_payments dp JOIN debts d ON d.id = dp.debt_id WHERE d.user_id = $1", [userId]),
  ]);

  const events = [];
  income.rows.forEach((r) => events.push({ id: `inc-${r.id}`, date: r.date, type: 'income', title: r.description || 'Ingreso', amount: Number(r.amount) }));
  expenses.rows.forEach((r) => events.push({ id: `exp-${r.id}`, date: r.date, type: 'expense', title: r.description || 'Gasto', amount: Number(r.amount) }));
  loans.rows.forEach((r) => {
    events.push({ id: `loan-${r.id}`, date: r.date, type: 'loan', title: r.description || (r.type === 'lent' ? 'Préstamo otorgado' : 'Préstamo recibido'), amount: Number(r.amount) });
    if (r.due_date) events.push({ id: `loan-due-${r.id}`, date: r.due_date, type: 'loan_due', title: `Vence préstamo (${r.type === 'lent' ? 'por cobrar' : 'por pagar'})`, amount: Number(r.amount) });
  });
  debts.rows.forEach((r) => {
    events.push({ id: `debt-${r.id}`, date: r.start_date, type: 'debt', title: r.concept || r.creditor, amount: Number(r.amount) });
    if (r.due_date) events.push({ id: `debt-due-${r.id}`, date: r.due_date, type: 'debt_due', title: `Vence: ${r.creditor}`, amount: Number(r.amount) });
  });
  recurring.rows.forEach((r) => events.push({ id: `rec-${r.id}`, date: r.next_due_date, type: 'recurring', title: r.name, amount: Number(r.amount) }));
  loanPayments.rows.forEach((r) => events.push({ id: `lp-${r.id}`, date: r.date, type: 'loan_payment', title: r.type === 'lent' ? 'Cobro de préstamo' : 'Pago de préstamo', amount: Number(r.amount) }));
  debtPayments.rows.forEach((r) => events.push({ id: `dp-${r.id}`, date: r.date, type: 'debt_payment', title: 'Pago de deuda', amount: Number(r.amount) }));

  res.json({ data: events });
});
