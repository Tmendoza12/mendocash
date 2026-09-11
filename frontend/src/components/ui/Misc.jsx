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
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ title, value, icon: Icon, color = 'bg-brand-50 text-brand-600 dark:bg-brand-900/30', hint }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
      <p className="mt-1 text-xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
