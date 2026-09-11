import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Eye } from 'lucide-react';
import api, { apiErrorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatMoney, formatDate, todayISO, loanStatusLabels, statusColor } from '../utils/format.js';
import { LOAN_STATUSES } from '../constants.js';
import { PageHeader, Loading, Badge } from '../components/ui/Misc.jsx';
import { DataTable } from '../components/ui/DataTable.jsx';
import { Modal, ConfirmDialog } from '../components/ui/Modal.jsx';
import { TextInput, SelectInput, MoneyInput, Textarea } from '../components/ui/Field.jsx';

const emptyForm = {
  creditor: '', concept: '', amount: '', start_date: todayISO(), due_date: '',
  interest_rate: 0, num_installments: 1, installment_amount: 0, status: 'pending',
};

export default function Debts() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const [data, setData] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [payModal, setPayModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [payForm, setPayForm] = useState({ date: todayISO(), amount: '', account_id: '', notes: '' });

  const load = () => api.get('/debts').then((r) => setData(r.data.data)).finally(() => setLoading(false));
  useEffect(() => { load(); api.get('/accounts').then((r) => setAccounts(r.data.data)); }, []);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setModal(true); };
  const openEdit = (d) => { setEditing(d); setForm({ ...d }); setModal(true); };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) { await api.put(`/debts/${editing.id}`, form); toast.success('Deuda actualizada.'); }
      else { await api.post('/debts', form); toast.success('Deuda creada.'); }
      setModal(false); load();
    } catch (err) { toast.error(apiErrorMessage(err)); } finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    try { await api.delete(`/debts/${deleting.id}`); toast.success('Deuda eliminada.'); setDeleting(null); load(); }
    catch (err) { toast.error(apiErrorMessage(err)); setDeleting(null); }
  };

  const openDetail = async (d) => { setDetail(d); const r = await api.get(`/debts/${d.id}`); setDetailData(r.data); };

  const savePayment = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/debts/${detail.id}/payments`, payForm);
      toast.success('Pago registrado.');
      setPayModal(false);
      setPayForm({ date: todayISO(), amount: '', account_id: '', notes: '' });
      openDetail(detail); load();
    } catch (err) { toast.error(apiErrorMessage(err)); }
  };

  const removePayment = async (pid) => {
    try { await api.delete(`/debts/${detail.id}/payments/${pid}`); toast.success('Pago eliminado.'); openDetail(detail); load(); }
    catch (err) { toast.error(apiErrorMessage(err)); }
  };

  const columns = [
    { key: 'creditor', header: 'Acreedor', render: (d) => <span className="font-medium">{d.creditor}</span> },
    { key: 'concept', header: 'Concepto', render: (d) => d.concept || '-' },
    { key: 'amount', header: 'Valor', render: (d) => formatMoney(d.amount) },
    { key: 'pending', header: 'Pendiente', render: (d) => <span className="font-semibold">{formatMoney(d.pending)}</span> },
    { key: 'due_date', header: 'Vence', render: (d) => formatDate(d.due_date) },
    { key: 'status', header: 'Estado', render: (d) => <Badge color={statusColor[d.status]}>{loanStatusLabels[d.status]}</Badge> },
    {
      key: 'actions', header: '', render: (d) => (
        <div className="flex justify-end gap-1">
          <button className="btn-ghost px-2 py-1" onClick={() => openDetail(d)}><Eye className="h-4 w-4" /></button>
          {hasPermission('deudas.editar') && <button className="btn-ghost px-2 py-1" onClick={() => openEdit(d)}><Pencil className="h-4 w-4" /></button>}
          {hasPermission('deudas.eliminar') && <button className="btn-ghost px-2 py-1 text-red-500" onClick={() => setDeleting(d)}><Trash2 className="h-4 w-4" /></button>}
        </div>
      ),
    },
  ];

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader title="Deudas" subtitle="Controla tus obligaciones y créditos"
        actions={hasPermission('deudas.crear') ? <button className="btn-primary" onClick={openCreate}><Plus className="h-4 w-4" /> Nueva deuda</button> : null} />
      <div className="card overflow-hidden">
        <DataTable columns={columns} data={data} emptyMessage="No hay deudas." />
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar deuda' : 'Nueva deuda'} size="lg">
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <TextInput label="Acreedor" required value={form.creditor} onChange={(e) => setForm({ ...form, creditor: e.target.value })} />
            <TextInput label="Concepto" value={form.concept || ''} onChange={(e) => setForm({ ...form, concept: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <MoneyInput label="Valor" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <TextInput label="Tasa interés (%)" type="number" step="0.01" value={form.interest_rate} onChange={(e) => setForm({ ...form, interest_rate: e.target.value })} />
            <TextInput label="N° cuotas" type="number" min="1" value={form.num_installments} onChange={(e) => setForm({ ...form, num_installments: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <TextInput label="Fecha inicio" type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            <TextInput label="Vencimiento" type="date" value={form.due_date || ''} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            <MoneyInput label="Valor cuota" value={form.installment_amount} onChange={(e) => setForm({ ...form, installment_amount: e.target.value })} />
          </div>
          <SelectInput label="Estado" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {LOAN_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </SelectInput>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title="Detalle de la deuda" size="lg">
        {detailData && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                <p className="text-xs text-slate-400">Valor</p>
                <p className="font-semibold">{formatMoney(detailData.debt.amount)}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                <p className="text-xs text-slate-400">Pagado</p>
                <p className="font-semibold text-green-600">{formatMoney(detailData.debt.paid)}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                <p className="text-xs text-slate-400">Pendiente</p>
                <p className="font-semibold text-red-600">{formatMoney(detailData.debt.pending)}</p>
              </div>
            </div>
            {hasPermission('deudas.editar') && (
              <button className="btn-primary" onClick={() => setPayModal(true)}><Plus className="h-4 w-4" /> Registrar pago</button>
            )}
            <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr><th className="table-head">Fecha</th><th className="table-head">Valor</th><th className="table-head">Cuenta</th><th className="table-head"></th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {detailData.payments.length === 0 && <tr><td colSpan={4} className="px-4 py-4 text-center text-slate-400">Sin pagos.</td></tr>}
                  {detailData.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="table-cell">{formatDate(p.date)}</td>
                      <td className="table-cell font-semibold">{formatMoney(p.amount)}</td>
                      <td className="table-cell">{p.account_name || '-'}</td>
                      <td className="table-cell">{hasPermission('deudas.editar') && <button className="text-xs text-red-500 hover:underline" onClick={() => removePayment(p.id)}>Eliminar</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={payModal} onClose={() => setPayModal(false)} title="Registrar pago">
        <form onSubmit={savePayment} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <MoneyInput label="Valor pagado" required value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
            <TextInput label="Fecha" type="date" required value={payForm.date} onChange={(e) => setPayForm({ ...payForm, date: e.target.value })} />
          </div>
          <SelectInput label="Cuenta" value={payForm.account_id} onChange={(e) => setPayForm({ ...payForm, account_id: e.target.value })}>
            <option value="">Sin cuenta</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </SelectInput>
          <Textarea label="Notas" value={payForm.notes || ''} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setPayModal(false)}>Cancelar</button>
            <button type="submit" className="btn-primary">Registrar</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={confirmDelete} message="¿Eliminar esta deuda?" />
    </div>
  );
}
