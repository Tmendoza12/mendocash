import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Eye } from 'lucide-react';
import api, { apiErrorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatMoney, formatDate, todayISO, loanStatusLabels, statusColor } from '../utils/format.js';
import { LOAN_STATUSES, PERIODICITY } from '../constants.js';
import { PageHeader, Loading, Badge } from '../components/ui/Misc.jsx';
import { DataTable } from '../components/ui/DataTable.jsx';
import { Modal, ConfirmDialog } from '../components/ui/Modal.jsx';
import { TextInput, SelectInput, MoneyInput, Textarea } from '../components/ui/Field.jsx';

const emptyForm = {
  person_id: '', type: 'lent', amount: '', interest_rate: 0, date: todayISO(), due_date: '',
  num_installments: 1, periodicity: 'mensual', installment_amount: 0, description: '', status: 'pending',
};

export default function Loans() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const [data, setData] = useState([]);
  const [people, setPeople] = useState([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [payModal, setPayModal] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [payForm, setPayForm] = useState({ date: todayISO(), amount: '', installment_number: '', account_id: '', interest: 0, notes: '' });

  const load = () => api.get(`/loans${typeFilter ? `?type=${typeFilter}` : ''}`).then((r) => setData(r.data.data)).finally(() => setLoading(false));

  useEffect(() => {
    load();
    api.get('/people').then((r) => setPeople(r.data.data));
    api.get('/accounts').then((r) => setAccounts(r.data.data));
  }, [typeFilter]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setModal(true); };
  const openEdit = (l) => { setEditing(l); setForm({ ...l, person_id: l.person_id || '' }); setModal(true); };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) { await api.put(`/loans/${editing.id}`, form); toast.success('Préstamo actualizado.'); }
      else { await api.post('/loans', form); toast.success('Préstamo creado.'); }
      setModal(false); load();
    } catch (err) { toast.error(apiErrorMessage(err)); } finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    try { await api.delete(`/loans/${deleting.id}`); toast.success('Préstamo eliminado.'); setDeleting(null); load(); }
    catch (err) { toast.error(apiErrorMessage(err)); setDeleting(null); }
  };

  const openDetail = async (l) => {
    setDetail(l);
    const r = await api.get(`/loans/${l.id}`);
    setDetailData(r.data);
  };

  const savePayment = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/loans/${detail.id}/payments`, payForm);
      toast.success('Pago registrado.');
      setPayModal(false);
      setPayForm({ date: todayISO(), amount: '', installment_number: '', account_id: '', interest: 0, notes: '' });
      openDetail(detail);
      load();
    } catch (err) { toast.error(apiErrorMessage(err)); }
  };

  const removePayment = async (pid) => {
    try { await api.delete(`/loans/${detail.id}/payments/${pid}`); toast.success('Pago eliminado.'); openDetail(detail); load(); }
    catch (err) { toast.error(apiErrorMessage(err)); }
  };

  const columns = [
    { key: 'person_name', header: 'Persona', render: (l) => <span className="font-medium">{l.person_name || l.description || '-'}</span> },
    { key: 'type', header: 'Tipo', render: (l) => (
      <Badge color={l.type === 'lent' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'}>
        {l.type === 'lent' ? 'Presté' : 'Recibí'}
      </Badge>
    )},
    { key: 'amount', header: 'Capital', render: (l) => formatMoney(l.amount) },
    { key: 'pending', header: 'Pendiente', render: (l) => <span className="font-semibold">{formatMoney(l.pending)}</span> },
    { key: 'next_due_date', header: 'Próx. cuota', render: (l) => formatDate(l.next_due_date) },
    { key: 'status', header: 'Estado', render: (l) => <Badge color={statusColor[l.status]}>{loanStatusLabels[l.status]}</Badge> },
    {
      key: 'actions', header: '', render: (l) => (
        <div className="flex justify-end gap-1">
          <button className="btn-ghost px-2 py-1" onClick={() => openDetail(l)}><Eye className="h-4 w-4" /></button>
          {hasPermission('prestamos.editar') && <button className="btn-ghost px-2 py-1" onClick={() => openEdit(l)}><Pencil className="h-4 w-4" /></button>}
          {hasPermission('prestamos.eliminar') && <button className="btn-ghost px-2 py-1 text-red-500" onClick={() => setDeleting(l)}><Trash2 className="h-4 w-4" /></button>}
        </div>
      ),
    },
  ];

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader title="Préstamos" subtitle="Dinero que prestas y que te prestan"
        actions={
          <div className="flex gap-2">
            <select className="input w-auto" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">Todos</option>
              <option value="lent">Dinero prestado</option>
              <option value="borrowed">Dinero recibido</option>
            </select>
            {hasPermission('prestamos.crear') && <button className="btn-primary" onClick={openCreate}><Plus className="h-4 w-4" /> Nuevo préstamo</button>}
          </div>
        } />
      <div className="card overflow-hidden">
        <DataTable columns={columns} data={data} emptyMessage="No hay préstamos." />
      </div>

      {/* Crear/editar */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar préstamo' : 'Nuevo préstamo'} size="lg">
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <SelectInput label="Tipo" required value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="lent">Dinero que presté</option>
              <option value="borrowed">Dinero que recibí</option>
            </SelectInput>
            <SelectInput label="Persona" value={form.person_id} onChange={(e) => setForm({ ...form, person_id: e.target.value })}>
              <option value="">Sin persona</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </SelectInput>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <MoneyInput label="Valor" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <TextInput label="Tasa interés (%)" type="number" step="0.01" value={form.interest_rate} onChange={(e) => setForm({ ...form, interest_rate: e.target.value })} />
            <TextInput label="N° cuotas" type="number" min="1" value={form.num_installments} onChange={(e) => setForm({ ...form, num_installments: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <TextInput label="Fecha" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            <TextInput label="Vencimiento" type="date" value={form.due_date || ''} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            <MoneyInput label="Valor cuota" value={form.installment_amount} onChange={(e) => setForm({ ...form, installment_amount: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SelectInput label="Periodicidad" value={form.periodicity} onChange={(e) => setForm({ ...form, periodicity: e.target.value })}>
              {PERIODICITY.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </SelectInput>
            <SelectInput label="Estado" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {LOAN_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </SelectInput>
          </div>
          <TextInput label="Descripción" value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>

      {/* Detalle */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="Detalle del préstamo" size="lg">
        {detailData && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                <p className="text-xs text-slate-400">Capital inicial</p>
                <p className="font-semibold">{formatMoney(detailData.loan.amount)}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                <p className="text-xs text-slate-400">Total pagado</p>
                <p className="font-semibold text-green-600">{formatMoney(detailData.loan.paid)}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                <p className="text-xs text-slate-400">Pendiente</p>
                <p className="font-semibold text-red-600">{formatMoney(detailData.loan.pending)}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                <p className="text-xs text-slate-400">Próx. cuota</p>
                <p className="font-semibold">{detailData.loan.next_due_date ? formatDate(detailData.loan.next_due_date) : '-'}</p>
              </div>
            </div>

            <div className="flex gap-2 text-sm">
              <Badge color="bg-green-100 text-green-700">Pagadas: {detailData.loan.paid_installments}</Badge>
              <Badge color="bg-slate-100 text-slate-600">Pendientes: {detailData.loan.pending_installments}</Badge>
              <Badge color="bg-red-100 text-red-700">Vencidas: {detailData.loan.overdue_installments}</Badge>
            </div>

            {hasPermission('prestamos.editar') && (
              <button className="btn-primary" onClick={() => setPayModal(true)}><Plus className="h-4 w-4" /> Registrar pago</button>
            )}

            <div>
              <h4 className="mb-2 text-sm font-semibold">Pagos registrados</h4>
              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="table-head">Fecha</th>
                      <th className="table-head">Cuota</th>
                      <th className="table-head">Capital</th>
                      <th className="table-head">Interés</th>
                      <th className="table-head">Total</th>
                      <th className="table-head"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {detailData.payments.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-4 text-center text-slate-400">Sin pagos.</td></tr>
                    )}
                    {detailData.payments.map((p) => (
                      <tr key={p.id}>
                        <td className="table-cell">{formatDate(p.date)}</td>
                        <td className="table-cell">{p.installment_number || '-'}</td>
                        <td className="table-cell">{formatMoney(p.principal)}</td>
                        <td className="table-cell">{formatMoney(p.interest)}</td>
                        <td className="table-cell font-semibold">{formatMoney(p.amount)}</td>
                        <td className="table-cell">
                          {hasPermission('prestamos.editar') && (
                            <button className="text-xs text-red-500 hover:underline" onClick={() => removePayment(p.id)}>Eliminar</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Registrar pago */}
      <Modal open={payModal} onClose={() => setPayModal(false)} title="Registrar pago">
        <form onSubmit={savePayment} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <MoneyInput label="Valor pagado" required value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
            <TextInput label="Fecha" type="date" required value={payForm.date} onChange={(e) => setPayForm({ ...payForm, date: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TextInput label="N° de cuota" type="number" min="1" value={payForm.installment_number} onChange={(e) => setPayForm({ ...payForm, installment_number: e.target.value })} />
            <SelectInput label="Cuenta" value={payForm.account_id} onChange={(e) => setPayForm({ ...payForm, account_id: e.target.value })}>
              <option value="">Sin cuenta</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </SelectInput>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MoneyInput label="Capital" value={payForm.principal || payForm.amount} onChange={(e) => setPayForm({ ...payForm, principal: e.target.value })} />
            <MoneyInput label="Interés" value={payForm.interest} onChange={(e) => setPayForm({ ...payForm, interest: e.target.value })} />
          </div>
          <Textarea label="Observaciones" value={payForm.notes || ''} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setPayModal(false)}>Cancelar</button>
            <button type="submit" className="btn-primary">Registrar</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={confirmDelete} message="¿Eliminar este préstamo?" />
    </div>
  );
}
