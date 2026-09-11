import { hashPassword } from './hash.js';

const PERMISSIONS = [
  ['usuarios.ver', 'usuarios', 'Ver usuarios'],
  ['usuarios.crear', 'usuarios', 'Crear usuarios'],
  ['usuarios.editar', 'usuarios', 'Editar usuarios'],
  ['usuarios.eliminar', 'usuarios', 'Eliminar usuarios'],
  ['roles.ver', 'roles', 'Ver roles'],
  ['roles.crear', 'roles', 'Crear roles'],
  ['roles.editar', 'roles', 'Editar roles'],
  ['roles.eliminar', 'roles', 'Eliminar roles'],
  ['permisos.ver', 'permisos', 'Ver permisos'],
  ['permisos.crear', 'permisos', 'Crear permisos'],
  ['permisos.editar', 'permisos', 'Editar permisos'],
  ['permisos.eliminar', 'permisos', 'Eliminar permisos'],
  ['categorias.ver', 'categorias', 'Ver categorías'],
  ['categorias.crear', 'categorias', 'Crear categorías'],
  ['categorias.editar', 'categorias', 'Editar categorías'],
  ['categorias.eliminar', 'categorias', 'Eliminar categorías'],
  ['cuentas.ver', 'cuentas', 'Ver cuentas'],
  ['cuentas.crear', 'cuentas', 'Crear cuentas'],
  ['cuentas.editar', 'cuentas', 'Editar cuentas'],
  ['cuentas.eliminar', 'cuentas', 'Eliminar cuentas'],
  ['ingresos.ver', 'ingresos', 'Ver ingresos'],
  ['ingresos.crear', 'ingresos', 'Crear ingresos'],
  ['ingresos.editar', 'ingresos', 'Editar ingresos'],
  ['ingresos.eliminar', 'ingresos', 'Eliminar ingresos'],
  ['gastos.ver', 'gastos', 'Ver gastos'],
  ['gastos.crear', 'gastos', 'Crear gastos'],
  ['gastos.editar', 'gastos', 'Editar gastos'],
  ['gastos.eliminar', 'gastos', 'Eliminar gastos'],
  ['transferencias.ver', 'transferencias', 'Ver transferencias'],
  ['transferencias.crear', 'transferencias', 'Crear transferencias'],
  ['transferencias.editar', 'transferencias', 'Editar transferencias'],
  ['transferencias.eliminar', 'transferencias', 'Eliminar transferencias'],
  ['movimientos.ver', 'movimientos', 'Ver movimientos'],
  ['prestamos.ver', 'prestamos', 'Ver préstamos'],
  ['prestamos.crear', 'prestamos', 'Crear préstamos'],
  ['prestamos.editar', 'prestamos', 'Editar préstamos'],
  ['prestamos.eliminar', 'prestamos', 'Eliminar préstamos'],
  ['personas.ver', 'personas', 'Ver personas'],
  ['personas.crear', 'personas', 'Crear personas'],
  ['personas.editar', 'personas', 'Editar personas'],
  ['personas.eliminar', 'personas', 'Eliminar personas'],
  ['deudas.ver', 'deudas', 'Ver deudas'],
  ['deudas.crear', 'deudas', 'Crear deudas'],
  ['deudas.editar', 'deudas', 'Editar deudas'],
  ['deudas.eliminar', 'deudas', 'Eliminar deudas'],
  ['presupuestos.ver', 'presupuestos', 'Ver presupuestos'],
  ['presupuestos.crear', 'presupuestos', 'Crear presupuestos'],
  ['presupuestos.editar', 'presupuestos', 'Editar presupuestos'],
  ['presupuestos.eliminar', 'presupuestos', 'Eliminar presupuestos'],
  ['recurrentes.ver', 'recurrentes', 'Ver gastos recurrentes'],
  ['recurrentes.crear', 'recurrentes', 'Crear gastos recurrentes'],
  ['recurrentes.editar', 'recurrentes', 'Editar gastos recurrentes'],
  ['recurrentes.eliminar', 'recurrentes', 'Eliminar gastos recurrentes'],
  ['reportes.ver', 'reportes', 'Ver reportes'],
  ['dashboard.ver', 'dashboard', 'Ver dashboard'],
  ['notificaciones.ver', 'notificaciones', 'Ver notificaciones'],
  ['notificaciones.gestionar', 'notificaciones', 'Gestionar notificaciones'],
  ['auditoria.ver', 'auditoria', 'Ver auditoría'],
  ['configuracion.ver', 'configuracion', 'Ver configuración'],
  ['configuracion.editar', 'configuracion', 'Editar configuración'],
  ['datos.globales.ver', 'alcance', 'Ver datos de todos los usuarios'],
  ['datos.globales.gestionar', 'alcance', 'Gestionar datos de todos los usuarios'],
];

const ALL_PERMISSIONS = PERMISSIONS.map((p) => p[0]);
const READ_PERMISSIONS = ALL_PERMISSIONS.filter((p) => p.endsWith('.ver') || p === 'dashboard.ver' || p === 'datos.globales.ver');
const USER_PERMISSIONS = ALL_PERMISSIONS.filter(
  (p) =>
    !p.startsWith('usuarios.') &&
    !p.startsWith('roles.') &&
    !p.startsWith('permisos.') &&
    !p.startsWith('auditoria.') &&
    !p.startsWith('datos.globales.') &&
    p !== 'configuracion.editar'
);

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function monthStart(offset) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + offset, 1);
}

export function seed(db) {
  const lastId = () => {
    const r = db.exec('SELECT last_insert_rowid()');
    return r.length ? r[0].values[0][0] : null;
  };

  // Permisos
  for (const [name, module, description] of PERMISSIONS) {
    db.run('INSERT INTO permissions (name, module, description) VALUES (?, ?, ?)', [name, module, description]);
  }

  const createRole = (name, slug, description, permNames, isSystem) => {
    db.run('INSERT INTO roles (name, slug, description, is_system) VALUES (?, ?, ?, ?)', [name, slug, description, isSystem ? 1 : 0]);
    const roleId = lastId();
    for (const p of permNames) {
      db.run('INSERT INTO role_permissions (role_id, permission_id) SELECT ?, id FROM permissions WHERE name = ?', [roleId, p]);
    }
    return roleId;
  };

  const adminRole = createRole('Administrador', 'admin', 'Acceso total al sistema', ALL_PERMISSIONS, true);
  const userRole = createRole('Usuario', 'user', 'Usuario estándar con acceso a sus datos', USER_PERMISSIONS, true);
  createRole('Supervisor', 'supervisor', 'Consulta información financiera sin modificar configuraciones críticas', READ_PERMISSIONS, true);

  const createUser = (fullName, email, password, roleId) => {
    db.run('INSERT INTO users (full_name, email, password_hash, phone) VALUES (?, ?, ?, ?)', [fullName, email, hashPassword(password), '3001234567']);
    const userId = lastId();
    db.run('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, roleId]);
    return userId;
  };

  const adminId = createUser('Administrador del Sistema', 'admin@mendocash.com', 'Admin123*', adminRole);
  const juanId = createUser('Juan Pérez', 'juan@mendocash.com', 'Usuario123*', userRole);
  const mariaId = createUser('María Rodríguez', 'maria@mendocash.com', 'Usuario123*', userRole);

  // Categorías globales
  const cats = [
    ['Alimentación', 'expense', '#ef4444'],
    ['Transporte', 'expense', '#f59e0b'],
    ['Vivienda', 'expense', '#3A506B'],
    ['Entretenimiento', 'expense', '#a855f7'],
    ['Salud', 'expense', '#10b981'],
    ['Educación', 'expense', '#5BC0BE'],
    ['Servicios', 'expense', '#14b8a6'],
    ['Salario', 'income', '#22c55e'],
    ['Freelance', 'income', '#84cc16'],
    ['Negocio', 'income', '#0ea5e9'],
    ['Otros ingresos', 'income', '#94a3b8'],
  ];
  const catIds = {};
  for (const [name, type, color] of cats) {
    db.run('INSERT INTO categories (name, type, color, is_global, is_active) VALUES (?, ?, ?, 1, 1)', [name, type, color]);
    catIds[`${type}:${name}`] = lastId();
  }

  const subs = [
    ['Alimentación', ['Mercado', 'Restaurantes', 'Domicilios', 'Cafetería']],
    ['Transporte', ['Combustible', 'Taxi', 'Transporte público', 'Mantenimiento']],
    ['Vivienda', ['Arriendo', 'Servicios públicos', 'Internet', 'Mantenimiento']],
    ['Entretenimiento', ['Streaming', 'Cine', 'Juegos', 'Salidas']],
    ['Salud', ['Medicamentos', 'Consultas', 'Exámenes']],
  ];
  const subByCat = {};
  for (const [cat, names] of subs) {
    const catId = catIds[`expense:${cat}`];
    subByCat[cat] = [];
    for (const n of names) {
      db.run('INSERT INTO subcategories (category_id, name) VALUES (?, ?)', [catId, n]);
      subByCat[cat].push({ id: lastId(), name: n });
    }
  }

  const seedFinance = (userId, name, seed) => {
    const rand = mulberry32(seed);
    const accounts = [
      ['Bancolombia', 'Cuenta corriente', 'Bancolombia', '1234', 2500000],
      ['Nequi', 'Billetera digital', 'Nequi', null, 350000],
      ['Daviplata', 'Billetera digital', 'Daviplata', null, 120000],
      ['Efectivo', 'Efectivo', null, null, 200000],
      ['Tarjeta de crédito', 'Tarjeta de crédito', 'Bancolombia', '5555', 0],
      ['Ahorros', 'Cuenta de ahorros', 'Davivienda', '9876', 1800000],
    ];
    const accountIds = {};
    for (const [accName, type, bank, number, balance] of accounts) {
      db.run('INSERT INTO accounts (user_id, name, type, bank, number, initial_balance, current_balance, currency, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [userId, accName, type, bank, number, balance, balance, 'COP', 'active']);
      accountIds[accName] = lastId();
    }

    const salaryAmount = 4500000 + rand() * 2000000;
    for (let m = -5; m <= 0; m++) {
      const base = monthStart(m);
      const day = 1 + Math.floor(rand() * 3);
      const date = new Date(base.getFullYear(), base.getMonth(), Math.min(day, 28));
      db.run('INSERT INTO income (user_id, account_id, category_id, date, description, amount, income_method, income_type, is_recurring) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)', [userId, accountIds['Bancolombia'], catIds['income:Salario'], isoDate(date), `Salario ${name}`, Math.round(salaryAmount + (rand() - 0.5) * 500000), 'Transferencia', 'Salario']);
      if (rand() > 0.5) {
        const d2 = new Date(base.getFullYear(), base.getMonth(), 10 + Math.floor(rand() * 15));
        db.run('INSERT INTO income (user_id, account_id, category_id, date, description, amount, income_method, income_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [userId, accountIds['Nequi'], catIds['income:Freelance'], isoDate(d2), 'Proyecto freelance', Math.round(300000 + rand() * 900000), 'Consignación', 'Freelance']);
      }
    }

    const templates = [
      ['Alimentación', 'Mercado', 'Éxito', 380000, 'Débito'],
      ['Alimentación', 'Restaurantes', 'Restaurante', 180000, 'Tarjeta de crédito'],
      ['Transporte', 'Combustible', 'Estación Terpel', 160000, 'Débito'],
      ['Transporte', 'Transporte público', 'Metro', 60000, 'Efectivo'],
      ['Vivienda', 'Arriendo', 'Inmobiliaria', 900000, 'Transferencia'],
      ['Vivienda', 'Servicios públicos', 'EPM', 220000, 'Débito'],
      ['Vivienda', 'Internet', 'Claro', 90000, 'Débito'],
      ['Entretenimiento', 'Streaming', 'Netflix', 45000, 'Tarjeta de crédito'],
      ['Entretenimiento', 'Salidas', 'Cine', 80000, 'Tarjeta de crédito'],
      ['Salud', 'Medicamentos', 'Farmacia', 70000, 'Efectivo'],
      ['Servicios', 'Gimnasio', 'Bodytech', 90000, 'Débito'],
      ['Educación', 'Cursos', 'Platzi', 60000, 'Tarjeta de crédito'],
    ];
    for (let m = -5; m <= 0; m++) {
      const base = monthStart(m);
      for (const [cat, sub, merchant, baseAmt, method] of templates) {
        const day = 1 + Math.floor(rand() * 26);
        const date = new Date(base.getFullYear(), base.getMonth(), Math.min(day, 28));
        const amount = Math.round(baseAmt * (0.85 + rand() * 0.4));
        const accountName = method === 'Efectivo' ? 'Efectivo' : method === 'Tarjeta de crédito' ? 'Tarjeta de crédito' : 'Bancolombia';
        const subId = (subByCat[cat] || []).find((s) => s.name === sub)?.id || null;
        db.run('INSERT INTO expenses (user_id, account_id, category_id, subcategory_id, date, description, amount, payment_method, merchant, is_recurring) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [userId, accountIds[accountName], catIds[`expense:${cat}`], subId, isoDate(date), `${sub} (${name})`, amount, method, merchant, sub === 'Arriendo' || sub === 'Streaming' || sub === 'Internet' ? 1 : 0]);
      }
    }

    const budgets = { Alimentación: 800000, Transporte: 300000, Entretenimiento: 200000, Vivienda: 1200000 };
    for (const [cat, amount] of Object.entries(budgets)) {
      db.run('INSERT INTO budgets (user_id, category_id, period, amount) VALUES (?, ?, ?, ?)', [userId, catIds[`expense:${cat}`], isoDate(monthStart(0)), amount]);
    }

    const people = [
      ['Carlos Ramírez', '3011112233', 'carlos@mail.com', 'Amigo'],
      ['Laura Gómez', '3023334455', 'laura@mail.com', 'Familiar'],
      ['Banco Davivienda', null, null, 'Entidad'],
    ];
    const personIds = {};
    for (const [pname, phone, email, relation] of people) {
      db.run('INSERT INTO people (user_id, full_name, phone, email, relation_type, status) VALUES (?, ?, ?, ?, ?, ?)', [userId, pname, phone, email, relation, 'active']);
      personIds[pname] = lastId();
    }

    db.run('INSERT INTO loans (user_id, person_id, type, amount, interest_rate, date, due_date, num_installments, periodicity, installment_amount, description, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [userId, personIds['Carlos Ramírez'], 'lent', 2000000, 0, isoDate(monthStart(-4)), isoDate(monthStart(6)), 10, 'mensual', 200000, 'Préstamo a Carlos', 'active']);
    const loan1Id = lastId();
    for (let i = 1; i <= 4; i++) {
      const base = monthStart(-4 + i);
      const date = new Date(base.getFullYear(), base.getMonth(), 5);
      db.run('INSERT INTO loan_payments (loan_id, account_id, date, amount, installment_number, principal, interest) VALUES (?, ?, ?, ?, ?, ?, ?)', [loan1Id, accountIds['Bancolombia'], isoDate(date), 200000, i, 200000, 0]);
    }

    db.run('INSERT INTO loans (user_id, person_id, type, amount, interest_rate, date, due_date, num_installments, periodicity, installment_amount, description, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [userId, personIds['Banco Davivienda'], 'borrowed', 5000000, 18, isoDate(monthStart(-2)), isoDate(monthStart(10)), 12, 'mensual', 460000, 'Crédito de libre inversión', 'active']);
    const loan2Id = lastId();
    for (let i = 1; i <= 2; i++) {
      const base = monthStart(-2 + i);
      const date = new Date(base.getFullYear(), base.getMonth(), 15);
      db.run('INSERT INTO loan_payments (loan_id, account_id, date, amount, installment_number, principal, interest) VALUES (?, ?, ?, ?, ?, ?, ?)', [loan2Id, accountIds['Bancolombia'], isoDate(date), 460000, i, 380000, 80000]);
    }

    db.run('INSERT INTO debts (user_id, creditor, concept, amount, start_date, due_date, interest_rate, num_installments, installment_amount, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [userId, 'Bancolombia', 'Tarjeta de crédito', 1500000, isoDate(monthStart(-1)), isoDate(monthStart(2)), 30, 3, 520000, 'active']);
    const debtId = lastId();
    const debtPayDate = new Date(monthStart(0).getFullYear(), monthStart(0).getMonth(), 3);
    db.run('INSERT INTO debt_payments (debt_id, account_id, date, amount) VALUES (?, ?, ?, ?)', [debtId, accountIds['Bancolombia'], isoDate(debtPayDate), 520000]);

    const recurring = [
      ['Netflix', 45000, 'Entretenimiento', 'Tarjeta de crédito'],
      ['Spotify', 23000, 'Entretenimiento', 'Tarjeta de crédito'],
      ['Internet Claro', 90000, 'Vivienda', 'Bancolombia'],
      ['Gimnasio', 90000, 'Servicios', 'Bancolombia'],
      ['Seguro de vida', 120000, 'Salud', 'Bancolombia'],
    ];
    for (const [rname, amount, cat, accName] of recurring) {
      db.run('INSERT INTO recurring_expenses (user_id, name, amount, category_id, account_id, frequency, next_due_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [userId, rname, amount, catIds[`expense:${cat}`], accountIds[accName], 'monthly', isoDate(monthStart(0)), 'active']);
    }
  };

  seedFinance(juanId, 'Juan', 1234);
  seedFinance(mariaId, 'María', 5678);

  const defaults = [
    ['moneda', 'COP', 'Moneda principal'],
    ['formato_fecha', 'YYYY-MM-DD', 'Formato de fecha'],
    ['zona_horaria', 'America/Bogota', 'Zona horaria'],
  ];
  for (const [key, value, description] of defaults) {
    db.run('INSERT INTO settings (key, value, description) VALUES (?, ?, ?)', [key, value, description]);
  }

  const types = ['cuota_por_vencer', 'deuda_vencida', 'presupuesto_excedido', 'gasto_recurrente', 'saldo_bajo', 'pago_pendiente'];
  for (const uid of [adminId, juanId, mariaId]) {
    for (const t of types) {
      db.run('INSERT INTO notification_preferences (user_id, type, enabled) VALUES (?, ?, 1)', [uid, t]);
    }
  }
}
