import { query } from '../config/db.js';

const today = () => new Date().toISOString().slice(0, 10);

export async function generateNotifications(userId) {
  const items = [];

  // Presupuestos cerca/excedidos
  const { rows: budgets } = await query(
    `SELECT b.*, c.name AS category_name,
       COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.category_id = b.category_id AND e.user_id = b.user_id
         AND e.date >= b.period AND e.date < (b.period + interval '1 month')), 0) AS spent
     FROM budgets b JOIN categories c ON c.id = b.category_id
     WHERE b.user_id = $1 AND b.period = date_trunc('month', CURRENT_DATE)::date`,
    [userId]
  );
  for (const b of budgets) {
    const pct = Number(b.amount) > 0 ? (Number(b.spent) / Number(b.amount)) * 100 : 0;
    if (pct >= 100) items.push(['presupuesto_excedido', 'Presupuesto superado', `El presupuesto de ${b.category_name} fue superado (${pct.toFixed(0)}%).`, '/presupuestos']);
    else if (pct >= 90) items.push(['presupuesto_excedido', 'Presupuesto casi agotado', `El presupuesto de ${b.category_name} está al ${pct.toFixed(0)}%.`, '/presupuestos']);
  }

  // Deudas próximas/vencidas
  const { rows: debts } = await query(
    `SELECT id, creditor, due_date FROM debts WHERE user_id = $1 AND status NOT IN ('paid', 'cancelled') AND due_date IS NOT NULL AND due_date <= (CURRENT_DATE + interval '7 days')`,
    [userId]
  );
  for (const d of debts) {
    const overdue = d.due_date < today();
    items.push(['deuda_vencida', overdue ? 'Deuda vencida' : 'Deuda por vencer', `${d.creditor} vence el ${d.due_date}.`, '/deudas']);
  }

  // Préstamos próximos/vencidos
  const { rows: loans } = await query(
    `SELECT id, type, due_date FROM loans WHERE user_id = $1 AND status NOT IN ('paid', 'cancelled') AND due_date IS NOT NULL AND due_date <= (CURRENT_DATE + interval '7 days')`,
    [userId]
  );
  for (const l of loans) {
    const overdue = l.due_date < today();
    const kind = l.type === 'lent' ? 'por cobrar' : 'por pagar';
    items.push(['cuota_por_vencer', overdue ? 'Préstamo vencido' : 'Préstamo por vencer', `Préstamo ${kind} vence el ${l.due_date}.`, '/prestamos']);
  }

  // Saldo bajo
  const { rows: lowAccounts } = await query(
    `SELECT name FROM accounts WHERE user_id = $1 AND status = 'active' AND current_balance < 50000`,
    [userId]
  );
  for (const a of lowAccounts) {
    items.push(['saldo_bajo', 'Saldo bajo', `La cuenta ${a.name} tiene saldo bajo.`, '/cuentas']);
  }

  // Gastos recurrentes próximos
  const { rows: recurring } = await query(
    `SELECT name, next_due_date FROM recurring_expenses WHERE user_id = $1 AND status = 'active' AND next_due_date IS NOT NULL AND next_due_date <= (CURRENT_DATE + interval '7 days')`,
    [userId]
  );
  for (const r of recurring) {
    items.push(['gasto_recurrente', 'Gasto recurrente próximo', `${r.name} se cobrará el ${r.next_due_date}.`, '/recurrentes']);
  }

  return items;
}
