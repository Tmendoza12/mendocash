import { useEffect, useState } from 'react';
import {
  Wallet, TrendingUp, TrendingDown, Scale, CreditCard, HandCoins, ArrowUpRight, ArrowDownRight, Landmark, AlertTriangle,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
  LineChart, Line, PieChart, Pie, Cell,
} from 'recharts';
import api from '../api/client.js';
import { formatMoney, formatDate } from '../utils/format.js';
import { StatCard, Loading } from '../components/ui/Misc.jsx';

const PERIODS = [
  { value: 'today', label: 'Hoy' },
  { value: 'week', label: 'Esta semana' },
  { value: 'month', label: 'Este mes' },
  { value: 'last_month', label: 'Mes anterior' },
  { value: 'last_3_months', label: 'Últimos 3 meses' },
  { value: 'last_6_months', label: 'Últimos 6 meses' },
  { value: 'year', label: 'Este año' },
  { value: 'last_year', label: 'Año anterior' },
];

const PIE_COLORS = ['#5BC0BE', '#3A506B', '#86dfdb', '#1C2541', '#47a5a3', '#6fa8c7', '#8fb5a0', '#c7a06f', '#a06f8f', '#6f8fa0'];

const statusLabels = {
  pending: 'Pendiente', active: 'Activo', partially_paid: 'Parcial', paid: 'Pagado', overdue: 'Vencido', cancelled: 'Cancelado',
};

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState('month');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/dashboard?period=${period}`).then((res) => setData(res.data)).finally(() => setLoading(false));
  }, [period]);

  if (loading || !data) return <Loading />;

  const { kpis, charts, alerts } = data;

  const monthly = charts.monthly.map((m) => ({ ...m, label: m.month.slice(5) }));
  const rangeData = [
    { name: '7 días', ingresos: charts.income_range.d7, gastos: charts.expense_range.d7 },
    { name: '30 días', ingresos: charts.income_range.d30, gastos: charts.expense_range.d30 },
    { name: '90 días', ingresos: charts.income_range.d90, gastos: charts.expense_range.d90 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Dashboard financiero</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Resumen de tu situación financiera</p>
        </div>
        <select className="input w-auto" value={period} onChange={(e) => setPeriod(e.target.value)}>
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      {alerts.length > 0 && (
        <div className="card border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-900/20">
          <div className="mb-2 flex items-center gap-2 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-semibold">Alertas ({alerts.length})</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {alerts.slice(0, 9).map((a, i) => (
              <div key={i} className={`rounded-lg px-3 py-2 text-xs ${
                a.severity === 'danger' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                : a.severity === 'warning' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                : 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
              }`}>
                {a.message}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard title="Saldo total" value={formatMoney(kpis.total_balance)} icon={Wallet} color="bg-brand-50 text-brand-600 dark:bg-brand-900/30" />
        <StatCard title="Ingresos" value={formatMoney(kpis.income)} icon={TrendingUp} color="bg-green-50 text-green-600 dark:bg-green-900/30" />
        <StatCard title="Gastos" value={formatMoney(kpis.expense)} icon={TrendingDown} color="bg-red-50 text-red-600 dark:bg-red-900/30" />
        <StatCard title="Balance" value={formatMoney(kpis.balance)} icon={Scale} color="bg-blue-50 text-blue-600 dark:bg-blue-900/30" />
        <StatCard title="Patrimonio neto" value={formatMoney(kpis.net_worth)} icon={Landmark} color="bg-violet-50 text-violet-600 dark:bg-violet-900/30" />
        <StatCard title="Total deudas" value={formatMoney(kpis.total_debts)} icon={CreditCard} color="bg-orange-50 text-orange-600 dark:bg-orange-900/30" />
        <StatCard title="Pendiente por cobrar" value={formatMoney(kpis.receivable)} icon={ArrowUpRight} color="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30" />
        <StatCard title="Pendiente por pagar" value={formatMoney(kpis.payable)} icon={ArrowDownRight} color="bg-rose-50 text-rose-600 dark:bg-rose-900/30" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h3 className="mb-4 font-semibold">Ingresos vs gastos por mes</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" strokeOpacity={0.3} />
              <XAxis dataKey="label" fontSize={12} />
              <YAxis fontSize={12} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => formatMoney(v)} />
              <Legend />
              <Bar dataKey="ingresos" fill="#22c55e" radius={[4, 4, 0, 0]} name="Ingresos" />
              <Bar dataKey="gastos" fill="#ef4444" radius={[4, 4, 0, 0]} name="Gastos" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-4">
          <h3 className="mb-4 font-semibold">Evolución del saldo</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={charts.balance_evolution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" strokeOpacity={0.3} />
              <XAxis dataKey="month" fontSize={12} tickFormatter={(v) => v.slice(5)} />
              <YAxis fontSize={12} tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`} />
              <Tooltip formatter={(v) => formatMoney(v)} />
              <Line type="monotone" dataKey="cumulative" stroke="#5BC0BE" strokeWidth={2} name="Saldo acumulado" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-4">
          <h3 className="mb-4 font-semibold">Gastos por categoría</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={charts.expense_by_category} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                {charts.expense_by_category.map((entry, i) => (
                  <Cell key={i} fill={entry.color || PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => formatMoney(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-4">
          <h3 className="mb-4 font-semibold">Distribución por cuenta</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={charts.account_distribution} dataKey="balance" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                {charts.account_distribution.map((entry, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => formatMoney(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-4">
          <h3 className="mb-4 font-semibold">Ingresos y gastos recientes</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={rangeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" strokeOpacity={0.3} />
              <XAxis dataKey="name" fontSize={12} />
              <YAxis fontSize={12} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => formatMoney(v)} />
              <Legend />
              <Bar dataKey="ingresos" fill="#22c55e" radius={[4, 4, 0, 0]} name="Ingresos" />
              <Bar dataKey="gastos" fill="#ef4444" radius={[4, 4, 0, 0]} name="Gastos" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-4">
          <h3 className="mb-4 font-semibold">Estado de préstamos</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={charts.loan_status} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={90} label={(e) => statusLabels[e.status] || e.status}>
                {charts.loan_status.map((entry, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
