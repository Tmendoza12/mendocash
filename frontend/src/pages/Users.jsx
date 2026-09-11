import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Search, Power } from 'lucide-react';
import api, { apiErrorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatDateTime } from '../utils/format.js';
import { PageHeader, Loading, Badge } from '../components/ui/Misc.jsx';
import { DataTable, Pagination } from '../components/ui/DataTable.jsx';
import { Modal, ConfirmDialog } from '../components/ui/Modal.jsx';
import { TextInput } from '../components/ui/Field.jsx';

const emptyForm = { full_name: '', email: '', phone: '', password: '', roles: [] };

export default function Users() {
  const { hasPermission, user: currentUser } = useAuth();
  const toast = useToast();
  const [data, setData] = useState([]);
  const [roles, setRoles] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const load = (p = page) => {
    setLoading(true);
    api.get(`/users?page=${p}&limit=10${search ? `&search=${search}` : ''}`).then((r) => {
      setData(r.data.data); setTotal(r.data.total); setPage(r.data.page);
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    load(1);
    api.get('/roles').then((r) => setRoles(r.data.data));
  }, []);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setModal(true); };
  const openEdit = (u) => { setEditing(u); setForm({ ...u, password: '', roles: u.roles.map((r) => r.id) }); setModal(true); };

  const toggleRole = (roleId) => {
    setForm((f) => ({
      ...f,
      roles: f.roles.includes(roleId) ? f.roles.filter((r) => r !== roleId) : [...f.roles, roleId],
    }));
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) { await api.put(`/users/${editing.id}`, form); toast.success('Usuario actualizado.'); }
      else { await api.post('/users', form); toast.success('Usuario creado.'); }
      setModal(false); load(page);
    } catch (err) { toast.error(apiErrorMessage(err)); } finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    try { await api.delete(`/users/${deleting.id}`); toast.success('Usuario eliminado.'); setDeleting(null); load(page); }
    catch (err) { toast.error(apiErrorMessage(err)); setDeleting(null); }
  };

  const toggleStatus = async (u) => {
    try {
      await api.patch(`/users/${u.id}/status`, { is_active: !u.is_active });
      toast.success(u.is_active ? 'Usuario desactivado.' : 'Usuario activado.');
      load(page);
    } catch (err) { toast.error(apiErrorMessage(err)); }
  };

  const columns = [
    { key: 'full_name', header: 'Usuario', render: (u) => (
      <div>
        <p className="font-medium">{u.full_name}</p>
        <p className="text-xs text-slate-400">{u.email}</p>
      </div>
    )},
    { key: 'roles', header: 'Roles', render: (u) => (
      <div className="flex flex-wrap gap-1">
        {u.roles.map((r) => <Badge key={r.id} color="bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">{r.name}</Badge>)}
      </div>
    )},
    { key: 'last_login_at', header: 'Último acceso', render: (u) => formatDateTime(u.last_login_at) },
    { key: 'is_active', header: 'Estado', render: (u) => (
      <Badge color={u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
        {u.is_active ? 'Activo' : 'Inactivo'}
      </Badge>
    )},
    {
      key: 'actions', header: '', render: (u) => (
        <div className="flex justify-end gap-1">
          {hasPermission('usuarios.editar') && u.id !== currentUser?.id && (
            <button className="btn-ghost px-2 py-1" title={u.is_active ? 'Desactivar' : 'Activar'} onClick={() => toggleStatus(u)}><Power className="h-4 w-4" /></button>
          )}
          {hasPermission('usuarios.editar') && <button className="btn-ghost px-2 py-1" onClick={() => openEdit(u)}><Pencil className="h-4 w-4" /></button>}
          {hasPermission('usuarios.eliminar') && u.id !== currentUser?.id && <button className="btn-ghost px-2 py-1 text-red-500" onClick={() => setDeleting(u)}><Trash2 className="h-4 w-4" /></button>}
        </div>
      ),
    },
  ];

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader title="Usuarios" subtitle="Administra los usuarios del sistema"
        actions={hasPermission('usuarios.crear') ? <button className="btn-primary" onClick={openCreate}><Plus className="h-4 w-4" /> Nuevo usuario</button> : null} />

      <div className="card mb-4 p-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Buscar por nombre o correo..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1)} />
        </div>
      </div>

      <div className="card overflow-hidden">
        <DataTable columns={columns} data={data} emptyMessage="No hay usuarios." />
        <Pagination page={page} limit={10} total={total} onChange={load} />
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar usuario' : 'Nuevo usuario'} size="lg">
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <TextInput label="Nombre completo" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            <TextInput label="Correo" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TextInput label="Teléfono" value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <TextInput label={editing ? 'Nueva contraseña (opcional)' : 'Contraseña'} type="password" required={!editing} minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div>
            <label className="label">Roles</label>
            <div className="grid grid-cols-2 gap-2">
              {roles.map((r) => (
                <label key={r.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                  <input type="checkbox" className="h-4 w-4" checked={form.roles.includes(r.id)} onChange={() => toggleRole(r.id)} />
                  {r.name}
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={confirmDelete} message={`¿Eliminar el usuario "${deleting?.full_name}"? Esta acción eliminará también sus datos.`} />
    </div>
  );
}
