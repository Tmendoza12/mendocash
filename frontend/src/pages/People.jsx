import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, User } from 'lucide-react';
import api, { apiErrorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { RELATION_TYPES } from '../constants.js';
import { PageHeader, Loading, Badge } from '../components/ui/Misc.jsx';
import { DataTable } from '../components/ui/DataTable.jsx';
import { Modal, ConfirmDialog } from '../components/ui/Modal.jsx';
import { TextInput, SelectInput, Textarea } from '../components/ui/Field.jsx';

export default function People() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ full_name: '', phone: '', cedula: '', relation_type: '', notes: '', status: 'active' });

  const load = () => api.get('/people').then((r) => setData(r.data.data)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm({ full_name: '', phone: '', cedula: '', relation_type: '', notes: '', status: 'active' }); setModal(true); };
  const openEdit = (p) => { setEditing(p); setForm({ ...p }); setModal(true); };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) { await api.put(`/people/${editing.id}`, form); toast.success('Persona actualizada.'); }
      else { await api.post('/people', form); toast.success('Persona creada.'); }
      setModal(false); load();
    } catch (err) { toast.error(apiErrorMessage(err)); } finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    try { await api.delete(`/people/${deleting.id}`); toast.success('Persona eliminada.'); setDeleting(null); load(); }
    catch (err) { toast.error(apiErrorMessage(err)); setDeleting(null); }
  };

  const columns = [
    { key: 'full_name', header: 'Nombre', render: (p) => (
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800">
          <User className="h-4 w-4" />
        </div>
        <span className="font-medium">{p.full_name}</span>
      </div>
    )},
    { key: 'phone', header: 'Teléfono', render: (p) => p.phone || '-' },
    { key: 'cedula', header: 'Cédula', render: (p) => p.cedula || '-' },
    { key: 'relation_type', header: 'Relación', render: (p) => p.relation_type || '-' },
    { key: 'loans_count', header: 'Préstamos', render: (p) => p.loans_count },
    { key: 'status', header: 'Estado', render: (p) => <Badge color={p.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}>{p.status === 'active' ? 'Activo' : 'Inactivo'}</Badge> },
    {
      key: 'actions', header: '', render: (p) => (
        <div className="flex justify-end gap-1">
          {hasPermission('personas.editar') && <button className="btn-ghost px-2 py-1" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></button>}
          {hasPermission('personas.eliminar') && <button className="btn-ghost px-2 py-1 text-red-500" onClick={() => setDeleting(p)}><Trash2 className="h-4 w-4" /></button>}
        </div>
      ),
    },
  ];

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader title="Personas" subtitle="Catálogo de personas relacionadas con préstamos"
        actions={hasPermission('personas.crear') ? <button className="btn-primary" onClick={openCreate}><Plus className="h-4 w-4" /> Nueva persona</button> : null} />
      <div className="card overflow-hidden">
        <DataTable columns={columns} data={data} emptyMessage="No hay personas registradas." />
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar persona' : 'Nueva persona'}>
        <form onSubmit={save} className="space-y-4">
          <TextInput label="Nombre completo" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <TextInput label="Teléfono" value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <TextInput label="Cédula" value={form.cedula || ''} onChange={(e) => setForm({ ...form, cedula: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SelectInput label="Tipo de relación" value={form.relation_type || ''} onChange={(e) => setForm({ ...form, relation_type: e.target.value })}>
              <option value="">Selecciona</option>
              {RELATION_TYPES.map((t) => <option key={t}>{t}</option>)}
            </SelectInput>
            <SelectInput label="Estado" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="active">Activo</option>
              <option value="inactive">Inactivo</option>
            </SelectInput>
          </div>
          <Textarea label="Notas" value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={confirmDelete} message="¿Eliminar esta persona?" />
    </div>
  );
}
