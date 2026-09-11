import { useEffect, useState } from 'react';
import { Search, Download } from 'lucide-react';
import api from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { formatMoney, formatDate } from '../utils/format.js';
import { PageHeader, Loading, Badge } from '../components/ui/Misc.jsx';
import { DataTable, Pagination } from '../components/ui/DataTable.jsx';

const TYPE_META = {
  income: { label: 'Ingreso', cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  expense: { label: 'Gasto', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  transfer: { label: 'Transferencia', cls: 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300' },
  loan_payment: { label: 'Pago préstamo', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  debt_payment: { label: 'Pago deuda', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
};

export default function Movements() {
  const toast = useToast();
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ search: '', from: '', to: '', type: '' });

  const buildQuery = (p) => {
    const q = new URLSearchParams();
    q.set('page', p); q.set('limit', '15');
    Object.entries(filters).forEach(([k, v]) => { if (v) q.set(k, v); });
    return q.toString();
  };

  const load = (p = page) => {
    setLoading(true);
    api.get(`/movements?${buildQuery(p)}`).then((r) => { setData(r.data.data); setTotal(r.data.total); setPage(r.data.page); }).finally(() => setLoading(false));
  };

  useEffect(() => { load(1); }, []);

  const exportData = async (format) => {
    try {
      const q = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => { if (v) q.set(k, v); });
      const res = await api.get(`/movements/export?format=${format}&${q.toString()}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = `movimientos.${format === 'excel' ? 'xlsx' : format}`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('No se pudo exportar.'); }
  };

  const columns = [
    { key: 'date', header: 'Fecha', render: (m) => formatDate(m.date) },
    { key: 'type_label', header: 'Tipo', render: (m) => <Badge color={(TYPE_META[m.type] || {}).cls}>{m.type_label}</Badge> },
    { key: 'description', header: 'Descripción', render: (m) => m.description || '-' },
    { key: 'category', header: 'Categoría', render: (m) => m.category || '-' },
    { key: 'account', header: 'Cuenta', render: (m) => m.account || '-' },
    { key: 'amount', header: 'Valor', render: (m) => (
      <span className={`font-semibold ${m.type === 'income' ? 'text-green-600' : m.type === 'expense' ? 'text-red-600' : 'text-slate-700 dark:text-slate-200'}`}>
        {m.type === 'expense' ? '-' : ''}{formatMoney(m.amount)}
      </span>
    )},
  ];

  return (
    <div>
      <PageHeader title="Movimientos" subtitle="Vista centralizada de todos tus movimientos"
        actions={
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => exportData('csv')}><Download className="h-4 w-4" /> CSV</button>
            <button className="btn-secondary" onClick={() => exportData('excel')}><Download className="h-4 w-4" /> Excel</button>
            <button className="btn-secondary" onClick={() => exportData('pdf')}><Download className="h-4 w-4" /> PDF</button>
          </div>
        } />

      <div className="card mb-4 p-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Buscar..." value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
          </div>
          <input type="date" className="input" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
          <input type="date" className="input" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
          <div className="flex gap-2">
            <select className="input" value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
              <option value="">Todos los tipos</option>
              {Object.entries(TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <button className="btn-secondary whitespace-nowrap" onClick={() => load(1)}>Filtrar</button>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? <Loading /> : (
          <>
            <DataTable columns={columns} data={data} emptyMessage="No hay movimientos." />
            <Pagination page={page} limit={15} total={total} onChange={load} />
          </>
        )}
      </div>
    </div>
  );
}
