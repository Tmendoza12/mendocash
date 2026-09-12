import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Wallet, ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, ListOrdered,
  Tags, Target, RefreshCcw, HandCoins, Users as UsersIcon, CreditCard, BarChart3,
  CalendarDays, ShieldCheck, UserCog, Settings, PiggyBank, ChevronDown,
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
  const [collapsed, setCollapsed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('mendocash_collapsed') || '{}'); } catch { return {}; }
  });

  const toggle = (section) => {
    setCollapsed((c) => {
      const next = { ...c, [section]: !c[section] };
      localStorage.setItem('mendocash_collapsed', JSON.stringify(next));
      return next;
    });
  };

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={onClose} />}
      <aside
        style={{
          background:
            'radial-gradient(360px 240px at 95% 85%, rgba(22,174,154,.18), transparent 60%), radial-gradient(260px 190px at 20% 100%, rgba(11,125,116,.16), transparent 65%), linear-gradient(180deg, #033739 0%, #033c3e 62%, #03484a 100%)',
        }}
        className={`fixed inset-y-0 left-0 z-40 flex w-[286px] transform flex-col transition-transform lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex min-h-[78px] items-center gap-3.5 border-b border-white/[0.08] px-[29px]" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <img src="/icons/logo.png" alt="MendoCash" className="h-11 w-11 object-contain" />
          <span className="font-serif text-[31px] font-bold leading-none tracking-[-1.2px] text-white">
            Mendo<span className="text-[#20bea8]">Cash</span>
          </span>
        </div>
        <nav className="flex-1 overflow-y-auto px-[15px] py-[25px]">
          {NAV.map((group) => {
            const items = group.items.filter((i) => hasPermission(i.permission));
            if (!items.length) return null;
            const isCollapsed = collapsed[group.section];
            return (
              <div key={group.section} className="mb-[21px]">
                <button
                  type="button"
                  onClick={() => toggle(group.section)}
                  aria-expanded={!isCollapsed}
                  className="mx-[15px] mb-[9px] flex w-[calc(100%-30px)] items-center justify-between text-[11px] font-bold uppercase tracking-[0.072em] text-[#36b9aa] transition-colors hover:text-white"
                >
                  <span>{group.section}</span>
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                </button>
                {!isCollapsed && items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={onClose}
                    style={({ isActive }) =>
                      isActive
                        ? { backgroundImage: 'linear-gradient(90deg, #079d8b, #12aa97)', boxShadow: '0 8px 20px rgba(0,0,0,.13)' }
                        : undefined
                    }
                    className={({ isActive }) =>
                      `my-[2px] flex min-h-[43px] items-center gap-3.5 rounded-[10px] px-[15px] text-sm font-medium transition-all duration-200 ${
                        isActive
                          ? 'text-white'
                          : 'text-white/[0.94] hover:translate-x-[2px] hover:bg-white/[0.065] hover:text-white'
                      }`
                    }
                  >
                    <item.icon className="h-[23px] w-[23px] shrink-0" />
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
