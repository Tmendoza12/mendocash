import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import api from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { formatMoney, formatDate } from '../utils/format.js';
import { PageHeader, Loading, EmptyState } from '../components/ui/Misc.jsx';
import { DataTable } from '../components/ui/DataTable.jsx';

export default function Reports() {
  const toast = useToast();
  const [type, setType] = useState('monthly');
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    let url = '';
    if (type === 'monthly') url = `/reports/monthly?year=${year}&month=${month}`;
    else if (type === 'annual') url = `/reports/annual?year=${year}`;
    else url = `/reports/${type}`;
    api.get(url).then((r) => setData(r.data)).catch(() => setData(null)).finally(() => setLoading(false));
  }, [type, year, month]);

  const exportReport = async (format) => {
    try {
      const res = await api.get(`/reports/export?type=${type}&format=${format}&year=${year}&month=${month}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = `reporte_${type}.${format === 'excel' ? 'xlsx' : format}`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('No se pudo exportar.'); }
  };

  const renderMonthly = () => (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="card p-4 lg:col-span-3">
        <div className="grid grid-cols-3 gap-4">
          <div><p className="text-sm text-slate-400">Ingresos</p><p className="text-xl font-bold text-green-600">{formatMoney(data.totals.income)}</p></div>
          <div><p className="text-sm text-slate-400">Gastos</p><p className="text-xl font-bold text-red-600">{formatMoney(data.totals.expense)}</p></div>
          <div><p className="text-sm text-slate-400">Balance</p><p className="text-xl font-bold">{formatMoney(data.totals.balance)}</p></div>
        </div>
      </div>
      <div className="card overflow-hidden">
        <h3 className="px-4 pt-4 font-semibold">Gastos por categoría</h3>
        <DataTable
          columns={[
            { key: 'name', header: 'Categoría' },
            { key: 'count', header: 'N°' },
            { key: 'total', header: 'Total', render: (r) => formatMoney(r.total) },
          ]}
          data={data.expense_by_category}
        />
      </div>
      <div className="card overflow-hidden">
        <h3 className="px-4 pt-4 font-semibold">Ingresos por categoría</h3>
        <DataTable
          columns={[
            { key: 'name', header: 'Categoría' },
            { key: 'count', header: 'N°' },
            { key: 'total', header: 'Total', render: (r) => formatMoney(r.total) },
          ]}
          data={data.income_by_category}
        />
      </div>
    </div>
  );

  const renderAnnual = () => (
    <div className="card overflow-hidden">
      <DataTable
        columns={[
          { key: 'month', header: 'Mes', render: (r) => new Date(2000, r.month - 1, 1).toLocaleDateString('es-CO', { month: 'long' }) },
          { key: 'income', header: 'Ingresos', render: (r) => formatMoney(r.income) },
          { key: 'expense', header: 'Gastos', render: (r) => formatMoney(r.expense) },
          { key: 'balance', header: 'Balance', render: (r) => <span className={r.balance >= 0 ? 'text-green-600' : 'text-red-600'}>{formatMoney(r.balance)}</span> },
        ]}
        data={data.data}
      />
    </div>
  );

  const renderLoans = () => (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="grid grid-cols-3 gap-4">
          <div><p className="text-sm text-slate-400">Préstamos activos</p><p className="text-xl font-bold">{data.active_summary.count}</p></div>
          <div><p className="text-sm text-slate-400">Total prestado</p><p className="text-xl font-bold">{formatMoney(data.active_summary.total)}</p></div>
          <div><p className="text-sm text-slate-400">Pendiente</p><p className="text-xl font-bold text-red-600">{formatMoney(data.active_summary.pending)}</p></div>
        </div>
      </div>
      <div className="card overflow-hidden">
        <DataTable
          columns={[
            { key: 'type', header: 'Tipo', render: (r) => r.type === 'lent' ? 'Prestado' : 'Recibido' },
            { key: 'status', header: 'Estado' },
            { key: 'count', header: 'N°' },
            { key: 'total', header: 'Total', render: (r) => formatMoney(r.total) },
            { key: 'recovered', header: 'Recuperado', render: (r) => formatMoney(r.recovered) },
          ]}
          data={data.by_type_status}
        />
      </div>
    </div>
  );

  const renderDebts = () => (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <DataTable
          columns={[
            { key: 'status', header: 'Estado' },
            { key: 'count', header: 'N°' },
            { key: 'total', header: 'Total', render: (r) => formatMoney(r.total) },
            { key: 'paid', header: 'Pagado', render: (r) => formatMoney(r.paid) },
          ]}
          data={data.by_status}
        />
      </div>
      <div className="card overflow-hidden">
        <h3 className="px-4 pt-4 font-semibold">Próximos vencimientos</h3>
        <DataTable
          columns={[
            { key: 'creditor', header: 'Acreedor' },
            { key: 'due_date', header: 'Vence', render: (r) => formatDate(r.due_date) },
            { key: 'amount', header: 'Valor', render: (r) => formatMoney(r.amount) },
            { key: 'pending', header: 'Pendiente', render: (r) => formatMoney(r.pending) },
          ]}
          data={data.upcoming}
        />
      </div>
    </div>
  );

  const renderCategories = () => (
    <div className="card overflow-hidden">
      <DataTable
        columns={[
          { key: 'name', header: 'Categoría' },
          { key: 'count', header: 'Movimientos' },
          { key: 'total', header: 'Total gastado', render: (r) => formatMoney(r.total) },
        ]}
        data={data.data}
      />
    </div>
  );

  return (
    <div>
      <PageHeader title="Reportes" subtitle="Análisis detallado de tus finanzas"
        actions={
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => exportReport('csv')}><Download className="h-4 w-4" /> CSV</button>
            <button className="btn-secondary" onClick={() => exportReport('excel')}><Download className="h-4 w-4" /> Excel</button>
            <button className="btn-secondary" onClick={() => exportReport('pdf')}><Download className="h-4 w-4" /> PDF</button>
          </div>
        } />

      <div className="mb-4 flex flex-wrap gap-2">
        <select className="input w-auto" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="monthly">Reporte mensual</option>
          <option value="annual">Reporte anual</option>
          <option value="loans">Reporte de préstamos</option>
          <option value="debts">Reporte de deudas</option>
          <option value="categories">Reporte por categorías</option>
        </select>
        {(type === 'monthly' || type === 'annual') && (
          <select className="input w-auto" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[new Date().getFullYear() - 1, new Date().getFullYear()].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
        {type === 'monthly' && (
          <select className="input w-auto" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{new Date(2000, m - 1, 1).toLocaleDateString('es-CO', { month: 'long' })}</option>)}
          </select>
        )}
      </div>

      {loading ? <Loading /> : !data ? <EmptyState /> : (
        type === 'monthly' ? renderMonthly() :
        type === 'annual' ? renderAnnual() :
        type === 'loans' ? renderLoans() :
        type === 'debts' ? renderDebts() :
        renderCategories()
      )}
    </div>
  );
}
