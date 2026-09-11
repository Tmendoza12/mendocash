import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Search, Download } from 'lucide-react';
import api, { apiErrorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatMoney, formatDate, todayISO } from '../utils/format.js';
import { PAYMENT_METHODS } from '../constants.js';
import { PageHeader, Loading } from '../components/ui/Misc.jsx';
import { DataTable, Pagination } from '../components/ui/DataTable.jsx';
import { Modal, ConfirmDialog } from '../components/ui/Modal.jsx';
import { TextInput, SelectInput, MoneyInput, Textarea } from '../components/ui/Field.jsx';

export default function Expenses() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const [data, setData] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [people, setPeople] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState({ search: '', from: '', to: '', category_id: '', account_id: '', payment_method: '', min_amount: '', max_amount: '' });
  const [form, setForm] = useState({ account_id: '', category_id: '', subcategory_id: '', date: todayISO(), description: '', amount: '', payment_method: '', merchant: '', is_recurring: false, notes: '', person_id: '', is_payment_to_person: false });

  const buildQuery = (p) => {
    const q = new URLSearchParams();
    q.set('page', p);
    q.set('limit', '10');
    Object.entries(filters).forEach(([k, v]) => { if (v !== '' && v != null) q.set(k, v); });
    return q.toString();
  };

  const load = (p = page) => {
    setLoading(true);
    api.get(`/expenses?${buildQuery(p)}`).then((r) => {
      setData(r.data.data); setTotal(r.data.total); setPage(r.data.page);
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    load(1);
    api.get('/accounts').then((r) => setAccounts(r.data.data));
    api.get('/categories?type=expense').then((r) => setCategories(r.data.data));
    api.get('/people').then((r) => setPeople(r.data.data));
  }, []);

  const onCategoryChange = (categoryId) => {
    setForm({ ...form, category_id: categoryId, subcategory_id: '' });
    const cat = categories.find((c) => c.id == categoryId);
    setSubcategories(cat?.subcategories || []);
  };

  const openCreate = () => {
    setEditing(null);
    setSubcategories([]);
    setForm({ account_id: accounts[0]?.id || '', category_id: '', subcategory_id: '', date: todayISO(), description: '', amount: '', payment_method: '', merchant: '', is_recurring: false, notes: '', person_id: '', is_payment_to_person: false });
    setModal(true);
  };
  const openEdit = (e) => {
    setEditing(e);
    const cat = categories.find((c) => c.id == e.category_id);
    setSubcategories(cat?.subcategories || []);
    setForm({ ...e, person_id: e.person_id || '', is_payment_to_person: !!e.is_payment_to_person });
    setModal(true);
  };

  const save = async (ev) => {
    ev.preventDefault();
    setSaving(true);
    try {
      if (editing) { await api.put(`/expenses/${editing.id}`, form); toast.success('Gasto actualizado.'); }
      else { await api.post('/expenses', form); toast.success('Gasto registrado.'); }
      setModal(false); load(page);
    } catch (err) { toast.error(apiErrorMessage(err)); } finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    try { await api.delete(`/expenses/${deleting.id}`); toast.success('Gasto eliminado.'); setDeleting(null); load(page); }
    catch (err) { toast.error(apiErrorMessage(err)); setDeleting(null); }
  };

  const exportData = async (format) => {
    try {
      const q = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => { if (v !== '' && v != null) q.set(k, v); });
      const res = await api.get(`/expenses/export?format=${format}&${q.toString()}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gastos.${format === 'excel' ? 'xlsx' : format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) { toast.error('No se pudo exportar.'); }
  };

  const columns = [
    { key: 'date', header: 'Fecha', render: (e) => formatDate(e.date) },
    { key: 'description', header: 'Descripción', render: (e) => <span className="font-medium">{e.description || '-'}</span> },
    { key: 'category_name', header: 'Categoría', render: (e) => e.category_name || '-' },
    { key: 'person_name', header: 'Persona', render: (e) => e.person_name || '-' },
    { key: 'account_name', header: 'Cuenta', render: (e) => e.account_name || '-' },
    { key: 'payment_method', header: 'Método', render: (e) => e.payment_method || '-' },
    { key: 'amount', header: 'Valor', render: (e) => <span className="font-semibold text-red-600">{formatMoney(e.amount)}</span> },
    {
      key: 'actions', header: '', render: (e) => (
        <div className="flex justify-end gap-1">
          {hasPermission('gastos.editar') && <button className="btn-ghost px-2 py-1" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></button>}
          {hasPermission('gastos.eliminar') && <button className="btn-ghost px-2 py-1 text-red-500" onClick={() => setDeleting(e)}><Trash2 className="h-4 w-4" /></button>}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Gastos" subtitle="Registra, filtra y exporta tus gastos"
        actions={
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => exportData('csv')}><Download className="h-4 w-4" /> CSV</button>
            <button className="btn-secondary" onClick={() => exportData('excel')}><Download className="h-4 w-4" /> Excel</button>
            <button className="btn-secondary" onClick={() => exportData('pdf')}><Download className="h-4 w-4" /> PDF</button>
            {hasPermission('gastos.crear') && <button className="btn-primary" onClick={openCreate}><Plus className="h-4 w-4" /> Nuevo gasto</button>}
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
          <select className="input" value={filters.category_id} onChange={(e) => setFilters({ ...filters, category_id: e.target.value })}>
            <option value="">Todas las categorías</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="input" value={filters.account_id} onChange={(e) => setFilters({ ...filters, account_id: e.target.value })}>
            <option value="">Todas las cuentas</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select className="input" value={filters.payment_method} onChange={(e) => setFilters({ ...filters, payment_method: e.target.value })}>
            <option value="">Todos los métodos</option>
            {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
          </select>
          <input type="number" className="input" placeholder="Valor mín." value={filters.min_amount} onChange={(e) => setFilters({ ...filters, min_amount: e.target.value })} />
          <input type="number" className="input" placeholder="Valor máx." value={filters.max_amount} onChange={(e) => setFilters({ ...filters, max_amount: e.target.value })} />
          <button className="btn-secondary" onClick={() => load(1)}>Aplicar filtros</button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <DataTable columns={columns} data={data} emptyMessage="No hay gastos registrados." />
        <Pagination page={page} limit={10} total={total} onChange={load} />
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar gasto' : 'Nuevo gasto'} size="lg">
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <MoneyInput label="Valor" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <TextInput label="Fecha" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <SelectInput label="Cuenta" required value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
            <option value="">Selecciona</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </SelectInput>
          <div className="grid grid-cols-2 gap-3">
            <SelectInput label="Categoría" value={form.category_id || ''} onChange={(e) => onCategoryChange(e.target.value)}>
              <option value="">Sin categoría</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </SelectInput>
            <SelectInput label="Subcategoría" value={form.subcategory_id || ''} onChange={(e) => setForm({ ...form, subcategory_id: e.target.value })}>
              <option value="">Sin subcategoría</option>
              {subcategories.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </SelectInput>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SelectInput label="Método de pago" value={form.payment_method || ''} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
              <option value="">Selecciona</option>
              {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
            </SelectInput>
            <TextInput label="Comercio / proveedor" value={form.merchant || ''} onChange={(e) => setForm({ ...form, merchant: e.target.value })} />
          </div>
          <SelectInput label="Persona relacionada (opcional)" value={form.person_id || ''} onChange={(e) => setForm({ ...form, person_id: e.target.value, is_payment_to_person: e.target.value ? form.is_payment_to_person : false })}>
            <option value="">Sin persona</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}{p.cedula ? ` — ${p.cedula}` : ''}</option>)}
          </SelectInput>
          {form.person_id && (
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input type="checkbox" className="h-4 w-4" checked={form.is_payment_to_person} onChange={(e) => setForm({ ...form, is_payment_to_person: e.target.checked })} />
              Este gasto es un pago a esta persona (se descuenta de su deuda o préstamo)
            </label>
          )}
          <TextInput label="Descripción" value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Textarea label="Observaciones" value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" className="h-4 w-4" checked={form.is_recurring} onChange={(e) => setForm({ ...form, is_recurring: e.target.checked })} />
            Es un gasto recurrente
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={confirmDelete} message="¿Eliminar este gasto?" />
    </div>
  );
}
