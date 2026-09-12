import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Wallet } from 'lucide-react';
import api, { apiErrorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatMoney } from '../utils/format.js';
import { ACCOUNT_TYPES } from '../constants.js';
import { PageHeader, Loading, Badge } from '../components/ui/Misc.jsx';
import { DataTable } from '../components/ui/DataTable.jsx';
import { Modal, ConfirmDialog } from '../components/ui/Modal.jsx';
import { TextInput, SelectInput, MoneyInput, Textarea } from '../components/ui/Field.jsx';

const emptyForm = {
  name: '', type: 'Cuenta bancaria', bank: '', number: '', initial_balance: 0,
  currency: 'COP', status: 'active', allow_overdraft: false, description: '',
};

export default function Accounts() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => api.get('/accounts').then((r) => setData(r.data.data)).finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setModal(true); };
  const openEdit = (a) => { setEditing(a); setForm({ ...a }); setModal(true); };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/accounts/${editing.id}`, form);
        toast.success('Cuenta actualizada.');
      } else {
        await api.post('/accounts', form);
        toast.success('Cuenta creada.');
      }
      setModal(false);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    try {
      await api.delete(`/accounts/${deleting.id}`);
      toast.success('Cuenta eliminada.');
      setDeleting(null);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
      setDeleting(null);
    }
  };

  const columns = [
    { key: 'name', header: 'Cuenta', render: (a) => (
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-900/30">
          <Wallet className="h-4 w-4" />
        </div>
        <div>
          <p className="font-medium text-slate-800 dark:text-slate-100">{a.name}</p>
          <p className="text-xs text-slate-400">{a.bank || a.type}</p>
        </div>
      </div>
    )},
    { key: 'type', header: 'Tipo' },
    { key: 'number', header: 'N°', render: (a) => a.number || '-' },
    { key: 'current_balance', header: 'Saldo', render: (a) => (
      <span className={`font-semibold ${a.current_balance < 0 ? 'text-red-600' : 'text-slate-800 dark:text-slate-100'}`}>
        {formatMoney(a.current_balance)}
      </span>
    )},
    { key: 'status', header: 'Estado', render: (a) => (
      <Badge color={a.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-slate-100 text-slate-500'}>
        {a.status === 'active' ? 'Activa' : 'Inactiva'}
      </Badge>
    )},
    {
      key: 'actions', header: 'Acciones', render: (a) => (
        <div className="flex gap-1">
          {hasPermission('cuentas.editar') && (
            <button className="btn-ghost px-2 py-1" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></button>
          )}
          {hasPermission('cuentas.eliminar') && (
            <button className="btn-ghost px-2 py-1 text-red-500" onClick={() => setDeleting(a)}><Trash2 className="h-4 w-4" /></button>
          )}
        </div>
      ),
    },
  ];

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader
        title="Cuentas"
        subtitle="Administra tus cuentas bancarias, efectivo y billeteras"
        actions={hasPermission('cuentas.crear') ? <button className="btn-primary" onClick={openCreate}><Plus className="h-4 w-4" /> Nueva cuenta</button> : null}
      />
      <div className="card overflow-hidden">
        <DataTable columns={columns} data={data} emptyMessage="No tienes cuentas registradas." />
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar cuenta' : 'Nueva cuenta'}>
        <form onSubmit={save} className="space-y-4">
          <TextInput label="Nombre" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <SelectInput label="Tipo" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {ACCOUNT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </SelectInput>
            <TextInput label="Banco / entidad" value={form.bank || ''} onChange={(e) => setForm({ ...form, bank: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TextInput label="Número / identificador" value={form.number || ''} onChange={(e) => setForm({ ...form, number: e.target.value })} />
            <SelectInput label="Estado" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="active">Activa</option>
              <option value="inactive">Inactiva</option>
            </SelectInput>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={form.allow_overdraft} onChange={(e) => setForm({ ...form, allow_overdraft: e.target.checked })} className="h-4 w-4" />
            Permitir sobregiro
          </label>
          <Textarea label="Descripción" value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={confirmDelete}
        message={`¿Eliminar la cuenta "${deleting?.name}"?`} />
    </div>
  );
}
