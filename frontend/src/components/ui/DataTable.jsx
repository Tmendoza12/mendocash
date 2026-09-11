import { ChevronLeft, ChevronRight } from 'lucide-react';

export function Pagination({ page, limit, total, onChange }) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 dark:border-slate-800">
      <span className="text-sm text-slate-500 dark:text-slate-400">
        {total} resultado{total !== 1 ? 's' : ''}
      </span>
      <div className="flex items-center gap-1">
        <button className="btn-ghost px-2 py-1" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="px-2 text-sm text-slate-600 dark:text-slate-300">
          {page} / {totalPages}
        </span>
        <button className="btn-ghost px-2 py-1" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function DataTable({ columns, data, emptyMessage = 'No hay registros.' }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full divide-y divide-slate-200 dark:divide-slate-800">
        <thead className="bg-slate-50 dark:bg-slate-800/60">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={`table-head ${c.className || ''}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-slate-400">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, i) => (
              <tr key={row.id ?? i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                {columns.map((c) => (
                  <td key={c.key} className={`table-cell ${c.className || ''}`}>
                    {c.render ? c.render(row) : row[c.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
