export const catalogs = {
  account_types: [
    'Cuenta bancaria', 'Cuenta de ahorros', 'Cuenta corriente', 'Efectivo', 'Billetera digital', 'Tarjeta de crédito', 'Otro',
  ],
  payment_methods: ['Efectivo', 'Débito', 'Tarjeta de crédito', 'Transferencia', 'Consignación', 'Cheque', 'Otro'],
  income_types: ['Salario', 'Freelance', 'Negocio', 'Venta', 'Intereses', 'Transferencia', 'Regalo', 'Otro'],
  income_methods: ['Consignación', 'Transferencia', 'Efectivo', 'Cheque', 'Otro'],
  loan_types: ['lent', 'borrowed'],
  loan_statuses: ['pending', 'active', 'partially_paid', 'paid', 'overdue', 'cancelled'],
  debt_statuses: ['pending', 'active', 'partially_paid', 'paid', 'overdue', 'cancelled'],
  periodicity: ['diaria', 'semanal', 'quincenal', 'mensual', 'bimestral', 'trimestral', 'anual'],
  recurring_frequencies: ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'],
  currencies: ['COP', 'USD', 'EUR', 'MXN', 'ARS', 'CLP', 'PEN'],
  relation_types: ['Amigo', 'Familiar', 'Compañero', 'Entidad', 'Otro'],
};

export const statusLabels = {
  loan: {
    pending: 'Pendiente',
    active: 'Activo',
    partially_paid: 'Pagado parcialmente',
    paid: 'Pagado',
    overdue: 'Vencido',
    cancelled: 'Cancelado',
  },
  debt: {
    pending: 'Pendiente',
    active: 'Activo',
    partially_paid: 'Pagado parcialmente',
    paid: 'Pagado',
    overdue: 'Vencido',
    cancelled: 'Cancelado',
  },
};
