import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Wallet, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { apiErrorMessage } from '../api/client.js';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

function loadGoogleScript() {
  return new Promise((resolve) => {
    if (window.google?.accounts) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
}

export default function Login() {
  const { login, loginWithGoogle } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate('/');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.startsWith('TU_CLIENT_ID')) {
      toast.warning('Configura el Client ID de Google (VITE_GOOGLE_CLIENT_ID) en Google Cloud Console.');
      return;
    }
    setGoogleLoading(true);
    try {
      await loadGoogleScript();
      if (!window.google?.accounts) {
        toast.error('No se pudo cargar Google. Verifica tu conexión a internet.');
        return;
      }
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
      });
      window.google.accounts.id.prompt();
    } catch (err) {
      toast.error(err.message || 'Error con Google.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleCredentialResponse = async (response) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'No se pudo verificar con Google.');
      await loginWithGoogle({ email: data.google.email, name: data.google.name, picture: data.google.picture });
      navigate('/');
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4 dark:bg-navy-700">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500 text-navy-700">
            <Wallet className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">MendoCash</h1>
          <p className="text-sm text-slate-500">Gestiona tus finanzas personales y familiares</p>
        </div>
        <form onSubmit={submit} className="card space-y-4 p-6">
          <div>
            <label className="label">Correo electrónico</label>
            <input
              type="email"
              className="input"
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="correo@ejemplo.com"
              required
            />
          </div>
          <div>
            <label className="label">Contraseña</label>
            <input
              type="password"
              className="input"
              autoComplete="current-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="••••••••"
              required
            />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            <LogIn className="h-4 w-4" />
            {loading ? 'Ingresando...' : 'Iniciar sesión'}
          </button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200 dark:bg-navy-400/50" />
            <span className="text-xs text-slate-400">o</span>
            <div className="h-px flex-1 bg-slate-200 dark:bg-navy-400/50" />
          </div>

          <button type="button" className="btn-secondary w-full" onClick={handleGoogle} disabled={googleLoading}>
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            {googleLoading ? 'Conectando...' : 'Continuar con Google'}
          </button>

          <div className="text-center">
            <Link to="/forgot-password" className="text-sm text-brand-600 hover:underline">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
        </form>
        <p className="mt-6 text-center text-xs text-slate-400">
          Datos demo: admin@mendocash.com / Admin123*
        </p>
      </div>
    </div>
  );
}
