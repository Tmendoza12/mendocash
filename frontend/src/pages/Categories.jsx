import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Tag } from 'lucide-react';
import api, { apiErrorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { PageHeader, Loading, Badge } from '../components/ui/Misc.jsx';
import { Modal, ConfirmDialog } from '../components/ui/Modal.jsx';
import { TextInput, SelectInput } from '../components/ui/Field.jsx';

const COLORS = ['#6366f1', '#ef4444', '#22c55e', '#f59e0b', '#3b82f6', '#a855f7', '#10b981', '#14b8a6', '#ec4899', '#0ea5e9', '#84cc16', '#f97316'];

export default function Categories() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [subModal, setSubModal] = useState(false);
  const [parentCat, setParentCat] = useState(null);
  const [subName, setSubName] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'expense', color: '#6366f1', icon: '', sort_order: 0, is_global: false, is_active: true });

  const load = () => api.get('/categories').then((r) => setData(r.data.data)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm({ name: '', type: 'expense', color: '#6366f1', icon: '', sort_order: 0, is_global: false, is_active: true }); setModal(true); };
  const openEdit = (c) => { setEditing(c); setForm({ ...c }); setModal(true); };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) { await api.put(`/categories/${editing.id}`, form); toast.success('Categoría actualizada.'); }
      else { await api.post('/categories', form); toast.success('Categoría creada.'); }
      setModal(false); load();
    } catch (err) { toast.error(apiErrorMessage(err)); } finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    try { await api.delete(`/categories/${deleting.id}`); toast.success('Categoría eliminada.'); setDeleting(null); load(); }
    catch (err) { toast.error(apiErrorMessage(err)); setDeleting(null); }
  };

  const saveSub = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/categories/${parentCat.id}/subcategories`, { name: subName });
      toast.success('Subcategoría creada.');
      setSubModal(false); setSubName(''); load();
    } catch (err) { toast.error(apiErrorMessage(err)); }
  };

  const income = data.filter((c) => c.type === 'income');
  const expense = data.filter((c) => c.type === 'expense');

  const renderCat = (c) => (
    <div key={c.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex items-center gap-3">
        <span className="h-4 w-4 rounded-full" style={{ backgroundColor: c.color }} />
        <div>
          <p className="font-medium text-slate-800 dark:text-slate-100">
            {c.name} {c.is_global && <Badge color="bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">Global</Badge>}
            {!c.is_active && <Badge>Inactiva</Badge>}
          </p>
          {c.subcategories?.length > 0 && (
            <p className="mt-1 flex flex-wrap gap-1">
              {c.subcategories.map((s) => (
                <span key={s.id} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{s.name}</span>
              ))}
            </p>
          )}
        </div>
      </div>
      <div className="flex gap-1">
        {hasPermission('categorias.crear') && (
          <button className="btn-ghost px-2 py-1" title="Agregar subcategoría" onClick={() => { setParentCat(c); setSubName(''); setSubModal(true); }}><Plus className="h-4 w-4" /></button>
        )}
        {hasPermission('categorias.editar') && <button className="btn-ghost px-2 py-1" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></button>}
        {hasPermission('categorias.eliminar') && <button className="btn-ghost px-2 py-1 text-red-500" onClick={() => setDeleting(c)}><Trash2 className="h-4 w-4" /></button>}
      </div>
    </div>
  );

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader title="Categorías" subtitle="Organiza tus ingresos y gastos"
        actions={hasPermission('categorias.crear') ? <button className="btn-primary" onClick={openCreate}><Plus className="h-4 w-4" /> Nueva categoría</button> : null} />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-4">
          <h3 className="mb-3 flex items-center gap-2 font-semibold text-green-600"><Tag className="h-4 w-4" /> Ingresos</h3>
          <div className="space-y-2">{income.map(renderCat)}</div>
        </div>
        <div className="card p-4">
          <h3 className="mb-3 flex items-center gap-2 font-semibold text-red-600"><Tag className="h-4 w-4" /> Gastos</h3>
          <div className="space-y-2">{expense.map(renderCat)}</div>
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar categoría' : 'Nueva categoría'}>
        <form onSubmit={save} className="space-y-4">
          <TextInput label="Nombre" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <SelectInput label="Tipo" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} disabled={!!editing}>
            <option value="expense">Gasto</option>
            <option value="income">Ingreso</option>
          </SelectInput>
          <div>
            <label className="label">Color</label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((col) => (
                <button key={col} type="button" onClick={() => setForm({ ...form, color: col })}
                  className={`h-8 w-8 rounded-full ${form.color === col ? 'ring-2 ring-offset-2 ring-slate-400' : ''}`}
                  style={{ backgroundColor: col }} />
              ))}
            </div>
          </div>
          <TextInput label="Icono (nombre)" value={form.icon || ''} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
          <div className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            <span className="text-sm text-slate-600 dark:text-slate-300">Activa</span>
            {hasPermission('datos.globales.gestionar') && !editing && (
              <>
                <input type="checkbox" className="ml-4 h-4 w-4" checked={form.is_global} onChange={(e) => setForm({ ...form, is_global: e.target.checked })} />
                <span className="text-sm text-slate-600 dark:text-slate-300">Global</span>
              </>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>

      <Modal open={subModal} onClose={() => setSubModal(false)} title={`Subcategoría de ${parentCat?.name || ''}`} size="sm">
        <form onSubmit={saveSub} className="space-y-4">
          <TextInput label="Nombre" required value={subName} onChange={(e) => setSubName(e.target.value)} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setSubModal(false)}>Cancelar</button>
            <button type="submit" className="btn-primary">Agregar</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={confirmDelete} message={`¿Eliminar la categoría "${deleting?.name}"?`} />
    </div>
  );
}
