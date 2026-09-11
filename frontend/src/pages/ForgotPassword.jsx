import { useState } from 'react';
import { Link } from 'react-router-dom';
import api, { apiErrorMessage } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';

export default function ForgotPassword() {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post('/auth/forgot-password', { email });
      setResult(res.data);
      toast.success('Token de recuperación generado.');
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
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Recuperar contraseña</h1>
          <p className="text-sm text-slate-500">Ingresa tu correo para generar un token de recuperación.</p>
          <div>
            <label className="label">Correo electrónico</label>
            <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <button className="btn-primary w-full" disabled={loading}>
            {loading ? 'Enviando...' : 'Enviar'}
          </button>
          {result?.reset_token && (
            <div className="rounded-lg bg-slate-100 p-3 text-xs dark:bg-slate-800">
              <p className="mb-1 font-semibold">Token de recuperación (demo):</p>
              <p className="break-all text-brand-600">{result.reset_token}</p>
            </div>
          )}
          <div className="text-center">
            <Link to="/login" className="text-sm text-brand-600 hover:underline">Volver al inicio de sesión</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
