import { useEffect, useState } from 'react';
import {
  Wallet, TrendingUp, TrendingDown, Scale, CreditCard, HandCoins, ArrowUpRight, ArrowDownRight, Landmark, AlertTriangle,
  BarChart3, Tag, Activity,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
  LineChart, Line,
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

const statusLabels = {
  pending: 'Pendiente', active: 'Activo', partially_paid: 'Parcial', paid: 'Pagado', overdue: 'Vencido', cancelled: 'Cancelado',
};

function formatCompact(v) {
  const n = Number(v || 0);
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}k`;
  return `$${Math.round(n)}`;
}

function ChartCard({ icon: Icon, title, children }) {
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-[#e3f8f4] text-[#0b9b87]">
          <Icon className="h-5 w-5" />
        </span>
        <h3 className="text-[15px] font-bold text-[#113f4b] dark:text-slate-100">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-40 items-center justify-center text-sm text-ink-soft">
      Sin datos para mostrar.
    </div>
  );
}

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
          <h1 className="font-serif text-[40px] font-bold leading-[0.96] tracking-[-1px] text-[#083f49] dark:text-white">Dashboard financiero</h1>
          <p className="mt-2 text-[14px] text-[#587984]">Resumen de tu situación financiera</p>
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
<StatCard title="Saldo total" value={formatMoney(kpis.total_balance)} icon={Wallet} color="bg-[#e1f7f3] text-[#0d9e8b]" bar="#12a994" />
<StatCard title="Ingresos" value={formatMoney(kpis.income)} icon={TrendingUp} color="bg-[#e1f7f3] text-[#0d9e8b]" bar="#12a994" />
<StatCard title="Gastos" value={formatMoney(kpis.expense)} icon={TrendingDown} color="bg-[#ffeded] text-[#e65b64]" bar="#12a994" />
<StatCard title="Balance" value={formatMoney(kpis.balance)} icon={Scale} color="bg-[#e8f2ff] text-[#2874bf]" bar="#3178b9" />
<StatCard title="Patrimonio neto" value={formatMoney(kpis.net_worth)} icon={Landmark} color="bg-[#efecff] text-[#684de0]" bar="#6a59cf" />
<StatCard title="Total deudas" value={formatMoney(kpis.total_debts)} icon={CreditCard} color="bg-[#fff0e3] text-[#ea741e]" bar="#e7782b" />
<StatCard title="Pendiente por cobrar" value={formatMoney(kpis.receivable)} icon={ArrowUpRight} color="bg-[#e1f7f3] text-[#0d9e8b]" bar="#12a994" />
<StatCard title="Pendiente por pagar" value={formatMoney(kpis.payable)} icon={ArrowDownRight} color="bg-[#ffeded] text-[#e65b64]" bar="#12a994" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard icon={BarChart3} title="Ingresos vs gastos por mes">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthly} margin={{ left: 0, right: 8 }}>
              <CartesianGrid strokeDasharray="3 4" stroke="#e0eaed" vertical={false} />
              <XAxis dataKey="label" fontSize={12} tick={{ fill: '#567985' }} axisLine={{ stroke: '#9fb2b8' }} tickLine={false} />
              <YAxis fontSize={12} tick={{ fill: '#567985' }} tickFormatter={formatCompact} axisLine={false} tickLine={false} width={48} />
              <Tooltip formatter={(v) => formatMoney(v)} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#50727c' }} />
              <Bar dataKey="ingresos" fill="#129c88" radius={[6, 6, 0, 0]} name="Ingresos" />
              <Bar dataKey="gastos" fill="#46bdd7" radius={[6, 6, 0, 0]} name="Gastos" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard icon={TrendingUp} title="Evolución del saldo">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={charts.balance_evolution} margin={{ left: 0, right: 8 }}>
              <CartesianGrid strokeDasharray="3 4" stroke="#e0eaed" vertical={false} />
              <XAxis dataKey="month" fontSize={12} tick={{ fill: '#567985' }} tickFormatter={(v) => v.slice(5)} axisLine={{ stroke: '#9fb2b8' }} tickLine={false} />
              <YAxis fontSize={12} tick={{ fill: '#567985' }} tickFormatter={formatCompact} axisLine={false} tickLine={false} width={48} />
              <Tooltip formatter={(v) => formatMoney(v)} />
              <Line type="monotone" dataKey="cumulative" stroke="#129c88" strokeWidth={2.5} name="Saldo acumulado" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard icon={Tag} title="Gastos por categoría">
          {charts.expense_by_category.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, charts.expense_by_category.length * 42)}>
              <BarChart data={charts.expense_by_category} layout="vertical" margin={{ left: 0, right: 24 }}>
                <CartesianGrid strokeDasharray="3 4" stroke="#e0eaed" horizontal={false} />
                <XAxis type="number" fontSize={12} tick={{ fill: '#567985' }} tickFormatter={formatCompact} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={130} fontSize={12} tick={{ fill: '#315f6c' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => formatMoney(v)} />
                <Bar dataKey="total" fill="#10a992" radius={[0, 6, 6, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard icon={Wallet} title="Distribución por cuenta">
          {charts.account_distribution.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, charts.account_distribution.length * 42)}>
              <BarChart data={charts.account_distribution} layout="vertical" margin={{ left: 0, right: 24 }}>
                <CartesianGrid strokeDasharray="3 4" stroke="#e0eaed" horizontal={false} />
                <XAxis type="number" fontSize={12} tick={{ fill: '#567985' }} tickFormatter={formatCompact} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={130} fontSize={12} tick={{ fill: '#315f6c' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => formatMoney(v)} />
                <Bar dataKey="balance" fill="#47c9b4" radius={[0, 6, 6, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard icon={Activity} title="Ingresos y gastos recientes">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={rangeData} margin={{ left: 0, right: 8 }}>
              <CartesianGrid strokeDasharray="3 4" stroke="#e0eaed" vertical={false} />
              <XAxis dataKey="name" fontSize={12} tick={{ fill: '#567985' }} axisLine={{ stroke: '#9fb2b8' }} tickLine={false} />
              <YAxis fontSize={12} tick={{ fill: '#567985' }} tickFormatter={formatCompact} axisLine={false} tickLine={false} width={48} />
              <Tooltip formatter={(v) => formatMoney(v)} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#50727c' }} />
              <Bar dataKey="ingresos" fill="#129c88" radius={[6, 6, 0, 0]} name="Ingresos" />
              <Bar dataKey="gastos" fill="#46bdd7" radius={[6, 6, 0, 0]} name="Gastos" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard icon={HandCoins} title="Estado de préstamos">
          {charts.loan_status.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, charts.loan_status.length * 42)}>
              <BarChart data={charts.loan_status.map((s) => ({ ...s, label: statusLabels[s.status] || s.status }))} layout="vertical" margin={{ left: 0, right: 24 }}>
                <CartesianGrid strokeDasharray="3 4" stroke="#e0eaed" horizontal={false} />
                <XAxis type="number" fontSize={12} tick={{ fill: '#567985' }} allowDecimals={false} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="label" width={130} fontSize={12} tick={{ fill: '#315f6c' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => `${v} préstamo${v === 1 ? '' : 's'}`} />
                <Bar dataKey="count" fill="#10a992" radius={[0, 6, 6, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
