import { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, XCircle, Info, AlertTriangle } from 'lucide-react';

const ToastContext = createContext(null);

const STYLES = {
  success: { icon: CheckCircle2, cls: 'border-green-500 text-green-700 dark:text-green-300' },
  error: { icon: XCircle, cls: 'border-red-500 text-red-700 dark:text-red-300' },
  info: { icon: Info, cls: 'border-blue-500 text-blue-700 dark:text-blue-300' },
  warning: { icon: AlertTriangle, cls: 'border-amber-500 text-amber-700 dark:text-amber-300' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const toast = {
    success: (m) => push(m, 'success'),
    error: (m) => push(m, 'error'),
    info: (m) => push(m, 'info'),
    warning: (m) => push(m, 'warning'),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map((t) => {
          const s = STYLES[t.type] || STYLES.info;
          const Icon = s.icon;
          return (
            <div
              key={t.id}
              className={`flex items-center gap-2 rounded-lg border-l-4 bg-white px-4 py-3 shadow-lg dark:bg-slate-800 ${s.cls}`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="text-sm">{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
