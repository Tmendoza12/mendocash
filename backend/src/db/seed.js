import pg from 'pg';
import { pathToFileURL } from 'node:url';
import { getConnectionConfig } from '../config/db.js';
import { hashPassword } from '../utils/password.js';

pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));

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

let client;

// Generador pseudoaleatorio determinístico para datos de prueba.
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
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return d;
}

async function insertPermissionIds() {
  for (const [name, module, description] of PERMISSIONS) {
    await client.query(
      `INSERT INTO permissions (name, module, description)
       VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING`,
      [name, module, description]
    );
  }
}

async function createRole(name, slug, description, permNames, isSystem = false) {
  const { rows } = await client.query(
    `INSERT INTO roles (name, slug, description, is_system)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (slug) DO UPDATE SET description = EXCLUDED.description
     RETURNING id`,
    [name, slug, description, isSystem]
  );
  const roleId = rows[0].id;
  await client.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);
  for (const p of permNames) {
    await client.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT $1, id FROM permissions WHERE name = $2`,
      [roleId, p]
    );
  }
  return roleId;
}

async function createUser(fullName, email, password, roleId) {
  const passwordHash = await hashPassword(password);
  const { rows } = await client.query(
    `INSERT INTO users (full_name, email, password_hash, phone)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [fullName, email, passwordHash, '3001234567']
  );
  const userId = rows[0].id;
  await client.query(
    'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)',
    [userId, roleId]
  );
  return userId;
}

async function seedGlobalCategories() {
  const cats = [
    ['Alimentación', 'expense', '#ef4444', 'utensils'],
    ['Transporte', 'expense', '#f59e0b', 'car'],
    ['Vivienda', 'expense', '#3b82f6', 'home'],
    ['Entretenimiento', 'expense', '#a855f7', 'film'],
    ['Salud', 'expense', '#10b981', 'heart'],
    ['Educación', 'expense', '#6366f1', 'book'],
    ['Servicios', 'expense', '#14b8a6', 'bolt'],
    ['Salario', 'income', '#22c55e', 'briefcase'],
    ['Freelance', 'income', '#84cc16', 'laptop'],
    ['Negocio', 'income', '#0ea5e9', 'store'],
    ['Otros ingresos', 'income', '#94a3b8', 'coins'],
  ];
  const ids = {};
  for (const [name, type, color, icon] of cats) {
    const { rows } = await client.query(
      `INSERT INTO categories (name, type, color, icon, is_global, is_active)
       VALUES ($1, $2, $3, $4, TRUE, TRUE)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [name, type, color, icon]
    );
    if (rows.length) ids[name] = rows[0].id;
  }
  // Recuperar ids en caso de que ya existieran.
  if (Object.keys(ids).length < cats.length) {
    const { rows } = await client.query('SELECT id, name FROM categories WHERE is_global = TRUE');
    for (const r of rows) ids[r.name] = r.id;
  }
  return ids;
}

async function seedSubcategories(globalCatIds) {
  const subs = [
    ['Alimentación', ['Mercado', 'Restaurantes', 'Domicilios', 'Cafetería']],
    ['Transporte', ['Combustible', 'Taxi', 'Transporte público', 'Mantenimiento']],
    ['Vivienda', ['Arriendo', 'Servicios públicos', 'Internet', 'Mantenimiento']],
    ['Entretenimiento', ['Streaming', 'Cine', 'Juegos', 'Salidas']],
    ['Salud', ['Medicamentos', 'Consultas', 'Exámenes']],
  ];
  for (const [cat, names] of subs) {
    const catId = globalCatIds[cat];
    if (!catId) continue;
    for (const n of names) {
      await client.query(
        `INSERT INTO subcategories (category_id, name)
         SELECT $1::int, $2::text WHERE NOT EXISTS (SELECT 1 FROM subcategories WHERE category_id = $1::int AND name = $2::text)`,
        [catId, n]
      );
    }
  }
}

async function seedDemoFinance(userId, name, seed) {
  const rand = mulberry32(seed);

  // Cuentas
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
    const { rows } = await client.query(
      `INSERT INTO accounts (user_id, name, type, bank, number, initial_balance, current_balance, currency, status)
       VALUES ($1, $2, $3, $4, $5, $6, $6, 'COP', 'active') RETURNING id`,
      [userId, accName, type, bank, number, balance]
    );
    accountIds[accName] = rows[0].id;
  }

  // Categorías (globales + una personal)
  const { rows: catRows } = await client.query(
    'SELECT id, name, type FROM categories WHERE is_global = TRUE OR user_id = $1',
    [userId]
  );
  const catByName = {};
  for (const r of catRows) catByName[`${r.type}:${r.name}`] = r.id;

  const expenseCats = [
    'Alimentación', 'Transporte', 'Vivienda', 'Entretenimiento', 'Salud', 'Educación', 'Servicios',
  ];
  const subcatByCat = {};
  const { rows: subRows } = await client.query(
    `SELECT s.id, s.name, c.name AS cat
       FROM subcategories s JOIN categories c ON c.id = s.category_id WHERE c.is_global = TRUE`
  );
  for (const r of subRows) {
    if (!subcatByCat[r.cat]) subcatByCat[r.cat] = [];
    subcatByCat[r.cat].push({ id: r.id, name: r.name });
  }

  // Ingresos mensuales (salario) de los últimos 6 meses
  const salaryAmount = 4500000 + rand() * 2000000;
  for (let m = -5; m <= 0; m++) {
    const base = monthStart(m);
    const day = 1 + Math.floor(rand() * 3);
    const date = new Date(base.getFullYear(), base.getMonth(), Math.min(day, 28));
    await client.query(
      `INSERT INTO income (user_id, account_id, category_id, date, description, amount, income_method, income_type, is_recurring)
       VALUES ($1, $2, $3, $4, $5, $6, 'Transferencia', 'Salario', TRUE)`,
      [
        userId,
        accountIds['Bancolombia'],
        catByName['income:Salario'],
        isoDate(date),
        `Salario ${name}`,
        Math.round(salaryAmount + (rand() - 0.5) * 500000),
      ]
    );
    // Ingreso freelance ocasional
    if (rand() > 0.5) {
      const d2 = new Date(base.getFullYear(), base.getMonth(), 10 + Math.floor(rand() * 15));
      await client.query(
        `INSERT INTO income (user_id, account_id, category_id, date, description, amount, income_method, income_type)
         VALUES ($1, $2, $3, $4, $5, $6, 'Consignación', 'Freelance')`,
        [userId, accountIds['Nequi'], catByName['income:Freelance'], isoDate(d2), 'Proyecto freelance', Math.round(300000 + rand() * 900000)]
      );
    }
  }

  // Gastos de los últimos 6 meses
  const monthlyExpenseTemplates = [
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
    for (const [cat, sub, merchant, baseAmt, method] of monthlyExpenseTemplates) {
      const day = 1 + Math.floor(rand() * 26);
      const date = new Date(base.getFullYear(), base.getMonth(), Math.min(day, 28));
      const amount = Math.round(baseAmt * (0.85 + rand() * 0.4));
      const accountName = method === 'Efectivo' ? 'Efectivo' : method === 'Tarjeta de crédito' ? 'Tarjeta de crédito' : 'Bancolombia';
      const subId = (subcatByCat[cat] || []).find((s) => s.name === sub)?.id || null;
      await client.query(
        `INSERT INTO expenses (user_id, account_id, category_id, subcategory_id, date, description, amount, payment_method, merchant, is_recurring)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          userId,
          accountIds[accountName],
          catByName[`expense:${cat}`],
          subId,
          isoDate(date),
          `${sub} (${name})`,
          amount,
          method,
          merchant,
          sub === 'Arriendo' || sub === 'Streaming' || sub === 'Internet',
        ]
      );
    }
  }

  // Presupuestos del mes actual
  const budgetMap = { Alimentación: 800000, Transporte: 300000, Entretenimiento: 200000, Vivienda: 1200000 };
  for (const [cat, amount] of Object.entries(budgetMap)) {
    const catId = catByName[`expense:${cat}`];
    if (!catId) continue;
    await client.query(
      `INSERT INTO budgets (user_id, category_id, period, amount)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, category_id, period) DO NOTHING`,
      [userId, catId, isoDate(monthStart(0)), amount]
    );
  }

  // Personas
  const people = [
    ['Carlos Ramírez', '3011112233', '1023456789', 'Amigo', 'active'],
    ['Laura Gómez', '3023334455', '1098765432', 'Familiar', 'active'],
    ['Banco Davivienda', null, '900123456', 'Entidad', 'active'],
  ];
  const personIds = {};
  for (const [pname, phone, cedula, relation, status] of people) {
    const { rows } = await client.query(
      `INSERT INTO people (user_id, full_name, phone, cedula, relation_type, status)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [userId, pname, phone, cedula, relation, status]
    );
    personIds[pname] = rows[0].id;
  }

  // Préstamos (dinero prestado)
  const loan1 = await client.query(
    `INSERT INTO loans (user_id, person_id, type, amount, interest_rate, date, due_date, num_installments, periodicity, installment_amount, description, status)
     VALUES ($1, $2, 'lent', 2000000, 0, $3, $4, 10, 'mensual', 200000, 'Préstamo a Carlos', 'active') RETURNING id`,
    [userId, personIds['Carlos Ramírez'], isoDate(monthStart(-4)), isoDate(monthStart(6))]
  );
  const loan1Id = loan1.rows[0].id;
  // 4 pagos de Carlos
  for (let i = 1; i <= 4; i++) {
    const date = new Date(monthStart(-4 + i).getFullYear(), monthStart(-4 + i).getMonth(), 5);
    await client.query(
      `INSERT INTO loan_payments (loan_id, account_id, date, amount, installment_number, principal, interest)
       VALUES ($1, $2, $3, 200000, $4, 200000, 0)`,
      [loan1Id, accountIds['Bancolombia'], isoDate(date), i]
    );
  }

  // Préstamo recibido (banco)
  const loan2 = await client.query(
    `INSERT INTO loans (user_id, person_id, type, amount, interest_rate, date, due_date, num_installments, periodicity, installment_amount, description, status)
     VALUES ($1, $2, 'borrowed', 5000000, 18, $3, $4, 12, 'mensual', 460000, 'Crédito de libre inversión', 'active') RETURNING id`,
    [userId, personIds['Banco Davivienda'], isoDate(monthStart(-2)), isoDate(monthStart(10))]
  );
  const loan2Id = loan2.rows[0].id;
  for (let i = 1; i <= 2; i++) {
    const date = new Date(monthStart(-2 + i).getFullYear(), monthStart(-2 + i).getMonth(), 15);
    await client.query(
      `INSERT INTO loan_payments (loan_id, account_id, date, amount, installment_number, principal, interest)
       VALUES ($1, $2, $3, 460000, $4, 380000, 80000)`,
      [loan2Id, accountIds['Bancolombia'], isoDate(date), i]
    );
  }

  // Deudas (tarjeta de crédito)
  const debt = await client.query(
    `INSERT INTO debts (user_id, creditor, concept, amount, start_date, due_date, interest_rate, num_installments, installment_amount, status)
     VALUES ($1, 'Bancolombia', 'Tarjeta de crédito', 1500000, $2, $3, 30, 3, 520000, 'active') RETURNING id`,
    [userId, isoDate(monthStart(-1)), isoDate(monthStart(2))]
  );
  const debtId = debt.rows[0].id;
  await client.query(
    `INSERT INTO debt_payments (debt_id, account_id, date, amount)
     VALUES ($1, $2, $3, 520000)`,
    [debtId, accountIds['Bancolombia'], isoDate(new Date(monthStart(0).getFullYear(), monthStart(0).getMonth(), 3))]
  );

  // Gastos recurrentes
  const recurring = [
    ['Netflix', 45000, 'Entretenimiento', 'Tarjeta de crédito', 'monthly'],
    ['Spotify', 23000, 'Entretenimiento', 'Tarjeta de crédito', 'monthly'],
    ['Internet Claro', 90000, 'Vivienda', 'Bancolombia', 'monthly'],
    ['Gimnasio', 90000, 'Servicios', 'Bancolombia', 'monthly'],
    ['Seguro de vida', 120000, 'Salud', 'Bancolombia', 'monthly'],
  ];
  for (const [rname, amount, cat, accName, freq] of recurring) {
    await client.query(
      `INSERT INTO recurring_expenses (user_id, name, amount, category_id, account_id, frequency, next_due_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')`,
      [userId, rname, amount, catByName[`expense:${cat}`], accountIds[accName], freq, isoDate(monthStart(0))]
    );
  }

  return { accountIds, catByName };
}

export async function seedDatabase() {
  client = new pg.Client(getConnectionConfig());
  await client.connect();

  const { rows: existing } = await client.query(
    "SELECT 1 FROM users WHERE email = 'admin@mendocash.com' LIMIT 1"
  );
  if (existing.length) {
    console.log('Los datos de prueba ya existen. No se vuelve a sembrar.');
    await client.end();
    return;
  }

  await client.query('BEGIN');
  try {
    await insertPermissionIds();

    const adminRole = await createRole('Administrador', 'admin', 'Acceso total al sistema', ALL_PERMISSIONS, true);
    await createRole('Usuario', 'user', 'Usuario estándar con acceso a sus datos', USER_PERMISSIONS, true);
    await createRole('Supervisor', 'supervisor', 'Consulta información financiera sin modificar configuraciones críticas', READ_PERMISSIONS, true);

    const adminId = await createUser('Administrador del Sistema', 'admin@mendocash.com', 'Admin123*', adminRole);
    const { rows: userRole } = await client.query("SELECT id FROM roles WHERE slug = 'user'");
    const juanId = await createUser('Juan Pérez', 'juan@mendocash.com', 'Usuario123*', userRole[0].id);
    const mariaId = await createUser('María Rodríguez', 'maria@mendocash.com', 'Usuario123*', userRole[0].id);

    const globalCats = await seedGlobalCategories();
    await seedSubcategories(globalCats);

    await seedDemoFinance(juanId, 'Juan', 1234);
    await seedDemoFinance(mariaId, 'María', 5678);

    // Configuración global por defecto
    const defaults = [
      ['moneda', 'COP', 'Moneda principal'],
      ['formato_fecha', 'YYYY-MM-DD', 'Formato de fecha'],
      ['zona_horaria', 'America/Bogota', 'Zona horaria'],
    ];
    for (const [key, value, description] of defaults) {
      await client.query(
        `INSERT INTO settings (key, value, description)
         VALUES ($1, $2, $3) ON CONFLICT (key, user_id) DO NOTHING`,
        [key, value, description]
      );
    }

    // Preferencias de notificación por defecto
    const types = ['cuota_por_vencer', 'deuda_vencida', 'presupuesto_excedido', 'gasto_recurrente', 'saldo_bajo', 'pago_pendiente'];
    for (const uid of [adminId, juanId, mariaId]) {
      for (const t of types) {
        await client.query(
          `INSERT INTO notification_preferences (user_id, type, enabled) VALUES ($1, $2, TRUE)
           ON CONFLICT (user_id, type) DO NOTHING`,
          [uid, t]
        );
      }
    }

    await client.query('COMMIT');
    console.log('Datos de prueba creados correctamente.');
    console.log('  Admin:  admin@mendocash.com / Admin123*');
    console.log('  Usuario: juan@mendocash.com / Usuario123*');
    console.log('  Usuario: maria@mendocash.com / Usuario123*');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  seedDatabase().catch((err) => {
    console.error('Error en el seed:', err.stack || err.message);
    process.exit(1);
  });
}
