// Esquema SQLite para MendoCash (modo local/offline).
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  module TEXT NOT NULL DEFAULT 'general',
  description TEXT
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INTEGER NOT NULL,
  permission_id INTEGER NOT NULL,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id INTEGER NOT NULL,
  role_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,
  value TEXT,
  user_id INTEGER,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'expense',
  color TEXT DEFAULT '#5BC0BE',
  icon TEXT,
  is_global INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subcategories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  relation_type TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  bank TEXT,
  number TEXT,
  initial_balance REAL NOT NULL DEFAULT 0,
  current_balance REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'COP',
  status TEXT NOT NULL DEFAULT 'active',
  allow_overdraft INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS income (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  category_id INTEGER,
  date TEXT NOT NULL,
  description TEXT,
  amount REAL NOT NULL,
  income_method TEXT,
  income_type TEXT,
  is_recurring INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  category_id INTEGER,
  subcategory_id INTEGER,
  date TEXT NOT NULL,
  description TEXT,
  amount REAL NOT NULL,
  payment_method TEXT,
  merchant TEXT,
  is_recurring INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  from_account_id INTEGER NOT NULL,
  to_account_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  description TEXT,
  group_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  person_id INTEGER,
  type TEXT NOT NULL,
  amount REAL NOT NULL,
  interest_rate REAL DEFAULT 0,
  date TEXT NOT NULL,
  due_date TEXT,
  num_installments INTEGER NOT NULL DEFAULT 1,
  periodicity TEXT,
  installment_amount REAL DEFAULT 0,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS loan_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loan_id INTEGER NOT NULL,
  account_id INTEGER,
  date TEXT NOT NULL,
  amount REAL NOT NULL,
  installment_number INTEGER,
  principal REAL NOT NULL DEFAULT 0,
  interest REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS debts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  creditor TEXT NOT NULL,
  concept TEXT,
  amount REAL NOT NULL,
  start_date TEXT NOT NULL,
  due_date TEXT,
  interest_rate REAL DEFAULT 0,
  num_installments INTEGER NOT NULL DEFAULT 1,
  installment_amount REAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS debt_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  debt_id INTEGER NOT NULL,
  account_id INTEGER,
  date TEXT NOT NULL,
  amount REAL NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  category_id INTEGER NOT NULL,
  period TEXT NOT NULL,
  amount REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recurring_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  amount REAL NOT NULL,
  category_id INTEGER,
  account_id INTEGER,
  frequency TEXT NOT NULL DEFAULT 'monthly',
  next_due_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  link TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, type)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  module TEXT NOT NULL,
  record_id TEXT,
  old_data TEXT,
  new_data TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;
