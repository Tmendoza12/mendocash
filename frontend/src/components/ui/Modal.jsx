import { useEffect } from 'react';
import { X, AlertTriangle } from 'lucide-react';

export function Modal({ open, onClose, title, children, size = 'md' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm">
      <div className={`mt-8 w-full ${sizes[size]} rounded-xl bg-white shadow-xl dark:bg-slate-900`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title = '¿Estás seguro?', message, loading = false }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-red-100 p-2 text-red-600 dark:bg-red-900/40">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">{message || 'Esta acción no se puede deshacer.'}</p>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn-danger" onClick={onConfirm} disabled={loading}>
          {loading ? 'Procesando...' : 'Eliminar'}
        </button>
      </div>
    </Modal>
  );
}
