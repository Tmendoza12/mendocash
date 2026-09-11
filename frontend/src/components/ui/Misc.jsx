import { Loader2, Inbox } from 'lucide-react';

export function Badge({ children, color = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>
      {children}
    </span>
  );
}

export function Spinner({ className = 'h-6 w-6' }) {
  return <Loader2 className={`animate-spin text-brand-500 ${className}`} />;
}

export function Loading({ label = 'Cargando...' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-400">
      <Spinner className="h-8 w-8" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({ message = 'No hay registros.' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
      <Inbox className="h-10 w-10" />
      <span className="text-sm">{message}</span>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="font-serif text-[30px] font-bold leading-tight tracking-tight text-ink dark:text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-ink-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ title, value, icon: Icon, color = 'bg-[#e1f7f3] text-[#0d9e8b]', bar = '#12a994', hint }) {
  return (
    <div className="card relative min-h-[158px] overflow-hidden px-[29px] py-[17px] transition-all duration-200 hover:-translate-y-[3px] hover:shadow-soft-hover">
      <span className="absolute bottom-[14px] left-0 top-[14px] w-1 rounded-r-md" style={{ backgroundColor: bar }} />
      <div className={`flex h-[45px] w-[45px] items-center justify-center rounded-[14px] ${color}`}>
        <Icon className="h-6 w-6" />
      </div>
      <p className="mt-[13px] text-[13px] font-medium text-[#3e6976]">{title}</p>
      <p className="mt-[7px] text-[26px] font-extrabold leading-none tracking-[-0.4px] text-[#073e49] dark:text-white">{value}</p>
      {hint && <p className="mt-2 text-[10px] text-ink-soft">{hint}</p>}
    </div>
  );
}
