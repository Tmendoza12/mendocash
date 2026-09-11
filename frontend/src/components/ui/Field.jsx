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
  return (
    <Field label={label} required={required} error={error}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
        <input
          type="number"
          step="0.01"
          min="0"
          className="input pl-7"
          value={value}
          onChange={onChange}
          {...props}
        />
      </div>
    </Field>
  );
}
