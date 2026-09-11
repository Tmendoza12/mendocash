-- =====================================================================
--  Sistema de gestión de finanzas personales y familiares
--  Esquema relacional normalizado (PostgreSQL)
-- =====================================================================

-- ========================= USUARIOS Y SEGURIDAD =====================
CREATE TABLE IF NOT EXISTS roles (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  slug        VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  is_system   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permissions (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(120) NOT NULL UNIQUE,
  module      VARCHAR(100) NOT NULL DEFAULT 'general',
  description TEXT
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  full_name     VARCHAR(200) NOT NULL,
  email         VARCHAR(200) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  phone         VARCHAR(50),
  avatar_url    TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS password_resets (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token);

CREATE TABLE IF NOT EXISTS sessions (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      VARCHAR(255) NOT NULL,
  ip_address VARCHAR(100),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- ========================= CONFIGURACIÓN ============================
CREATE TABLE IF NOT EXISTS settings (
  id          SERIAL PRIMARY KEY,
  key         VARCHAR(120) NOT NULL,
  value       TEXT,
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (key, user_id)
);

-- ========================= CATÁLOGOS ================================
CREATE TABLE IF NOT EXISTS categories (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name        VARCHAR(150) NOT NULL,
  type        VARCHAR(20) NOT NULL DEFAULT 'expense' CHECK (type IN ('income','expense')),
  color       VARCHAR(20) DEFAULT '#6366f1',
  icon        VARCHAR(50),
  is_global   BOOLEAN NOT NULL DEFAULT FALSE,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type);

CREATE TABLE IF NOT EXISTS subcategories (
  id          SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name        VARCHAR(150) NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subcategories_cat ON subcategories(category_id);

CREATE TABLE IF NOT EXISTS people (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name     VARCHAR(200) NOT NULL,
  phone         VARCHAR(50),
  email         VARCHAR(200),
  relation_type VARCHAR(100),
  notes         TEXT,
  status        VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_people_user ON people(user_id);

-- ========================= CUENTAS ==================================
CREATE TABLE IF NOT EXISTS accounts (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            VARCHAR(150) NOT NULL,
  type            VARCHAR(50) NOT NULL,
  bank            VARCHAR(150),
  number          VARCHAR(100),
  initial_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
  current_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency        VARCHAR(10) NOT NULL DEFAULT 'COP',
  status          VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  allow_overdraft BOOLEAN NOT NULL DEFAULT FALSE,
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);

-- ========================= INGRESOS =================================
CREATE TABLE IF NOT EXISTS income (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id    INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  category_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  date          DATE NOT NULL DEFAULT CURRENT_DATE,
  description   VARCHAR(255),
  amount        NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  income_method VARCHAR(100),
  income_type   VARCHAR(100),
  is_recurring  BOOLEAN NOT NULL DEFAULT FALSE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_income_user_date ON income(user_id, date);
CREATE INDEX IF NOT EXISTS idx_income_account ON income(account_id);

-- ========================= GASTOS ===================================
CREATE TABLE IF NOT EXISTS expenses (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id      INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  category_id     INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  subcategory_id  INTEGER REFERENCES subcategories(id) ON DELETE SET NULL,
  date            DATE NOT NULL DEFAULT CURRENT_DATE,
  description     VARCHAR(255),
  amount          NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  payment_method  VARCHAR(100),
  merchant        VARCHAR(200),
  is_recurring    BOOLEAN NOT NULL DEFAULT FALSE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_id, date);
CREATE INDEX IF NOT EXISTS idx_expenses_account ON expenses(account_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);

-- ========================= TRANSFERENCIAS ===========================
CREATE TABLE IF NOT EXISTS transfers (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  to_account_id   INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  amount          NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  date            DATE NOT NULL DEFAULT CURRENT_DATE,
  description     VARCHAR(255),
  group_id        UUID NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_transfers_user_date ON transfers(user_id, date);

-- ========================= PRÉSTAMOS ================================
CREATE TABLE IF NOT EXISTS loans (
  id                 SERIAL PRIMARY KEY,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  person_id          INTEGER REFERENCES people(id) ON DELETE SET NULL,
  type               VARCHAR(20) NOT NULL CHECK (type IN ('lent','borrowed')),
  amount             NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  interest_rate      NUMERIC(8,3) DEFAULT 0,
  date               DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date           DATE,
  num_installments   INTEGER NOT NULL DEFAULT 1,
  periodicity        VARCHAR(50),
  installment_amount NUMERIC(15,2) DEFAULT 0,
  description        VARCHAR(255),
  status             VARCHAR(30) NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','active','partially_paid','paid','overdue','cancelled')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_loans_user ON loans(user_id);
CREATE INDEX IF NOT EXISTS idx_loans_type ON loans(type);

CREATE TABLE IF NOT EXISTS loan_payments (
  id                 SERIAL PRIMARY KEY,
  loan_id            INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  account_id         INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  date               DATE NOT NULL DEFAULT CURRENT_DATE,
  amount             NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  installment_number INTEGER,
  principal          NUMERIC(15,2) NOT NULL DEFAULT 0,
  interest           NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_loan_payments_loan ON loan_payments(loan_id);

-- ========================= DEUDAS ===================================
CREATE TABLE IF NOT EXISTS debts (
  id                 SERIAL PRIMARY KEY,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  creditor           VARCHAR(200) NOT NULL,
  concept            VARCHAR(255),
  amount             NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  start_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date           DATE,
  interest_rate      NUMERIC(8,3) DEFAULT 0,
  num_installments   INTEGER NOT NULL DEFAULT 1,
  installment_amount NUMERIC(15,2) DEFAULT 0,
  status             VARCHAR(30) NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','active','partially_paid','paid','overdue','cancelled')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_debts_user ON debts(user_id);

CREATE TABLE IF NOT EXISTS debt_payments (
  id         SERIAL PRIMARY KEY,
  debt_id    INTEGER NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  date       DATE NOT NULL DEFAULT CURRENT_DATE,
  amount     NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_debt_payments_debt ON debt_payments(debt_id);

-- ========================= PRESUPUESTOS =============================
CREATE TABLE IF NOT EXISTS budgets (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  period      DATE NOT NULL, -- primer día del mes
  amount      NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, category_id, period)
);
CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id, period);

-- ========================= GASTOS RECURRENTES =======================
CREATE TABLE IF NOT EXISTS recurring_expenses (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          VARCHAR(200) NOT NULL,
  amount        NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  category_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  account_id    INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  frequency     VARCHAR(30) NOT NULL DEFAULT 'monthly'
                CHECK (frequency IN ('daily','weekly','biweekly','monthly','quarterly','yearly')),
  next_due_date DATE,
  end_date      DATE,
  status        VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','finished')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recurring_user ON recurring_expenses(user_id);

-- ========================= NOTIFICACIONES ===========================
CREATE TABLE IF NOT EXISTS notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(50) NOT NULL,
  title      VARCHAR(255) NOT NULL,
  message    TEXT,
  link       VARCHAR(255),
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type      VARCHAR(50) NOT NULL,
  enabled   BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (user_id, type)
);

-- ========================= AUDITORÍA ================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(50) NOT NULL,
  module      VARCHAR(100) NOT NULL,
  record_id   VARCHAR(100),
  old_data    JSONB,
  new_data    JSONB,
  ip_address  VARCHAR(100),
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

-- ========================= VISTA DE MOVIMIENTOS =====================
CREATE OR REPLACE VIEW movements AS
SELECT
  i.id,
  i.user_id,
  'income'::text AS type,
  'Ingreso'::text AS type_label,
  i.date,
  COALESCE(i.description, '') AS description,
  c.name AS category,
  a.name AS account,
  i.amount,
  'completed'::text AS status,
  i.created_at
FROM income i
LEFT JOIN accounts a ON a.id = i.account_id
LEFT JOIN categories c ON c.id = i.category_id
UNION ALL
SELECT
  e.id, e.user_id, 'expense', 'Gasto', e.date,
  COALESCE(e.description,''), c.name, a.name, e.amount, 'completed', e.created_at
FROM expenses e
LEFT JOIN accounts a ON a.id = e.account_id
LEFT JOIN categories c ON c.id = e.category_id
UNION ALL
SELECT
  t.id, t.user_id, 'transfer', 'Transferencia', t.date,
  COALESCE(t.description,''),
  NULL, (fa.name || ' -> ' || ta.name), t.amount, 'completed', t.created_at
FROM transfers t
LEFT JOIN accounts fa ON fa.id = t.from_account_id
LEFT JOIN accounts ta ON ta.id = t.to_account_id
UNION ALL
SELECT
  lp.id, l.user_id, 'loan_payment', 'Pago de préstamo', lp.date,
  COALESCE(l.description,''), NULL, a.name, lp.amount, 'completed', lp.created_at
FROM loan_payments lp
JOIN loans l ON l.id = lp.loan_id
LEFT JOIN accounts a ON a.id = lp.account_id
UNION ALL
SELECT
  dp.id, d.user_id, 'debt_payment', 'Pago de deuda', dp.date,
  COALESCE(d.concept,''), NULL, a.name, dp.amount, 'completed', dp.created_at
FROM debt_payments dp
JOIN debts d ON d.id = dp.debt_id
LEFT JOIN accounts a ON a.id = dp.account_id;
