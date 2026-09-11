import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import api, { apiErrorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { PageHeader, Loading } from '../components/ui/Misc.jsx';
import { TextInput, SelectInput } from '../components/ui/Field.jsx';

export default function Settings() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const [settings, setSettings] = useState({});
  const [catalogs, setCatalogs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/settings').then((r) => {
      setSettings(r.data.settings || {});
      setCatalogs(r.data.catalogs || {});
    }).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/settings', { settings });
      toast.success('Configuración guardada.');
    } catch (err) { toast.error(apiErrorMessage(err)); } finally { setSaving(false); }
  };

  if (loading) return <Loading />;

  const readOnly = !hasPermission('configuracion.editar');

  return (
    <div>
      <PageHeader title="Configuración" subtitle="Parámetros generales del sistema"
        actions={!readOnly ? <button className="btn-primary" onClick={save} disabled={saving}><Save className="h-4 w-4" /> {saving ? 'Guardando...' : 'Guardar'}</button> : null} />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-4 p-4">
          <h3 className="font-semibold">Preferencias generales</h3>
          <SelectInput label="Moneda principal" value={settings.moneda || 'COP'} disabled={readOnly}
            onChange={(e) => setSettings({ ...settings, moneda: e.target.value })}>
            {(catalogs?.currencies || ['COP', 'USD', 'EUR']).map((c) => <option key={c}>{c}</option>)}
          </SelectInput>
          <SelectInput label="Formato de fecha" value={settings.formato_fecha || 'YYYY-MM-DD'} disabled={readOnly}
            onChange={(e) => setSettings({ ...settings, formato_fecha: e.target.value })}>
            <option>YYYY-MM-DD</option>
            <option>DD/MM/YYYY</option>
            <option>MM/DD/YYYY</option>
          </SelectInput>
          <TextInput label="Zona horaria" value={settings.zona_horaria || ''} disabled={readOnly}
            onChange={(e) => setSettings({ ...settings, zona_horaria: e.target.value })} />
        </div>

        <div className="card space-y-4 p-4">
          <h3 className="font-semibold">Catálogos del sistema</h3>
          {catalogs && (
            <div className="space-y-3 text-sm">
              {[
                ['Tipos de cuenta', catalogs.account_types],
                ['Métodos de pago', catalogs.payment_methods],
                ['Tipos de ingreso', catalogs.income_types],
                ['Métodos de ingreso', catalogs.income_methods],
                ['Periodicidad', catalogs.periodicity],
                ['Frecuencias recurrentes', catalogs.recurring_frequencies],
                ['Monedas', catalogs.currencies],
              ].map(([title, items]) => (
                <div key={title}>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>
                  <div className="flex flex-wrap gap-1">
                    {items.map((it) => <span key={it} className="rounded bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">{it}</span>)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
