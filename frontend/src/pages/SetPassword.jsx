import { useState } from 'react';
import { KeyRound, LogOut } from 'lucide-react';
import api, { apiErrorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Wallet } from 'lucide-react';

export default function SetPassword() {
  const { user, clearMustSetPassword, logout } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (form.password.length < 8) { toast.error('La contraseña debe tener al menos 8 caracteres.'); return; }
    if (form.password !== form.confirm) { toast.error('Las contraseñas no coinciden.'); return; }
    setSaving(true);
    try {
      await api.post('/auth/set-password', { password: form.password });
      clearMustSetPassword();
      toast.success('Contraseña configurada correctamente.');
    } catch (err) { toast.error(apiErrorMessage(err)); } finally { setSaving(false); }
  };

  const handleLogout = async () => {
    await logout();
    window.location.replace('/');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-mist p-4 dark:bg-navy-800">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500 text-white">
            <Wallet className="h-7 w-7" />
          </div>
          <h1 className="font-serif text-3xl font-bold text-ink dark:text-white">MendoCash</h1>
        </div>
        <form onSubmit={submit} className="card space-y-4 p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-brand-50 p-2 text-brand-700">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-ink dark:text-white">Crea tu contraseña de acceso</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Hola {user?.full_name || ''}, ingresaste con Google. Establece una contraseña para poder entrar después sin Google.
              </p>
            </div>
          </div>
          <div>
            <label className="label">Nueva contraseña</label>
            <input type="password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={8} required />
          </div>
          <div>
            <label className="label">Confirmar contraseña</label>
            <input type="password" className="input" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} minLength={8} required />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={saving}>
            {saving ? 'Guardando...' : 'Establecer contraseña'}
          </button>
          <button type="button" className="btn-ghost w-full text-red-500" onClick={handleLogout}>
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}
