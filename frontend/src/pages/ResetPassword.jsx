import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { apiErrorMessage } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';

export default function ResetPassword() {
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ token: '', new_password: '' });
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/reset-password', form);
      toast.success('Contraseña restablecida. Inicia sesión.');
      navigate('/login');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4 dark:bg-slate-950">
      <div className="w-full max-w-md">
        <form onSubmit={submit} className="card space-y-4 p-6">
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Restablecer contraseña</h1>
          <div>
            <label className="label">Token de recuperación</label>
            <input className="input" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} required />
          </div>
          <div>
            <label className="label">Nueva contraseña</label>
            <input
              type="password"
              className="input"
              value={form.new_password}
              onChange={(e) => setForm({ ...form, new_password: e.target.value })}
              minLength={8}
              required
            />
          </div>
          <button className="btn-primary w-full" disabled={loading}>
            {loading ? 'Restableciendo...' : 'Restablecer'}
          </button>
          <div className="text-center">
            <Link to="/login" className="text-sm text-brand-600 hover:underline">Volver al inicio de sesión</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
