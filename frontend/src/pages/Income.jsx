import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import api, { apiErrorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatMoney, formatDate, todayISO } from '../utils/format.js';
import { INCOME_TYPES, INCOME_METHODS } from '../constants.js';
import { PageHeader, Loading } from '../components/ui/Misc.jsx';
import { DataTable, Pagination } from '../components/ui/DataTable.jsx';
import { Modal, ConfirmDialog } from '../components/ui/Modal.jsx';
import { TextInput, SelectInput, MoneyInput, Textarea } from '../components/ui/Field.jsx';

export default function Income() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const [data, setData] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ account_id: '', category_id: '', date: todayISO(), description: '', amount: '', income_method: '', income_type: '', is_recurring: false, notes: '' });

  const load = (p = page) => {
    setLoading(true);
    api.get(`/income?page=${p}&limit=10`).then((r) => {
      setData(r.data.data);
      setTotal(r.data.total);
      setPage(r.data.page);
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    load(1);
    api.get('/accounts').then((r) => setAccounts(r.data.data));
    api.get('/categories?type=income').then((r) => setCategories(r.data.data));
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ account_id: accounts[0]?.id || '', category_id: categories[0]?.id || '', date: todayISO(), description: '', amount: '', income_method: '', income_type: '', is_recurring: false, notes: '' });
    setModal(true);
  };
  const openEdit = (i) => { setEditing(i); setForm({ ...i }); setModal(true); };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) { await api.put(`/income/${editing.id}`, form); toast.success('Ingreso actualizado.'); }
      else { await api.post('/income', form); toast.success('Ingreso registrado.'); }
      setModal(false);
      load(page);
    } catch (err) { toast.error(apiErrorMessage(err)); } finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    try { await api.delete(`/income/${deleting.id}`); toast.success('Ingreso eliminado.'); setDeleting(null); load(page); }
    catch (err) { toast.error(apiErrorMessage(err)); setDeleting(null); }
  };

  const columns = [
    { key: 'date', header: 'Fecha', render: (i) => formatDate(i.date) },
    { key: 'description', header: 'Descripción', render: (i) => <span className="font-medium">{i.description || '-'}</span> },
    { key: 'category_name', header: 'Categoría', render: (i) => i.category_name || '-' },
    { key: 'account_name', header: 'Cuenta', render: (i) => i.account_name || '-' },
    { key: 'income_type', header: 'Tipo', render: (i) => i.income_type || '-' },
    { key: 'amount', header: 'Valor', render: (i) => <span className="font-semibold text-green-600">{formatMoney(i.amount)}</span> },
    {
      key: 'actions', header: '', render: (i) => (
        <div className="flex justify-end gap-1">
          {hasPermission('ingresos.editar') && <button className="btn-ghost px-2 py-1" onClick={() => openEdit(i)}><Pencil className="h-4 w-4" /></button>}
          {hasPermission('ingresos.eliminar') && <button className="btn-ghost px-2 py-1 text-red-500" onClick={() => setDeleting(i)}><Trash2 className="h-4 w-4" /></button>}
        </div>
      ),
    },
  ];

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader title="Ingresos" subtitle="Registra y administra tus ingresos"
        actions={hasPermission('ingresos.crear') ? <button className="btn-primary" onClick={openCreate}><Plus className="h-4 w-4" /> Nuevo ingreso</button> : null} />
      <div className="card overflow-hidden">
        <DataTable columns={columns} data={data} emptyMessage="No hay ingresos registrados." />
        <Pagination page={page} limit={10} total={total} onChange={load} />
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar ingreso' : 'Nuevo ingreso'} size="lg">
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <MoneyInput label="Valor" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <TextInput label="Fecha" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <SelectInput label="Cuenta destino" required value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
            <option value="">Selecciona</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </SelectInput>
          <div className="grid grid-cols-2 gap-3">
            <SelectInput label="Categoría" value={form.category_id || ''} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              <option value="">Sin categoría</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </SelectInput>
            <SelectInput label="Tipo de ingreso" value={form.income_type || ''} onChange={(e) => setForm({ ...form, income_type: e.target.value })}>
              <option value="">Selecciona</option>
              {INCOME_TYPES.map((t) => <option key={t}>{t}</option>)}
            </SelectInput>
          </div>
          <SelectInput label="Método de ingreso" value={form.income_method || ''} onChange={(e) => setForm({ ...form, income_method: e.target.value })}>
            <option value="">Selecciona</option>
            {INCOME_METHODS.map((t) => <option key={t}>{t}</option>)}
          </SelectInput>
          <TextInput label="Descripción" value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Textarea label="Observaciones" value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" className="h-4 w-4" checked={form.is_recurring} onChange={(e) => setForm({ ...form, is_recurring: e.target.checked })} />
            Es un ingreso recurrente
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={confirmDelete} message="¿Eliminar este ingreso?" />
    </div>
  );
}
