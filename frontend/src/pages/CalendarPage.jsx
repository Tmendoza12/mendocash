import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../api/client.js';
import { formatMoney } from '../utils/format.js';
import { PageHeader, Loading } from '../components/ui/Misc.jsx';

const TYPE_META = {
  income: { label: 'Ingreso', color: 'bg-green-500' },
  expense: { label: 'Gasto', color: 'bg-red-500' },
  transfer: { label: 'Transferencia', color: 'bg-brand-500' },
  loan: { label: 'Préstamo', color: 'bg-emerald-500' },
  loan_due: { label: 'Vence préstamo', color: 'bg-emerald-700' },
  loan_payment: { label: 'Pago préstamo', color: 'bg-teal-500' },
  debt: { label: 'Deuda', color: 'bg-orange-500' },
  debt_due: { label: 'Vence deuda', color: 'bg-orange-700' },
  debt_payment: { label: 'Pago deuda', color: 'bg-amber-500' },
  recurring: { label: 'Recurrente', color: 'bg-purple-500' },
};

export default function CalendarPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  useEffect(() => {
    setLoading(true);
    api.get('/dashboard/calendar').then((r) => setEvents(r.data.data)).finally(() => setLoading(false));
  }, []);

  const { days, startPad } = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
    return { days: daysInMonth, startPad };
  }, [cursor]);

  const eventsByDate = useMemo(() => {
    const map = {};
    for (const e of events) {
      if (!e.date) continue;
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    }
    return map;
  }, [events]);

  const goPrev = () => setCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }));
  const goNext = () => setCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }));

  const monthName = new Date(cursor.year, cursor.month, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  const weekDays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader title="Calendario financiero" subtitle="Pagos, vencimientos e ingresos programados" />
      <div className="card p-4">
        <div className="mb-4 flex items-center justify-between">
          <button className="btn-ghost" onClick={goPrev}><ChevronLeft className="h-5 w-5" /></button>
          <h2 className="text-lg font-semibold capitalize">{monthName}</h2>
          <button className="btn-ghost" onClick={goNext}><ChevronRight className="h-5 w-5" /></button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {weekDays.map((d) => <div key={d} className="py-2 text-center text-xs font-semibold text-slate-400">{d}</div>)}
          {Array.from({ length: startPad }).map((_, i) => <div key={`pad-${i}`} />)}
          {Array.from({ length: days }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayEvents = eventsByDate[dateStr] || [];
            const isToday = dateStr === new Date().toISOString().slice(0, 10);
            return (
              <div key={day} className={`min-h-[90px] rounded-lg border p-1 ${isToday ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'border-slate-100 dark:border-slate-800'}`}>
                <p className={`text-right text-xs font-semibold ${isToday ? 'text-brand-600' : 'text-slate-500'}`}>{day}</p>
                <div className="mt-1 space-y-0.5">
                  {dayEvents.slice(0, 3).map((e) => (
                    <div key={e.id} className="flex items-center gap-1 truncate rounded bg-slate-50 px-1 py-0.5 dark:bg-slate-800" title={`${(TYPE_META[e.type] || {}).label || e.type}: ${e.title} ${formatMoney(e.amount)}`}>
                      <span className={`h-2 w-2 shrink-0 rounded-full ${(TYPE_META[e.type] || {}).color || 'bg-slate-400'}`} />
                      <span className="truncate text-[10px] text-slate-600 dark:text-slate-300">{e.title}</span>
                    </div>
                  ))}
                  {dayEvents.length > 3 && <p className="text-[10px] text-slate-400">+{dayEvents.length - 3} más</p>}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
          {Object.entries(TYPE_META).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className={`h-2.5 w-2.5 rounded-full ${v.color}`} />
              {v.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
