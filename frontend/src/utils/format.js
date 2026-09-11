export function formatMoney(value, currency = 'COP') {
  const v = Number(value || 0);
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(v);
}

export function formatNumber(value) {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(Number(value || 0));
}

export function formatDate(value) {
  if (!value) return '-';
  const d = value instanceof Date ? value : new Date(`${value}T00:00:00`);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  return d.toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function currentMonthPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export const loanStatusLabels = {
  pending: 'Pendiente',
  active: 'Activo',
  partially_paid: 'Pagado parcialmente',
  paid: 'Pagado',
  overdue: 'Vencido',
  cancelled: 'Cancelado',
};

export const statusColor = {
  pending: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  active: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  partially_paid: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  paid: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  overdue: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  cancelled: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

export const frequencyLabels = {
  daily: 'Diaria',
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  yearly: 'Anual',
};

export const periodicityLabels = {
  diaria: 'Diaria',
  semanal: 'Semanal',
  quincenal: 'Quincenal',
  mensual: 'Mensual',
  bimestral: 'Bimestral',
  trimestral: 'Trimestral',
  anual: 'Anual',
};
