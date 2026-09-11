export const ACCOUNT_TYPES = [
  'Cuenta bancaria', 'Cuenta de ahorros', 'Cuenta corriente', 'Efectivo', 'Billetera digital', 'Tarjeta de crédito', 'Otro',
];

export const PAYMENT_METHODS = ['Efectivo', 'Débito', 'Tarjeta de crédito', 'Transferencia', 'Consignación', 'Cheque', 'Otro'];

export const INCOME_TYPES = ['Salario', 'Freelance', 'Negocio', 'Venta', 'Intereses', 'Transferencia', 'Regalo', 'Otro'];

export const INCOME_METHODS = ['Consignación', 'Transferencia', 'Efectivo', 'Cheque', 'Otro'];

export const LOAN_STATUSES = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'active', label: 'Activo' },
  { value: 'partially_paid', label: 'Pagado parcialmente' },
  { value: 'paid', label: 'Pagado' },
  { value: 'overdue', label: 'Vencido' },
  { value: 'cancelled', label: 'Cancelado' },
];

export const PERIODICITY = [
  { value: 'diaria', label: 'Diaria' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'quincenal', label: 'Quincenal' },
  { value: 'mensual', label: 'Mensual' },
  { value: 'bimestral', label: 'Bimestral' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'anual', label: 'Anual' },
];

export const FREQUENCIES = [
  { value: 'daily', label: 'Diaria' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quincenal' },
  { value: 'monthly', label: 'Mensual' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'yearly', label: 'Anual' },
];

export const RELATION_TYPES = ['Amigo', 'Familiar', 'Compañero', 'Entidad', 'Otro'];
