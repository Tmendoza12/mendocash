export function Field({ label, required, error, children, className = '' }) {
  return (
    <div className={className}>
      <label className="label">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

export function TextInput({ label, required, error, ...props }) {
  return (
    <Field label={label} required={required} error={error}>
      <input className="input" {...props} />
    </Field>
  );
}

export function SelectInput({ label, required, error, children, ...props }) {
  return (
    <Field label={label} required={required} error={error}>
      <select className="input" {...props}>
        {children}
      </select>
    </Field>
  );
}

export function Textarea({ label, required, error, ...props }) {
  return (
    <Field label={label} required={required} error={error}>
      <textarea className="input min-h-[80px]" {...props} />
    </Field>
  );
}

export function MoneyInput({ label, required, error, value, onChange, ...props }) {
  const format = (v) => {
    if (v === '' || v == null) return '';
    const num = Number(v);
    if (isNaN(num)) return String(v);
    return num.toLocaleString('es-CO', { maximumFractionDigits: 2 });
  };

  const handleChange = (e) => {
    const raw = e.target.value.replace(/[^0-9.,]/g, '').replace(/\./g, '').replace(',', '.');
    onChange({ target: { value: raw } });
  };

  return (
    <Field label={label} required={required} error={error}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
        <input
          type="text"
          inputMode="decimal"
          className="input pl-7"
          value={format(value)}
          onChange={handleChange}
          {...props}
        />
      </div>
    </Field>
  );
}
