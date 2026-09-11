import { useEffect, useState } from 'react';
import { Plus, Trash2, ArrowLeftRight } from 'lucide-react';
import api, { apiErrorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatMoney, formatDate, todayISO } from '../utils/format.js';
import { PageHeader, Loading } from '../components/ui/Misc.jsx';
import { DataTable } from '../components/ui/DataTable.jsx';
import { Modal, ConfirmDialog } from '../components/ui/Modal.jsx';
import { SelectInput, MoneyInput, TextInput } from '../components/ui/Field.jsx';

export default function Transfers() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const [data, setData] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ from_account_id: '', to_account_id: '', amount: '', date: todayISO(), description: '' });

  const load = () => api.get('/transfers').then((r) => setData(r.data.data)).finally(() => setLoading(false));

  useEffect(() => {
    load();
    api.get('/accounts').then((r) => setAccounts(r.data.data));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/transfers', form);
      toast.success('Transferencia realizada.');
      setModal(false);
      load();
    } catch (err) { toast.error(apiErrorMessage(err)); } finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    try { await api.delete(`/transfers/${deleting.id}`); toast.success('Transferencia eliminada.'); setDeleting(null); load(); }
    catch (err) { toast.error(apiErrorMessage(err)); setDeleting(null); }
  };

  const columns = [
    { key: 'date', header: 'Fecha', render: (t) => formatDate(t.date) },
    {
      key: 'flow', header: 'Transferencia', render: (t) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{t.from_account_name}</span>
          <ArrowLeftRight className="h-4 w-4 text-slate-400" />
          <span className="font-medium">{t.to_account_name}</span>
        </div>
      ),
    },
    { key: 'description', header: 'Descripción', render: (t) => t.description || '-' },
    { key: 'amount', header: 'Valor', render: (t) => <span className="font-semibold text-brand-600">{formatMoney(t.amount)}</span> },
    {
      key: 'actions', header: '', render: (t) => (
        <div className="flex justify-end">
          {hasPermission('transferencias.eliminar') && <button className="btn-ghost px-2 py-1 text-red-500" onClick={() => setDeleting(t)}><Trash2 className="h-4 w-4" /></button>}
        </div>
      ),
    },
  ];

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader title="Transferencias" subtitle="Mueve dinero entre tus cuentas"
        actions={hasPermission('transferencias.crear') ? <button className="btn-primary" onClick={() => { setForm({ from_account_id: accounts[0]?.id || '', to_account_id: accounts[1]?.id || '', amount: '', date: todayISO(), description: '' }); setModal(true); }}><Plus className="h-4 w-4" /> Nueva transferencia</button> : null} />
      <div className="card overflow-hidden">
        <DataTable columns={columns} data={data} emptyMessage="No hay transferencias." />
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Nueva transferencia">
        <form onSubmit={save} className="space-y-4">
          <SelectInput label="Cuenta origen" required value={form.from_account_id} onChange={(e) => setForm({ ...form, from_account_id: e.target.value })}>
            <option value="">Selecciona</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({formatMoney(a.current_balance)})</option>)}
          </SelectInput>
          <SelectInput label="Cuenta destino" required value={form.to_account_id} onChange={(e) => setForm({ ...form, to_account_id: e.target.value })}>
            <option value="">Selecciona</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </SelectInput>
          <div className="grid grid-cols-2 gap-3">
            <MoneyInput label="Valor" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <TextInput label="Fecha" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <TextInput label="Descripción" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Transferiendo...' : 'Transferir'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={confirmDelete} message="¿Eliminar esta transferencia?" />
    </div>
  );
}
