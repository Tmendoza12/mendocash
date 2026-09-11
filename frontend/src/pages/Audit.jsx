import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { formatDateTime } from '../utils/format.js';
import { PageHeader, Loading, Badge } from '../components/ui/Misc.jsx';
import { DataTable, Pagination } from '../components/ui/DataTable.jsx';

const ACTION_COLORS = {
  create: 'bg-green-100 text-green-700', create_payment: 'bg-green-100 text-green-700',
  update: 'bg-blue-100 text-blue-700', generate: 'bg-blue-100 text-blue-700',
  delete: 'bg-red-100 text-red-700', delete_payment: 'bg-red-100 text-red-700',
  activate: 'bg-emerald-100 text-emerald-700', deactivate: 'bg-amber-100 text-amber-700',
  change_password: 'bg-purple-100 text-purple-700', login: 'bg-slate-100 text-slate-600',
};

export default function Audit() {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ module: '', from: '', to: '' });

  const buildQuery = (p) => {
    const q = new URLSearchParams();
    q.set('page', p); q.set('limit', '20');
    Object.entries(filters).forEach(([k, v]) => { if (v) q.set(k, v); });
    return q.toString();
  };

  const load = (p = page) => {
    setLoading(true);
    api.get(`/audit?${buildQuery(p)}`).then((r) => { setData(r.data.data); setTotal(r.data.total); setPage(r.data.page); }).finally(() => setLoading(false));
  };

  useEffect(() => { load(1); }, []);

  const columns = [
    { key: 'created_at', header: 'Fecha', render: (l) => formatDateTime(l.created_at) },
    { key: 'user_name', header: 'Usuario', render: (l) => l.user_name || l.user_email || '-' },
    { key: 'module', header: 'Módulo', render: (l) => <span className="capitalize">{l.module}</span> },
    { key: 'action', header: 'Acción', render: (l) => <Badge color={ACTION_COLORS[l.action] || 'bg-slate-100 text-slate-600'}>{l.action}</Badge> },
    { key: 'record_id', header: 'Registro', render: (l) => l.record_id || '-' },
    { key: 'ip_address', header: 'IP', render: (l) => l.ip_address || '-' },
  ];

  return (
    <div>
      <PageHeader title="Auditoría" subtitle="Historial de operaciones importantes" />
      <div className="card mb-4 p-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <input className="input" placeholder="Módulo" value={filters.module} onChange={(e) => setFilters({ ...filters, module: e.target.value })} />
          <input type="date" className="input" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
          <input type="date" className="input" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
          <button className="btn-secondary" onClick={() => load(1)}>Filtrar</button>
        </div>
      </div>
      <div className="card overflow-hidden">
        {loading ? <Loading /> : (
          <>
            <DataTable columns={columns} data={data} emptyMessage="No hay registros de auditoría." />
            <Pagination page={page} limit={20} total={total} onChange={load} />
          </>
        )}
      </div>
    </div>
  );
}
