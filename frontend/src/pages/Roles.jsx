import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, ShieldCheck } from 'lucide-react';
import api, { apiErrorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { PageHeader, Loading, Badge } from '../components/ui/Misc.jsx';
import { Modal, ConfirmDialog } from '../components/ui/Modal.jsx';
import { TextInput } from '../components/ui/Field.jsx';

export default function Roles() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const [data, setData] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', description: '', permissions: [] });

  const load = () => api.get('/roles').then((r) => setData(r.data.data)).finally(() => setLoading(false));

  useEffect(() => {
    load();
    api.get('/permissions').then((r) => setPermissions(r.data.data));
  }, []);

  const openCreate = () => { setEditing(null); setForm({ name: '', slug: '', description: '', permissions: [] }); setModal(true); };
  const openEdit = async (r) => {
    const res = await api.get(`/roles/${r.id}`);
    setEditing(r);
    setForm({ name: r.name, slug: r.slug, description: r.description || '', permissions: res.data.role.permissions.map((p) => p.id) });
    setModal(true);
  };

  const togglePerm = (pid) => {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(pid) ? f.permissions.filter((p) => p !== pid) : [...f.permissions, pid],
    }));
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) { await api.put(`/roles/${editing.id}`, form); toast.success('Rol actualizado.'); }
      else { await api.post('/roles', form); toast.success('Rol creado.'); }
      setModal(false); load();
    } catch (err) { toast.error(apiErrorMessage(err)); } finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    try { await api.delete(`/roles/${deleting.id}`); toast.success('Rol eliminado.'); setDeleting(null); load(); }
    catch (err) { toast.error(apiErrorMessage(err)); setDeleting(null); }
  };

  const grouped = permissions.reduce((acc, p) => {
    (acc[p.module] = acc[p.module] || []).push(p);
    return acc;
  }, {});

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader title="Roles y permisos" subtitle="Control de acceso basado en roles (RBAC)"
        actions={hasPermission('roles.crear') ? <button className="btn-primary" onClick={openCreate}><Plus className="h-4 w-4" /> Nuevo rol</button> : null} />

      <div className="grid gap-4 lg:grid-cols-3">
        {data.map((r) => (
          <div key={r.id} className="card p-4">
            <div className="mb-2 flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-900/30"><ShieldCheck className="h-5 w-5" /></div>
                <div>
                  <p className="font-semibold">{r.name}</p>
                  <p className="text-xs text-slate-400">{r.slug}</p>
                </div>
              </div>
              {r.is_system && <Badge color="bg-amber-100 text-amber-700">Sistema</Badge>}
            </div>
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">{r.description || '-'}</p>
            <div className="mb-3 flex gap-3 text-xs text-slate-400">
              <span>{r.permissions_count} permisos</span>
              <span>{r.users_count} usuarios</span>
            </div>
            <div className="flex gap-1">
              {hasPermission('roles.editar') && <button className="btn-secondary flex-1" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /> Editar</button>}
              {hasPermission('roles.eliminar') && !r.is_system && <button className="btn-ghost text-red-500" onClick={() => setDeleting(r)}><Trash2 className="h-4 w-4" /></button>}
            </div>
          </div>
        ))}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar rol' : 'Nuevo rol'} size="xl">
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <TextInput label="Nombre" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <TextInput label="Slug" required value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} disabled={!!editing} />
          </div>
          <TextInput label="Descripción" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div>
            <label className="label">Permisos</label>
            <div className="max-h-96 space-y-4 overflow-y-auto rounded-lg border border-slate-200 p-4 dark:border-slate-700">
              {Object.entries(grouped).map(([module, perms]) => (
                <div key={module}>
                  <p className="mb-1 text-sm font-semibold capitalize text-slate-600 dark:text-slate-300">{module}</p>
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {perms.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                        <input type="checkbox" className="h-4 w-4" checked={form.permissions.includes(p.id)} onChange={() => togglePerm(p.id)} />
                        <span className="text-slate-700 dark:text-slate-300">{p.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={confirmDelete} message={`¿Eliminar el rol "${deleting?.name}"?`} />
    </div>
  );
}
