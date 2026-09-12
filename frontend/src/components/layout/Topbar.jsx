import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, Sun, Moon, Bell, LogOut, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import api from '../../api/client.js';

export default function Topbar({ onMenu }) {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const menuRef = useRef(null);
  const bellRef = useRef(null);

  useEffect(() => {
    if (!user?.permissions?.includes('notificaciones.ver')) return;
    api.get('/notifications').then((res) => setUnread(res.data.unread)).catch(() => {});
  }, [user]);

  useEffect(() => {
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
      if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const loadNotifications = async () => {
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data.data.slice(0, 8));
    } catch {
      /* ignore */
    }
  };

  const initials = (user?.full_name || '?')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header
      className="sticky top-0 z-20 flex min-h-[78px] items-center justify-between border-b border-[#dce8ec] bg-white px-[31px] dark:border-navy-500/40 dark:bg-navy-700"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex items-center gap-3">
        <button className="btn-ghost px-2 lg:hidden" onClick={onMenu} aria-label="Abrir menú de navegación">
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-sm text-ink-soft dark:text-slate-400">
          {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {user?.permissions?.includes('notificaciones.ver') && (
          <div className="relative" ref={bellRef}>
            <button
              className="btn-ghost relative px-2"
              aria-label="Notificaciones"
              onClick={() => {
                setBellOpen((o) => !o);
                if (!bellOpen) loadNotifications();
              }}
            >
              <Bell className="h-5 w-5" />
              {unread > 0 && (
                <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {unread}
                </span>
              )}
            </button>
            {bellOpen && (
              <div className="absolute right-0 mt-2 w-80 rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 dark:border-slate-700">
                  <span className="text-sm font-semibold">Notificaciones</span>
                  <button
                    className="text-xs text-brand-600 hover:underline"
                    onClick={() => {
                      api.post('/notifications/read-all').then(() => setUnread(0));
                      setBellOpen(false);
                    }}
                  >
                    Marcar leídas
                  </button>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-slate-400">Sin notificaciones.</p>
                  ) : (
                    notifications.map((n) => (
                      <div key={n.id} className="border-b border-slate-100 px-4 py-2 dark:border-slate-700/60">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{n.title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{n.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <button className="btn-ghost px-2" onClick={toggle} aria-label="Cambiar entre modo claro y oscuro">
          {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>

        <div className="relative" ref={menuRef}>
          <button
            className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-brand-50 dark:hover:bg-navy-600"
            aria-label="Menú de usuario"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: 'linear-gradient(145deg, #55b8ae, #249a91)' }}>
              {initials}
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-sm font-medium leading-tight text-ink dark:text-slate-200">{user?.full_name}</p>
              <p className="text-xs leading-tight text-ink-soft">{user?.roles?.map((r) => r.name).join(', ') || ''}</p>
            </div>
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
              <button
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                onClick={() => {
                  setMenuOpen(false);
                  navigate('/perfil');
                }}
              >
                <User className="h-4 w-4" /> Mi perfil
              </button>
              <button
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-slate-100 dark:hover:bg-slate-700"
                onClick={async () => {
                  await logout();
                  window.location.replace('/');
                }}
              >
                <LogOut className="h-4 w-4" /> Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
