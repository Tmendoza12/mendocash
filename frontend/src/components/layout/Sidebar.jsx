import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Wallet, ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, ListOrdered,
  Tags, Target, RefreshCcw, HandCoins, Users as UsersIcon, CreditCard, BarChart3,
  CalendarDays, ShieldCheck, UserCog, Settings, PiggyBank,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';

const NAV = [
  { section: 'Principal', items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard.ver', end: true }] },
  {
    section: 'Finanzas',
    items: [
      { to: '/cuentas', label: 'Cuentas', icon: Wallet, permission: 'cuentas.ver' },
      { to: '/ingresos', label: 'Ingresos', icon: ArrowDownCircle, permission: 'ingresos.ver' },
      { to: '/gastos', label: 'Gastos', icon: ArrowUpCircle, permission: 'gastos.ver' },
      { to: '/transferencias', label: 'Transferencias', icon: ArrowLeftRight, permission: 'transferencias.ver' },
      { to: '/movimientos', label: 'Movimientos', icon: ListOrdered, permission: 'movimientos.ver' },
    ],
  },
  {
    section: 'Organización',
    items: [
      { to: '/categorias', label: 'Categorías', icon: Tags, permission: 'categorias.ver' },
      { to: '/presupuestos', label: 'Presupuestos', icon: Target, permission: 'presupuestos.ver' },
      { to: '/recurrentes', label: 'Recurrentes', icon: RefreshCcw, permission: 'recurrentes.ver' },
    ],
  },
  {
    section: 'Préstamos y deudas',
    items: [
      { to: '/prestamos', label: 'Préstamos', icon: HandCoins, permission: 'prestamos.ver' },
      { to: '/personas', label: 'Personas', icon: UsersIcon, permission: 'personas.ver' },
      { to: '/deudas', label: 'Deudas', icon: CreditCard, permission: 'deudas.ver' },
    ],
  },
  {
    section: 'Análisis',
    items: [
      { to: '/reportes', label: 'Reportes', icon: BarChart3, permission: 'reportes.ver' },
      { to: '/calendario', label: 'Calendario', icon: CalendarDays, permission: 'dashboard.ver' },
    ],
  },
  {
    section: 'Administración',
    items: [
      { to: '/usuarios', label: 'Usuarios', icon: UserCog, permission: 'usuarios.ver' },
      { to: '/roles', label: 'Roles y permisos', icon: ShieldCheck, permission: 'roles.ver' },
      { to: '/auditoria', label: 'Auditoría', icon: PiggyBank, permission: 'auditoria.ver' },
      { to: '/configuracion', label: 'Configuración', icon: Settings, permission: 'configuracion.ver' },
    ],
  },
];

export default function Sidebar({ open, onClose }) {
  const { hasPermission } = useAuth();

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={onClose} />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 transform flex-col border-r border-slate-200 bg-white transition-transform dark:border-slate-800 dark:bg-slate-900 lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-5 dark:border-slate-800">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-navy-700">
            <Wallet className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold text-slate-800 dark:text-slate-100">MendoCash</span>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV.map((group) => {
            const items = group.items.filter((i) => hasPermission(i.permission));
            if (!items.length) return null;
            return (
              <div key={group.section} className="mb-4">
                <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {group.section}
                </p>
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={onClose}
                    className={({ isActive }) =>
                      `mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`
                    }
                  >
                    <item.icon className="h-5 w-5" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
