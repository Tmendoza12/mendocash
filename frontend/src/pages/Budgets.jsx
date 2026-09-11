import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import api, { apiErrorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatMoney, currentMonthPeriod } from '../utils/format.js';
import { PageHeader, Loading } from '../components/ui/Misc.jsx';
import { Modal, ConfirmDialog } from '../components/ui/Modal.jsx';
import { SelectInput, MoneyInput } from '../components/ui/Field.jsx';

export default function Budgets() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const [data, setData] = useState([]);
  const [categories, setCategories] = useState([]);
  const [period, setPeriod] = useState(currentMonthPeriod());
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ category_id: '', amount: '' });

  const load = () => api.get(`/budgets?period=${period}`).then((r) => setData(r.data.data)).finally(() => setLoading(false));

  useEffect(() => {
    load();
    api.get('/categories?type=expense').then((r) => setCategories(r.data.data));
  }, [period]);

  const openCreate = () => { setEditing(null); setForm({ category_id: categories[0]?.id || '', amount: '' }); setModal(true); };
  const openEdit = (b) => { setEditing(b); setForm({ category_id: b.category_id, amount: b.amount }); setModal(true); };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) { await api.put(`/budgets/${editing.id}`, { amount: form.amount }); toast.success('Presupuesto actualizado.'); }
      else { await api.post('/budgets', { ...form, period }); toast.success('Presupuesto creado.'); }
      setModal(false); load();
    } catch (err) { toast.error(apiErrorMessage(err)); } finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    try { await api.delete(`/budgets/${deleting.id}`); toast.success('Presupuesto eliminado.'); setDeleting(null); load(); }
    catch (err) { toast.error(apiErrorMessage(err)); setDeleting(null); }
  };

  const barColor = (pct) => (pct >= 100 ? 'bg-red-500' : pct >= 90 ? 'bg-amber-500' : pct >= 70 ? 'bg-yellow-400' : 'bg-green-500');

  return (
    <div>
      <PageHeader title="Presupuestos" subtitle="Controla tus límites mensuales por categoría"
        actions={
          <div className="flex gap-2">
            <input type="month" className="input w-auto" value={period.slice(0, 7)} onChange={(e) => setPeriod(`${e.target.value}-01`)} />
            {hasPermission('presupuestos.crear') && <button className="btn-primary" onClick={openCreate}><Plus className="h-4 w-4" /> Nuevo presupuesto</button>}
          </div>
        } />

      {loading ? <Loading /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.length === 0 && <p className="text-sm text-slate-400 lg:col-span-2">No hay presupuestos para este período.</p>}
          {data.map((b) => (
            <div key={b.id} className="card p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: b.category_color }} />
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{b.category_name}</span>
                </div>
                <div className="flex gap-1">
                  {hasPermission('presupuestos.editar') && <button className="btn-ghost px-2 py-1" onClick={() => openEdit(b)}><Pencil className="h-4 w-4" /></button>}
                  {hasPermission('presupuestos.eliminar') && <button className="btn-ghost px-2 py-1 text-red-500" onClick={() => setDeleting(b)}><Trash2 className="h-4 w-4" /></button>}
                </div>
              </div>
              <div className="mb-2 flex items-end justify-between">
                <div>
                  <p className="text-xs text-slate-400">Gastado de {formatMoney(b.amount)}</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{formatMoney(b.spent)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400">Disponible</p>
                  <p className={`text-lg font-bold ${b.available < 0 ? 'text-red-600' : 'text-green-600'}`}>{formatMoney(b.available)}</p>
                </div>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div className={`h-full ${barColor(b.percent)}`} style={{ width: `${Math.min(100, b.percent)}%` }} />
              </div>
              <p className="mt-1 text-right text-xs text-slate-400">{b.percent.toFixed(0)}% utilizado</p>
            </div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar presupuesto' : 'Nuevo presupuesto'}>
        <form onSubmit={save} className="space-y-4">
          <SelectInput label="Categoría" required value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} disabled={!!editing}>
            <option value="">Selecciona</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </SelectInput>
          <MoneyInput label="Monto mensual" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={confirmDelete} message="¿Eliminar este presupuesto?" />
    </div>
  );
}
