import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Zap } from 'lucide-react';
import api, { apiErrorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatMoney, formatDate, frequencyLabels } from '../utils/format.js';
import { FREQUENCIES } from '../constants.js';
import { PageHeader, Loading, Badge } from '../components/ui/Misc.jsx';
import { DataTable } from '../components/ui/DataTable.jsx';
import { Modal, ConfirmDialog } from '../components/ui/Modal.jsx';
import { TextInput, SelectInput, MoneyInput } from '../components/ui/Field.jsx';

export default function Recurring() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const [data, setData] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', amount: '', category_id: '', account_id: '', frequency: 'monthly', next_due_date: '', end_date: '', status: 'active' });

  const load = () => api.get('/recurring').then((r) => setData(r.data.data)).finally(() => setLoading(false));

  useEffect(() => {
    load();
    api.get('/accounts').then((r) => setAccounts(r.data.data));
    api.get('/categories?type=expense').then((r) => setCategories(r.data.data));
  }, []);

  const openCreate = () => { setEditing(null); setForm({ name: '', amount: '', category_id: '', account_id: '', frequency: 'monthly', next_due_date: '', end_date: '', status: 'active' }); setModal(true); };
  const openEdit = (r) => { setEditing(r); setForm({ ...r, category_id: r.category_id || '', account_id: r.account_id || '' }); setModal(true); };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) { await api.put(`/recurring/${editing.id}`, form); toast.success('Gasto recurrente actualizado.'); }
      else { await api.post('/recurring', form); toast.success('Gasto recurrente creado.'); }
      setModal(false); load();
    } catch (err) { toast.error(apiErrorMessage(err)); } finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    try { await api.delete(`/recurring/${deleting.id}`); toast.success('Gasto recurrente eliminado.'); setDeleting(null); load(); }
    catch (err) { toast.error(apiErrorMessage(err)); setDeleting(null); }
  };

  const generate = async (r) => {
    try { await api.post(`/recurring/${r.id}/generate`); toast.success('Movimiento generado.'); load(); }
    catch (err) { toast.error(apiErrorMessage(err)); }
  };

  const columns = [
    { key: 'name', header: 'Nombre', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'amount', header: 'Valor', render: (r) => <span className="font-semibold text-red-600">{formatMoney(r.amount)}</span> },
    { key: 'category_name', header: 'Categoría', render: (r) => r.category_name || '-' },
    { key: 'frequency', header: 'Frecuencia', render: (r) => frequencyLabels[r.frequency] || r.frequency },
    { key: 'next_due_date', header: 'Próximo cobro', render: (r) => formatDate(r.next_due_date) },
    { key: 'status', header: 'Estado', render: (r) => (
      <Badge color={r.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : r.status === 'paused' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}>
        {r.status === 'active' ? 'Activo' : r.status === 'paused' ? 'Pausado' : 'Finalizado'}
      </Badge>
    )},
    {
      key: 'actions', header: '', render: (r) => (
        <div className="flex justify-end gap-1">
          {hasPermission('recurrentes.editar') && r.status === 'active' && (
            <button className="btn-ghost px-2 py-1 text-brand-600" title="Generar movimiento" onClick={() => generate(r)}><Zap className="h-4 w-4" /></button>
          )}
          {hasPermission('recurrentes.editar') && <button className="btn-ghost px-2 py-1" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></button>}
          {hasPermission('recurrentes.eliminar') && <button className="btn-ghost px-2 py-1 text-red-500" onClick={() => setDeleting(r)}><Trash2 className="h-4 w-4" /></button>}
        </div>
      ),
    },
  ];

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader title="Gastos recurrentes" subtitle="Netflix, arriendo, servicios y más"
        actions={hasPermission('recurrentes.crear') ? <button className="btn-primary" onClick={openCreate}><Plus className="h-4 w-4" /> Nuevo recurrente</button> : null} />
      <div className="card overflow-hidden">
        <DataTable columns={columns} data={data} emptyMessage="No hay gastos recurrentes." />
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar gasto recurrente' : 'Nuevo gasto recurrente'} size="lg">
        <form onSubmit={save} className="space-y-4">
          <TextInput label="Nombre" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <MoneyInput label="Valor" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <SelectInput label="Frecuencia" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
              {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </SelectInput>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SelectInput label="Categoría" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              <option value="">Sin categoría</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </SelectInput>
            <SelectInput label="Cuenta" value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
              <option value="">Sin cuenta</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </SelectInput>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TextInput label="Próximo cobro" type="date" value={form.next_due_date || ''} onChange={(e) => setForm({ ...form, next_due_date: e.target.value })} />
            <TextInput label="Fecha de finalización" type="date" value={form.end_date || ''} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          </div>
          {editing && (
            <SelectInput label="Estado" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="active">Activo</option>
              <option value="paused">Pausado</option>
              <option value="finished">Finalizado</option>
            </SelectInput>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={confirmDelete} message="¿Eliminar este gasto recurrente?" />
    </div>
  );
}
