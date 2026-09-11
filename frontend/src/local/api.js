import { ensureOpen, all, get, run, insert, tx } from './db.js';
import { hashPassword, verifyPassword } from './hash.js';

// ---------------------------------------------------------------------------
// Estado de sesión y utilidades
// ---------------------------------------------------------------------------
let currentUser = null;

function httpError(status, message, errors = []) {
  const e = new Error(message);
  e.status = status;
  e.errors = errors;
  return e;
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthFirst() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function periodToDates(period) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const s = (d) => d.toISOString().slice(0, 10);
  switch (period) {
    case 'today': return { start: s(now), end: s(now) };
    case 'week': { const day = now.getDay() || 7; const st = new Date(now); st.setDate(now.getDate() - day + 1); return { start: s(st), end: s(now) }; }
    case 'month': return { start: s(start), end: s(now) };
    case 'last_month': { const st = new Date(now.getFullYear(), now.getMonth() - 1, 1); const en = new Date(now.getFullYear(), now.getMonth(), 0); return { start: s(st), end: s(en) }; }
    case 'last_3_months': { const st = new Date(now.getFullYear(), now.getMonth() - 2, 1); return { start: s(st), end: s(now) }; }
    case 'last_6_months': { const st = new Date(now.getFullYear(), now.getMonth() - 5, 1); return { start: s(st), end: s(now) }; }
    case 'year': return { start: `${now.getFullYear()}-01-01`, end: s(now) };
    case 'last_year': return { start: `${now.getFullYear() - 1}-01-01`, end: `${now.getFullYear() - 1}-12-31` };
    default: return { start: s(start), end: s(now) };
  }
}

function requireAuth() {
  if (!currentUser) throw httpError(401, 'No autenticado.');
  return currentUser;
}

function hasPermission(p) {
  return currentUser?.permissions?.includes(p) || false;
}

function requirePermission(p) {
  if (!hasPermission(p)) throw httpError(403, 'No tienes permiso para realizar esta acción.');
}

function targetUserIdForRead(query) {
  if (hasPermission('datos.globales.ver') && query.user_id) return Number(query.user_id);
  return currentUser.id;
}

function buildPagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(query.limit, 10) || 10));
  return { page, limit, offset: (page - 1) * limit };
}

// ---------------------------------------------------------------------------
// Helpers de dominio
// ---------------------------------------------------------------------------
function loadUserAccess(userId) {
  const user = get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) return null;
  const perms = all(
    `SELECT DISTINCT p.name FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       JOIN user_roles ur ON ur.role_id = rp.role_id WHERE ur.user_id = ?`,
    [userId]
  ).map((r) => r.name);
  const roles = all(
    `SELECT r.id, r.name, r.slug FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ?`,
    [userId]
  );
  return {
    user: {
      id: user.id, full_name: user.full_name, email: user.email, phone: user.phone,
      avatar_url: user.avatar_url, is_active: !!user.is_active, last_login_at: user.last_login_at,
      created_at: user.created_at,
    },
    permissions: perms,
    roles,
  };
}

function logAudit(userId, action, module, recordId, oldData, newData) {
  run('INSERT INTO audit_logs (user_id, action, module, record_id, old_data, new_data) VALUES (?, ?, ?, ?, ?, ?)', [
    userId || null, action, module, recordId ? String(recordId) : null,
    oldData ? JSON.stringify(oldData) : null, newData ? JSON.stringify(newData) : null,
  ]);
}

function recomputeBalances(userId) {
  const accounts = all('SELECT id FROM accounts WHERE user_id = ?', [userId]);
  for (const a of accounts) {
    const income = get('SELECT COALESCE(SUM(amount),0) AS v FROM income WHERE account_id = ?', [a.id]).v;
    const expense = get('SELECT COALESCE(SUM(amount),0) AS v FROM expenses WHERE account_id = ?', [a.id]).v;
    const tIn = get('SELECT COALESCE(SUM(amount),0) AS v FROM transfers WHERE to_account_id = ?', [a.id]).v;
    const tOut = get('SELECT COALESCE(SUM(amount),0) AS v FROM transfers WHERE from_account_id = ?', [a.id]).v;
    const lpIn = get("SELECT COALESCE(SUM(lp.amount),0) AS v FROM loan_payments lp JOIN loans l ON l.id = lp.loan_id WHERE l.type = 'lent' AND lp.account_id = ?", [a.id]).v;
    const lpOut = get("SELECT COALESCE(SUM(lp.amount),0) AS v FROM loan_payments lp JOIN loans l ON l.id = lp.loan_id WHERE l.type = 'borrowed' AND lp.account_id = ?", [a.id]).v;
    const dpOut = get('SELECT COALESCE(SUM(amount),0) AS v FROM debt_payments WHERE account_id = ?', [a.id]).v;
    const initial = get('SELECT initial_balance FROM accounts WHERE id = ?', [a.id]).initial_balance;
    const balance = round2(initial + income - expense + tIn - tOut + lpIn - lpOut - dpOut);
    run('UPDATE accounts SET current_balance = ? WHERE id = ?', [balance, a.id]);
  }
}

function ensureFunds(accountId, amount) {
  const account = get('SELECT current_balance, allow_overdraft FROM accounts WHERE id = ?', [accountId]);
  if (!account) throw httpError(404, 'Cuenta no encontrada.');
  if (!account.allow_overdraft && account.current_balance < amount) {
    throw httpError(400, 'La cuenta no tiene fondos suficientes.');
  }
}

function refreshLoanStatus(loanId) {
  const loan = get(
    `SELECT l.*,
       COALESCE((SELECT SUM(principal) FROM loan_payments WHERE loan_id = l.id), 0) AS principal_paid,
       COALESCE((SELECT COUNT(*) FROM loan_payments WHERE loan_id = l.id), 0) AS payments_count
     FROM loans l WHERE l.id = ?`,
    [loanId]
  );
  if (!loan) return;
  const pending = Math.max(0, loan.amount - loan.principal_paid);
  let status = loan.status;
  if (status !== 'cancelled') {
    if (pending <= 0) status = 'paid';
    else if (loan.due_date && loan.due_date < today()) status = 'overdue';
    else if (loan.payments_count > 0) status = 'partially_paid';
    else if (status !== 'active' && status !== 'pending') status = 'active';
  }
  run("UPDATE loans SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, loanId]);
}

function refreshDebtStatus(debtId) {
  const debt = get(
    `SELECT d.*, COALESCE((SELECT SUM(amount) FROM debt_payments WHERE debt_id = d.id), 0) AS paid FROM debts d WHERE d.id = ?`,
    [debtId]
  );
  if (!debt) return;
  const pending = Math.max(0, debt.amount - debt.paid);
  let status = debt.status;
  if (status !== 'cancelled') {
    if (pending <= 0) status = 'paid';
    else if (debt.due_date && debt.due_date < today()) status = 'overdue';
    else if (debt.paid > 0) status = 'partially_paid';
    else if (status !== 'active' && status !== 'pending') status = 'active';
  }
  run("UPDATE debts SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, debtId]);
}

const periodicityDays = { diaria: 1, semanal: 7, quincenal: 15, mensual: 30, bimestral: 60, trimestral: 90, anual: 365 };

function summarizeLoan(l) {
  const pending = Math.max(0, round2(l.amount - l.principal_paid));
  const paidCount = l.payments_count || 0;
  const days = periodicityDays[l.periodicity] || 30;
  const start = new Date(`${l.date}T00:00:00`);
  let overdue = 0;
  for (let k = 0; k < (l.num_installments || 1); k++) {
    const due = new Date(start);
    due.setDate(due.getDate() + days * k);
    if (due.toISOString().slice(0, 10) < today() && k >= paidCount) overdue++;
  }
  return {
    ...l,
    pending,
    next_installment_number: pending > 0 ? paidCount + 1 : null,
    next_due_date: pending > 0 ? addDays(l.date, days * paidCount) : null,
    paid_installments: paidCount,
    pending_installments: Math.max(0, (l.num_installments || 1) - paidCount),
    overdue_installments: overdue,
  };
}

function summarizeDebt(d) {
  return { ...d, pending: Math.max(0, round2(d.amount - d.paid)) };
}

const LOAN_SELECT = `SELECT l.*, p.full_name AS person_name,
  COALESCE((SELECT SUM(amount) FROM loan_payments WHERE loan_id = l.id), 0) AS paid,
  COALESCE((SELECT SUM(principal) FROM loan_payments WHERE loan_id = l.id), 0) AS principal_paid,
  COALESCE((SELECT SUM(interest) FROM loan_payments WHERE loan_id = l.id), 0) AS interest_paid,
  COALESCE((SELECT COUNT(*) FROM loan_payments WHERE loan_id = l.id), 0) AS payments_count
  FROM loans l LEFT JOIN people p ON p.id = l.person_id`;

// ---------------------------------------------------------------------------
// Exportación (CSV / Excel / PDF)
// ---------------------------------------------------------------------------
function escapeCSV(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildCSV(headers, rows) {
  const head = headers.map((h) => escapeCSV(h.label)).join(',');
  const body = rows.map((r) => headers.map((h) => escapeCSV(r[h.key])).join(',')).join('\n');
  return `${head}\n${body}`;
}

function buildExcel(headers, rows, title) {
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const rowXml = (cells, tag) => `<Row>${cells.map((c) => `<Cell><Data ss:Type="String">${esc(c)}</Data></Cell>`).join('')}</Row>`;
  return `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="${esc(title || 'Reporte')}"><Table>${rowXml(headers.map((h) => h.label))}${rows.map((r) => rowXml(headers.map((h) => r[h.key]))).join('')}</Table></Worksheet></Workbook>`;
}

function buildPDF(headers, rows, title) {
  const lines = [];
  lines.push(title || 'Reporte');
  lines.push('');
  lines.push(headers.map((h) => h.label).join('  |  '));
  lines.push('-'.repeat(60));
  for (const r of rows) lines.push(headers.map((h) => r[h.key] == null ? '' : String(r[h.key])).join('  |  '));

  const clean = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '?');
  const esc = (s) => clean(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

  const pageWidth = 842;
  const pageHeight = 595;
  const margin = 40;
  const lineHeight = 12;
  const maxLines = Math.floor((pageHeight - 2 * margin) / lineHeight);
  const content = [];
  let pageLines = [];
  for (const l of lines) {
    pageLines.push(l);
    if (pageLines.length >= maxLines) {
      content.push(pageLines.join('\n'));
      pageLines = [];
    }
  }
  if (pageLines.length) content.push(pageLines.join('\n'));

  let objects = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  const kids = content.map((_, i) => `${i + 3} 0 R`).join(' ');
  objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${content.length} >>`;
  const fontObj = content.length + 3;
  objects[fontObj] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

  const streams = [];
  content.forEach((text, i) => {
    const objNum = i + 3;
    let stream = 'BT /F1 9 Tf 40 555 Td 12 TL\n';
    for (const line of text.split('\n')) {
      stream += `(${esc(line)}) Tj T*\n`;
    }
    stream += 'ET';
    objects[objNum] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontObj} 0 R >> >> /Contents ${objNum + content.length + 1} 0 R >>`;
    streams.push({ num: objNum + content.length + 1, stream });
  });

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  const total = content.length + fontObj;
  for (let i = 1; i <= total; i++) {
    offsets[i] = pdf.length;
    pdf += `${i} 0 obj\n${objects[i] || '<< /Length 0 >>'}\nendobj\n`;
  }
  streams.forEach(({ num, stream }) => {
    offsets[num] = pdf.length;
    pdf += `${num} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`;
  });
  const xrefPos = pdf.length;
  const maxObj = total + streams.length;
  pdf += `xref\n0 ${maxObj + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= maxObj; i++) {
    pdf += `${String(offsets[i] || 0).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${maxObj + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

  return pdf;
}

function exportBlob(format, headers, rows, title) {
  if (format === 'xlsx' || format === 'excel') {
    return new Blob([buildExcel(headers, rows, title)], { type: 'application/vnd.ms-excel' });
  }
  if (format === 'pdf') {
    return new Blob([buildPDF(headers, rows, title)], { type: 'application/pdf' });
  }
  return new Blob([buildCSV(headers, rows)], { type: 'text/csv' });
}

// ---------------------------------------------------------------------------
// Módulos
// ---------------------------------------------------------------------------
const accountColumns = 'id, user_id, name, type, bank, number, initial_balance, current_balance, currency, status, allow_overdraft, description, created_at';
const userColumns = 'id, full_name, email, phone, avatar_url, is_active, last_login_at, created_at';

function attachRoles(users) {
  if (!users.length) return users;
  const ids = users.map((u) => u.id);
  const placeholders = ids.map(() => '?').join(',');
  const rows = all(
    `SELECT ur.user_id, r.id, r.name, r.slug FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id IN (${placeholders})`,
    ids
  );
  const map = {};
  for (const r of rows) (map[r.user_id] = map[r.user_id] || []).push({ id: r.id, name: r.name, slug: r.slug });
  return users.map((u) => ({ ...u, roles: map[u.id] || [] }));
}

// ----- Auth -----
function authLogin(body) {
  const { email, password } = body;
  const user = get('SELECT * FROM users WHERE email = ?', [email]);
  if (!user || !verifyPassword(password, user.password_hash)) throw httpError(401, 'Credenciales inválidas.');
  if (!user.is_active) throw httpError(403, 'Usuario desactivado. Contacta al administrador.');
  run("UPDATE users SET last_login_at = datetime('now') WHERE id = ?", [user.id]);
  const access = loadUserAccess(user.id);
  currentUser = { ...access.user, permissions: access.permissions, roles: access.roles };
  logAudit(user.id, 'login', 'auth', user.id);
  return { token: `local-${Date.now()}`, user: currentUser };
}

function authMe() {
  requireAuth();
  const session = currentUser;
  let user = get('SELECT * FROM users WHERE email = ?', [session.email]);
  if (!user) {
    const id = insert('INSERT INTO users (full_name, email, password_hash, avatar_url) VALUES (?, ?, ?, ?)', [
      session.full_name || session.email, session.email, hashPassword('backend-' + Math.random().toString(36).slice(2)), session.avatar_url || null,
    ]);
    for (const r of session.roles || []) {
      const role = get('SELECT id FROM roles WHERE slug = ?', [r.slug]);
      if (role) run('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [id, role.id]);
    }
    user = get('SELECT * FROM users WHERE id = ?', [id]);
  } else if (session.full_name || session.avatar_url) {
    run("UPDATE users SET full_name = COALESCE(?, full_name), avatar_url = COALESCE(?, avatar_url) WHERE id = ?", [session.full_name ?? null, session.avatar_url ?? null, user.id]);
    user = get('SELECT * FROM users WHERE id = ?', [user.id]);
  }
  const access = loadUserAccess(user.id);
  return { user: { ...access.user, permissions: access.permissions, roles: access.roles } };
}

function authLogout() {
  if (currentUser) logAudit(currentUser.id, 'logout', 'auth', currentUser.id);
  currentUser = null;
  return { message: 'Sesión cerrada.' };
}

function authProfile(body) {
  requireAuth();
  const u = get('SELECT * FROM users WHERE id = ?', [currentUser.id]);
  const fullName = body.full_name ?? u.full_name;
  const phone = body.phone ?? u.phone;
  const avatar = body.avatar_url ?? u.avatar_url;
  run("UPDATE users SET full_name = ?, phone = ?, avatar_url = ?, updated_at = datetime('now') WHERE id = ?", [fullName, phone, avatar, currentUser.id]);
  const updated = get(`SELECT ${userColumns} FROM users WHERE id = ?`, [currentUser.id]);
  logAudit(currentUser.id, 'update_profile', 'auth', currentUser.id);
  return { user: { ...updated, is_active: !!updated.is_active } };
}

function authChangePassword(body) {
  requireAuth();
  const u = get('SELECT * FROM users WHERE id = ?', [currentUser.id]);
  if (!verifyPassword(body.current_password, u.password_hash)) throw httpError(400, 'La contraseña actual es incorrecta.');
  run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(body.new_password), currentUser.id]);
  logAudit(currentUser.id, 'change_password', 'auth', currentUser.id);
  currentUser = null;
  return { message: 'Contraseña actualizada. Debes iniciar sesión nuevamente.' };
}

function authGoogle(body) {
  const { email, name, picture } = body;
  if (!email) throw httpError(400, 'Correo de Google no proporcionado.');
  let user = get('SELECT * FROM users WHERE email = ?', [email]);
  if (!user) {
    const role = get("SELECT id FROM roles WHERE slug = 'user'");
    const id = insert('INSERT INTO users (full_name, email, password_hash, avatar_url) VALUES (?, ?, ?, ?)', [name || email, email, hashPassword('google-' + Math.random().toString(36).slice(2)), picture || null]);
    if (role) run('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [id, role.id]);
    user = get('SELECT * FROM users WHERE id = ?', [id]);
  } else if (name || picture) {
    run("UPDATE users SET full_name = COALESCE(?, full_name), avatar_url = COALESCE(?, avatar_url), updated_at = datetime('now') WHERE id = ?", [name ?? null, picture ?? null, user.id]);
    user = get('SELECT * FROM users WHERE id = ?', [user.id]);
  }
  if (!user.is_active) throw httpError(403, 'Usuario desactivado. Contacta al administrador.');
  run("UPDATE users SET last_login_at = datetime('now') WHERE id = ?", [user.id]);
  const access = loadUserAccess(user.id);
  currentUser = { ...access.user, permissions: access.permissions, roles: access.roles };
  logAudit(user.id, 'login_google', 'auth', user.id);
  return { token: `local-google-${Date.now()}`, user: currentUser };
}

// ----- Dashboard -----
function dashboard(query) {
  const userId = targetUserIdForRead(query);
  const { start, end } = periodToDates(query.period || 'month');

  const balances = get("SELECT COALESCE(SUM(current_balance),0) AS total_balance FROM accounts WHERE user_id = ? AND status = 'active'", [userId]);
  const totals = get('SELECT (SELECT COALESCE(SUM(amount),0) FROM income WHERE user_id = ? AND date BETWEEN ? AND ?) AS income, (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE user_id = ? AND date BETWEEN ? AND ?) AS expense', [userId, start, end, userId, start, end]);

  // mensual (últimos 12 meses)
  const monthly = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ms = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const income = get('SELECT COALESCE(SUM(amount),0) AS v FROM income WHERE user_id = ? AND date >= ? AND date < ?', [userId, d.toISOString().slice(0, 10), next.toISOString().slice(0, 10)]).v;
    const expense = get('SELECT COALESCE(SUM(amount),0) AS v FROM expenses WHERE user_id = ? AND date >= ? AND date < ?', [userId, d.toISOString().slice(0, 10), next.toISOString().slice(0, 10)]).v;
    monthly.push({ month: ms, income: round2(income), expense: round2(expense) });
  }
  let cumulative = 0;
  const evolution = monthly.map((r) => {
    cumulative += r.income - r.expense;
    return { month: r.month, income: r.income, expense: r.expense, cumulative: round2(cumulative) };
  });

  const expenseByCategory = all('SELECT c.name, c.color, COALESCE(SUM(e.amount),0) AS total FROM expenses e JOIN categories c ON c.id = e.category_id WHERE e.user_id = ? AND e.date BETWEEN ? AND ? GROUP BY c.id ORDER BY total DESC LIMIT 10', [userId, start, end]).map((r) => ({ ...r, total: round2(r.total) }));
  const accountDistribution = all("SELECT name, type, current_balance FROM accounts WHERE user_id = ? AND status = 'active' ORDER BY current_balance DESC", [userId]).map((r) => ({ ...r, balance: round2(r.current_balance) }));

  const incomeRange = get("SELECT (SELECT COALESCE(SUM(amount),0) FROM income WHERE user_id = ? AND date >= ?) AS d7, (SELECT COALESCE(SUM(amount),0) FROM income WHERE user_id = ? AND date >= ?) AS d30, (SELECT COALESCE(SUM(amount),0) FROM income WHERE user_id = ? AND date >= ?) AS d90", [userId, addDays(today(), -7), userId, addDays(today(), -30), userId, addDays(today(), -90)]);
  const expenseRange = get("SELECT (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE user_id = ? AND date >= ?) AS d7, (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE user_id = ? AND date >= ?) AS d30, (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE user_id = ? AND date >= ?) AS d90", [userId, addDays(today(), -7), userId, addDays(today(), -30), userId, addDays(today(), -90)]);

  const loanStatus = all('SELECT status, COUNT(*) AS count, COALESCE(SUM(MAX(0, amount - COALESCE((SELECT SUM(principal) FROM loan_payments WHERE loan_id = loans.id), 0))),0) AS pending FROM loans WHERE user_id = ? GROUP BY status', [userId]);
  const debtStatus = all('SELECT status, COUNT(*) AS count, COALESCE(SUM(MAX(0, amount - COALESCE((SELECT SUM(amount) FROM debt_payments WHERE debt_id = debts.id), 0))),0) AS pending FROM debts WHERE user_id = ? GROUP BY status', [userId]);

  const budgets = all("SELECT b.*, c.name AS category_name, c.color AS category_color, COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.category_id = b.category_id AND e.user_id = b.user_id AND e.date >= b.period AND e.date < date(b.period, '+1 month')), 0) AS spent FROM budgets b JOIN categories c ON c.id = b.category_id WHERE b.user_id = ? AND b.period = ?", [userId, monthFirst()]);

  const upcomingDebts = all("SELECT id, creditor, concept, due_date, amount, MAX(0, amount - COALESCE((SELECT SUM(amount) FROM debt_payments WHERE debt_id = debts.id),0)) AS pending FROM debts WHERE user_id = ? AND status NOT IN ('paid','cancelled') AND due_date IS NOT NULL AND due_date <= ? ORDER BY due_date LIMIT 10", [userId, addDays(today(), 7)]);
  const upcomingLoans = all("SELECT l.id, l.type, l.due_date, l.amount, p.full_name AS person_name, MAX(0, l.amount - COALESCE((SELECT SUM(principal) FROM loan_payments WHERE loan_id = l.id),0)) AS pending FROM loans l LEFT JOIN people p ON p.id = l.person_id WHERE l.user_id = ? AND l.status NOT IN ('paid','cancelled') AND l.due_date IS NOT NULL AND l.due_date <= ? ORDER BY l.due_date LIMIT 10", [userId, addDays(today(), 7)]);
  const lowAccounts = all("SELECT id, name, type, current_balance FROM accounts WHERE user_id = ? AND status = 'active' AND current_balance < 50000", [userId]);
  const upcomingRecurring = all("SELECT id, name, amount, next_due_date FROM recurring_expenses WHERE user_id = ? AND status = 'active' AND next_due_date IS NOT NULL AND next_due_date <= ? ORDER BY next_due_date LIMIT 10", [userId, addDays(today(), 7)]);

  const receivable = get("SELECT COALESCE(SUM(MAX(0, l.amount - COALESCE((SELECT SUM(principal) FROM loan_payments WHERE loan_id = l.id),0))),0) AS total FROM loans l WHERE l.user_id = ? AND l.type = 'lent' AND l.status NOT IN ('paid','cancelled')", [userId]).total;
  const borrowedPending = get("SELECT COALESCE(SUM(MAX(0, l.amount - COALESCE((SELECT SUM(principal) FROM loan_payments WHERE loan_id = l.id),0))),0) AS total FROM loans l WHERE l.user_id = ? AND l.type = 'borrowed' AND l.status NOT IN ('paid','cancelled')", [userId]).total;
  const debtsPending = get("SELECT COALESCE(SUM(MAX(0, d.amount - COALESCE((SELECT SUM(amount) FROM debt_payments WHERE debt_id = d.id),0))),0) AS total FROM debts d WHERE d.user_id = ? AND d.status NOT IN ('paid','cancelled')", [userId]).total;
  const activeLoans = get("SELECT COUNT(*) AS count FROM loans WHERE user_id = ? AND status NOT IN ('paid','cancelled')", [userId]).count;

  const alerts = [];
  for (const b of budgets) {
    const pct = b.amount > 0 ? (b.spent / b.amount) * 100 : 0;
    if (pct >= 100) alerts.push({ type: 'budget', severity: 'danger', message: `Presupuesto de ${b.category_name} superado (${pct.toFixed(0)}%).` });
    else if (pct >= 90) alerts.push({ type: 'budget', severity: 'warning', message: `Presupuesto de ${b.category_name} casi agotado (${pct.toFixed(0)}%).` });
    else if (pct >= 70) alerts.push({ type: 'budget', severity: 'info', message: `Presupuesto de ${b.category_name} al ${pct.toFixed(0)}%.` });
  }
  for (const d of upcomingDebts) alerts.push({ type: 'debt', severity: d.due_date < today() ? 'danger' : 'warning', message: `${d.due_date < today() ? 'Deuda vencida' : 'Deuda próxima a vencer'}: ${d.creditor} (${d.due_date}).` });
  for (const l of upcomingLoans) alerts.push({ type: 'loan', severity: l.due_date < today() ? 'danger' : 'warning', message: `${l.due_date < today() ? 'Vencido' : 'Próximo'}: ${l.type === 'lent' ? 'préstamo por cobrar' : 'préstamo por pagar'} (${l.due_date}).` });
  for (const a of lowAccounts) alerts.push({ type: 'account', severity: 'info', message: `Saldo bajo en la cuenta ${a.name}.` });
  for (const r of upcomingRecurring) alerts.push({ type: 'recurring', severity: 'info', message: `Gasto recurrente próximo: ${r.name} (${r.next_due_date}).` });

  return {
    period: { start, end },
    kpis: {
      total_balance: round2(balances.total_balance),
      income: round2(totals.income),
      expense: round2(totals.expense),
      balance: round2(totals.income - totals.expense),
      total_debts: round2(debtsPending),
      receivable: round2(receivable),
      payable: round2(borrowedPending + debtsPending),
      active_loans: activeLoans,
      net_worth: round2(balances.total_balance + receivable - (borrowedPending + debtsPending)),
    },
    charts: {
      monthly,
      balance_evolution: evolution,
      expense_by_category: expenseByCategory,
      account_distribution: accountDistribution,
      income_range: { d7: round2(incomeRange.d7), d30: round2(incomeRange.d30), d90: round2(incomeRange.d90) },
      expense_range: { d7: round2(expenseRange.d7), d30: round2(expenseRange.d30), d90: round2(expenseRange.d90) },
      loan_status: loanStatus.map((r) => ({ status: r.status, count: r.count, pending: round2(r.pending) })),
      debt_status: debtStatus.map((r) => ({ status: r.status, count: r.count, pending: round2(r.pending) })),
    },
    alerts,
  };
}

function calendar(query) {
  const userId = targetUserIdForRead(query);
  const events = [];
  for (const r of all('SELECT id, date, description, amount FROM income WHERE user_id = ?', [userId])) events.push({ id: `inc-${r.id}`, date: r.date, type: 'income', title: r.description || 'Ingreso', amount: r.amount });
  for (const r of all('SELECT id, date, description, amount FROM expenses WHERE user_id = ?', [userId])) events.push({ id: `exp-${r.id}`, date: r.date, type: 'expense', title: r.description || 'Gasto', amount: r.amount });
  for (const r of all('SELECT id, date, due_date, type, amount, description FROM loans WHERE user_id = ?', [userId])) {
    events.push({ id: `loan-${r.id}`, date: r.date, type: 'loan', title: r.description || (r.type === 'lent' ? 'Préstamo otorgado' : 'Préstamo recibido'), amount: r.amount });
    if (r.due_date) events.push({ id: `loan-due-${r.id}`, date: r.due_date, type: 'loan_due', title: `Vence préstamo (${r.type === 'lent' ? 'por cobrar' : 'por pagar'})`, amount: r.amount });
  }
  for (const r of all('SELECT id, start_date, due_date, creditor, concept, amount FROM debts WHERE user_id = ?', [userId])) {
    events.push({ id: `debt-${r.id}`, date: r.start_date, type: 'debt', title: r.concept || r.creditor, amount: r.amount });
    if (r.due_date) events.push({ id: `debt-due-${r.id}`, date: r.due_date, type: 'debt_due', title: `Vence: ${r.creditor}`, amount: r.amount });
  }
  for (const r of all("SELECT id, next_due_date, name, amount FROM recurring_expenses WHERE user_id = ? AND status = 'active' AND next_due_date IS NOT NULL", [userId])) events.push({ id: `rec-${r.id}`, date: r.next_due_date, type: 'recurring', title: r.name, amount: r.amount });
  for (const r of all('SELECT lp.id, lp.date, lp.amount, l.type FROM loan_payments lp JOIN loans l ON l.id = lp.loan_id WHERE l.user_id = ?', [userId])) events.push({ id: `lp-${r.id}`, date: r.date, type: 'loan_payment', title: r.type === 'lent' ? 'Cobro de préstamo' : 'Pago de préstamo', amount: r.amount });
  for (const r of all('SELECT dp.id, dp.date, dp.amount FROM debt_payments dp JOIN debts d ON d.id = dp.debt_id WHERE d.user_id = ?', [userId])) events.push({ id: `dp-${r.id}`, date: r.date, type: 'debt_payment', title: 'Pago de deuda', amount: r.amount });
  return { data: events };
}

export { today };

// ---------------------------------------------------------------------------
// Router principal
// ---------------------------------------------------------------------------
function match(patterns, path) {
  const parts = path.split('/').filter(Boolean);
  for (const p of patterns) {
    const pp = p.split('/').filter(Boolean);
    if (pp.length !== parts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < pp.length; i++) {
      if (pp[i].startsWith(':')) params[pp[i].slice(1)] = parts[i];
      else if (pp[i] !== parts[i]) { ok = false; break; }
    }
    if (ok) return params;
  }
  return null;
}

export async function handle(method, url, body = {}) {
  await ensureOpen();
  const [path, queryString = ''] = url.split('?');
  const query = Object.fromEntries(new URLSearchParams(queryString));

  const parseId = (p, name = 'id') => {
    const id = Number(p[name]);
    if (!id) throw httpError(400, 'ID inválido.');
    return id;
  };

  // --- Auth ---
  if (path === '/auth/login' && method === 'POST') return authLogin(body);
  if (path === '/auth/me' && method === 'GET') return authMe();
  if (path === '/auth/logout' && method === 'POST') return authLogout();
  if (path === '/auth/profile' && method === 'PUT') return authProfile(body);
  if (path === '/auth/change-password' && method === 'POST') return authChangePassword(body);
  if (path === '/auth/forgot-password' && method === 'POST') return { message: 'Si el correo existe, se enviarán instrucciones.', reset_token: 'local-' + Date.now() };
  if (path === '/auth/reset-password' && method === 'POST') return { message: 'Contraseña restablecida correctamente.' };
  if (path === '/auth/google' && method === 'POST') return authGoogle(body);

  requireAuth();

  // --- Settings / catalogs ---
  if (path === '/settings' && method === 'GET') {
    requirePermission('configuracion.ver');
    const rows = all('SELECT key, value, description FROM settings WHERE user_id IS NULL');
    const settings = {};
    for (const r of rows) settings[r.key] = r.value;
    return { settings, catalogs: CATALOGS, status_labels: STATUS_LABELS };
  }
  if (path === '/settings' && method === 'PUT') {
    requirePermission('configuracion.editar');
    for (const [k, v] of Object.entries(body.settings || {})) {
      run('INSERT INTO settings (key, value) VALUES (?, ?)', [k, String(v)]);
    }
    logAudit(currentUser.id, 'update', 'configuracion', null, null, body.settings);
    return { message: 'Configuración actualizada.' };
  }

  // --- Users ---
  if (path === '/users' && method === 'GET') {
    requirePermission('usuarios.ver');
    const { page, limit, offset } = buildPagination(query);
    const search = query.search || '';
    const where = search ? 'WHERE full_name LIKE ? OR email LIKE ?' : '';
    const params = search ? [`%${search}%`, `%${search}%`] : [];
    const total = get(`SELECT COUNT(*) AS c FROM users ${where}`, params).c;
    const rows = all(`SELECT ${userColumns} FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]).map((u) => ({ ...u, is_active: !!u.is_active }));
    return { data: attachRoles(rows), total, page, limit };
  }
  if (path === '/users' && method === 'POST') {
    requirePermission('usuarios.crear');
    const exists = get('SELECT 1 FROM users WHERE email = ?', [body.email]);
    if (exists) throw httpError(400, 'Ya existe un usuario con ese correo.');
    const id = insert('INSERT INTO users (full_name, email, phone, avatar_url, password_hash) VALUES (?, ?, ?, ?, ?)', [body.full_name, body.email, body.phone || null, body.avatar_url || null, hashPassword(body.password)]);
    for (const roleId of body.roles || []) run('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [id, roleId]);
    const user = get(`SELECT ${userColumns} FROM users WHERE id = ?`, [id]);
    logAudit(currentUser.id, 'create', 'usuarios', id, null, user);
    return { user: attachRoles([{ ...user, is_active: !!user.is_active }])[0] };
  }

  let m;
  if ((m = match(['/users/:id'], path)) && method === 'GET') {
    requirePermission('usuarios.ver');
    const id = parseId(m);
    const user = get(`SELECT ${userColumns} FROM users WHERE id = ?`, [id]);
    if (!user) throw httpError(404, 'Usuario no encontrado.');
    return { user: attachRoles([{ ...user, is_active: !!user.is_active }])[0] };
  }
  if ((m = match(['/users/:id'], path)) && method === 'PUT') {
    requirePermission('usuarios.editar');
    const id = parseId(m);
    const old = get('SELECT * FROM users WHERE id = ?', [id]);
    if (!old) throw httpError(404, 'Usuario no encontrado.');
    run("UPDATE users SET full_name = COALESCE(?, full_name), email = COALESCE(?, email), phone = COALESCE(?, phone), avatar_url = COALESCE(?, avatar_url), is_active = COALESCE(?, is_active), updated_at = datetime('now') WHERE id = ?", [body.full_name ?? null, body.email ?? null, body.phone ?? null, body.avatar_url ?? null, body.is_active ?? null, id]);
    if (body.password) run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(body.password), id]);
    if (Array.isArray(body.roles)) {
      run('DELETE FROM user_roles WHERE user_id = ?', [id]);
      for (const roleId of body.roles) run('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [id, roleId]);
    }
    const user = get(`SELECT ${userColumns} FROM users WHERE id = ?`, [id]);
    logAudit(currentUser.id, 'update', 'usuarios', id, old, user);
    return { user: attachRoles([{ ...user, is_active: !!user.is_active }])[0] };
  }
  if ((m = match(['/users/:id'], path)) && method === 'DELETE') {
    requirePermission('usuarios.eliminar');
    const id = parseId(m);
    if (id === currentUser.id) throw httpError(400, 'No puedes eliminar tu propio usuario.');
    run('DELETE FROM users WHERE id = ?', [id]);
    logAudit(currentUser.id, 'delete', 'usuarios', id);
    return { message: 'Usuario eliminado.' };
  }
  if ((m = match(['/users/:id/status'], path)) && method === 'PATCH') {
    requirePermission('usuarios.editar');
    const id = parseId(m);
    if (id === currentUser.id && body.is_active === false) throw httpError(400, 'No puedes desactivarte a ti mismo.');
    run('UPDATE users SET is_active = ? WHERE id = ?', [body.is_active ? 1 : 0, id]);
    const user = get(`SELECT ${userColumns} FROM users WHERE id = ?`, [id]);
    logAudit(currentUser.id, body.is_active ? 'activate' : 'deactivate', 'usuarios', id);
    return { user: { ...user, is_active: !!user.is_active } };
  }

  // --- Roles y permisos ---
  if (path === '/permissions' && method === 'GET') {
    requirePermission('permisos.ver');
    return { data: all('SELECT id, name, module, description FROM permissions ORDER BY module, name') };
  }
  if (path === '/roles' && method === 'GET') {
    requirePermission('roles.ver');
    const data = all('SELECT r.*, (SELECT COUNT(*) FROM role_permissions WHERE role_id = r.id) AS permissions_count, (SELECT COUNT(*) FROM user_roles WHERE role_id = r.id) AS users_count FROM roles r ORDER BY r.id').map((r) => ({ ...r, is_system: !!r.is_system }));
    return { data };
  }
  if (path === '/roles' && method === 'POST') {
    requirePermission('roles.crear');
    const id = insert('INSERT INTO roles (name, slug, description, is_system) VALUES (?, ?, ?, 0)', [body.name, body.slug, body.description || null]);
    for (const p of body.permissions || []) run('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [id, p]);
    return { role: get('SELECT * FROM roles WHERE id = ?', [id]) };
  }
  if ((m = match(['/roles/:id'], path)) && method === 'GET') {
    requirePermission('roles.ver');
    const id = parseId(m);
    const role = get('SELECT * FROM roles WHERE id = ?', [id]);
    if (!role) throw httpError(404, 'Rol no encontrado.');
    const permissions = all('SELECT p.id, p.name, p.module FROM permissions p JOIN role_permissions rp ON rp.permission_id = p.id WHERE rp.role_id = ?', [id]);
    return { role: { ...role, is_system: !!role.is_system, permissions } };
  }
  if ((m = match(['/roles/:id'], path)) && method === 'PUT') {
    requirePermission('roles.editar');
    const id = parseId(m);
    run('UPDATE roles SET name = COALESCE(?, name), description = COALESCE(?, description) WHERE id = ?', [body.name ?? null, body.description ?? null, id]);
    if (Array.isArray(body.permissions)) {
      run('DELETE FROM role_permissions WHERE role_id = ?', [id]);
      for (const p of body.permissions) run('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [id, p]);
    }
    return { role: get('SELECT * FROM roles WHERE id = ?', [id]) };
  }
  if ((m = match(['/roles/:id'], path)) && method === 'DELETE') {
    requirePermission('roles.eliminar');
    const id = parseId(m);
    const role = get('SELECT * FROM roles WHERE id = ?', [id]);
    if (role.is_system) throw httpError(400, 'No se pueden eliminar roles del sistema.');
    const count = get('SELECT COUNT(*) AS c FROM user_roles WHERE role_id = ?', [id]).c;
    if (count > 0) throw httpError(400, 'El rol tiene usuarios asignados.');
    run('DELETE FROM roles WHERE id = ?', [id]);
    return { message: 'Rol eliminado.' };
  }

  // --- Cuentas ---
  if (path === '/accounts' && method === 'GET') {
    requirePermission('cuentas.ver');
    const userId = targetUserIdForRead(query);
    return { data: all(`SELECT ${accountColumns} FROM accounts WHERE user_id = ? ORDER BY id`, [userId]).map((a) => ({ ...a, allow_overdraft: !!a.allow_overdraft })) };
  }
  if (path === '/accounts' && method === 'POST') {
    requirePermission('cuentas.crear');
    const userId = hasPermission('datos.globales.gestionar') && body.user_id ? Number(body.user_id) : currentUser.id;
    const id = insert('INSERT INTO accounts (user_id, name, type, bank, number, initial_balance, current_balance, currency, status, allow_overdraft, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [userId, body.name, body.type, body.bank || null, body.number || null, body.initial_balance || 0, body.initial_balance || 0, body.currency || 'COP', body.status || 'active', body.allow_overdraft ? 1 : 0, body.description || null]);
    const account = get(`SELECT ${accountColumns} FROM accounts WHERE id = ?`, [id]);
    logAudit(currentUser.id, 'create', 'cuentas', id, null, account);
    return { account: { ...account, allow_overdraft: !!account.allow_overdraft } };
  }
  if ((m = match(['/accounts/:id'], path)) && method === 'PUT') {
    requirePermission('cuentas.editar');
    const id = parseId(m);
    const userId = targetUserIdForRead(query);
    const old = get('SELECT * FROM accounts WHERE id = ? AND user_id = ?', [id, userId]);
    if (!old) throw httpError(404, 'Cuenta no encontrada.');
    run("UPDATE accounts SET name = COALESCE(?, name), type = COALESCE(?, type), bank = COALESCE(?, bank), number = COALESCE(?, number), initial_balance = COALESCE(?, initial_balance), currency = COALESCE(?, currency), status = COALESCE(?, status), allow_overdraft = COALESCE(?, allow_overdraft), description = COALESCE(?, description) WHERE id = ?", [body.name ?? null, body.type ?? null, body.bank ?? null, body.number ?? null, body.initial_balance ?? null, body.currency ?? null, body.status ?? null, body.allow_overdraft ?? null, body.description ?? null, id]);
    recomputeBalances(userId);
    const account = get(`SELECT ${accountColumns} FROM accounts WHERE id = ?`, [id]);
    logAudit(currentUser.id, 'update', 'cuentas', id, old, account);
    return { account: { ...account, allow_overdraft: !!account.allow_overdraft } };
  }
  if ((m = match(['/accounts/:id'], path)) && method === 'DELETE') {
    requirePermission('cuentas.eliminar');
    const id = parseId(m);
    const userId = targetUserIdForRead(query);
    const old = get('SELECT * FROM accounts WHERE id = ? AND user_id = ?', [id, userId]);
    if (!old) throw httpError(404, 'Cuenta no encontrada.');
    const usage = get('SELECT (SELECT COUNT(*) FROM income WHERE account_id = ?) + (SELECT COUNT(*) FROM expenses WHERE account_id = ?) + (SELECT COUNT(*) FROM transfers WHERE from_account_id = ? OR to_account_id = ?) + (SELECT COUNT(*) FROM loan_payments WHERE account_id = ?) + (SELECT COUNT(*) FROM debt_payments WHERE account_id = ?) AS c', [id, id, id, id, id, id]).c;
    if (usage > 0) throw httpError(400, 'La cuenta tiene movimientos asociados. Desactívala en lugar de eliminarla.');
    run('DELETE FROM accounts WHERE id = ?', [id]);
    logAudit(currentUser.id, 'delete', 'cuentas', id, old);
    return { message: 'Cuenta eliminada.' };
  }

  // --- Categorías ---
  if (path === '/categories' && method === 'GET') {
    requirePermission('categorias.ver');
    const type = query.type;
    const rows = all(`SELECT * FROM categories WHERE (is_global = 1 OR user_id = ?) AND (? IS NULL OR type = ?) ORDER BY type, sort_order, name`, [currentUser.id, type || null, type || null]);
    const data = rows.map((c) => {
      const subcategories = all('SELECT id, name, is_active, sort_order FROM subcategories WHERE category_id = ? ORDER BY sort_order, name', [c.id]).map((s) => ({ ...s, is_active: !!s.is_active }));
      return { ...c, is_global: !!c.is_global, is_active: !!c.is_active, subcategories };
    });
    return { data };
  }
  if (path === '/categories' && method === 'POST') {
    requirePermission('categorias.crear');
    const isGlobal = body.is_global && hasPermission('datos.globales.gestionar');
    const id = insert('INSERT INTO categories (user_id, name, type, color, icon, is_global, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?, 1, ?)', [isGlobal ? null : currentUser.id, body.name, body.type || 'expense', body.color || '#5BC0BE', body.icon || null, isGlobal ? 1 : 0, body.sort_order || 0]);
    return { category: get('SELECT * FROM categories WHERE id = ?', [id]) };
  }
  if ((m = match(['/categories/:id'], path)) && method === 'PUT') {
    requirePermission('categorias.editar');
    const id = parseId(m);
    const old = get('SELECT * FROM categories WHERE id = ?', [id]);
    if (!old) throw httpError(404, 'Categoría no encontrada.');
    run('UPDATE categories SET name = COALESCE(?, name), color = COALESCE(?, color), icon = COALESCE(?, icon), is_active = COALESCE(?, is_active), sort_order = COALESCE(?, sort_order) WHERE id = ?', [body.name ?? null, body.color ?? null, body.icon ?? null, body.is_active ?? null, body.sort_order ?? null, id]);
    logAudit(currentUser.id, 'update', 'categorias', id, old, body);
    return { category: get('SELECT * FROM categories WHERE id = ?', [id]) };
  }
  if ((m = match(['/categories/:id'], path)) && method === 'DELETE') {
    requirePermission('categorias.eliminar');
    const id = parseId(m);
    const usage = get('SELECT (SELECT COUNT(*) FROM income WHERE category_id = ?) + (SELECT COUNT(*) FROM expenses WHERE category_id = ?) AS c', [id, id]).c;
    if (usage > 0) throw httpError(400, 'La categoría tiene movimientos asociados. Desactívala en lugar de eliminarla.');
    run('DELETE FROM categories WHERE id = ?', [id]);
    return { message: 'Categoría eliminada.' };
  }
  if ((m = match(['/categories/:id/subcategories'], path)) && method === 'POST') {
    requirePermission('categorias.crear');
    const id = parseId(m);
    const sid = insert('INSERT INTO subcategories (category_id, name, sort_order) VALUES (?, ?, ?)', [id, body.name, body.sort_order || 0]);
    return { subcategory: get('SELECT * FROM subcategories WHERE id = ?', [sid]) };
  }

  // --- Ingresos ---
  if (path === '/income' && method === 'GET') {
    requirePermission('ingresos.ver');
    const userId = targetUserIdForRead(query);
    const { page, limit, offset } = buildPagination(query);
    const conditions = ['user_id = ?'];
    const params = [userId];
    if (query.from) { conditions.push('date >= ?'); params.push(query.from); }
    if (query.to) { conditions.push('date <= ?'); params.push(query.to); }
    if (query.account_id) { conditions.push('account_id = ?'); params.push(query.account_id); }
    if (query.category_id) { conditions.push('category_id = ?'); params.push(query.category_id); }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const total = get(`SELECT COUNT(*) AS c FROM income ${where}`, params).c;
    const rows = all(`SELECT i.*, a.name AS account_name, c.name AS category_name FROM income i LEFT JOIN accounts a ON a.id = i.account_id LEFT JOIN categories c ON c.id = i.category_id ${where} ORDER BY i.date DESC, i.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]).map((r) => ({ ...r, is_recurring: !!r.is_recurring }));
    return { data: rows, total, page, limit };
  }
  if (path === '/income' && method === 'POST') {
    requirePermission('ingresos.crear');
    const userId = hasPermission('datos.globales.gestionar') && body.user_id ? Number(body.user_id) : currentUser.id;
    const id = insert('INSERT INTO income (user_id, account_id, category_id, date, description, amount, income_method, income_type, is_recurring, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [userId, body.account_id, body.category_id || null, body.date, body.description || null, body.amount, body.income_method || null, body.income_type || null, body.is_recurring ? 1 : 0, body.notes || null]);
    recomputeBalances(userId);
    logAudit(currentUser.id, 'create', 'ingresos', id);
    return { income: get('SELECT * FROM income WHERE id = ?', [id]) };
  }
  if ((m = match(['/income/:id'], path)) && method === 'PUT') {
    requirePermission('ingresos.editar');
    const id = parseId(m);
    const userId = targetUserIdForRead(query);
    const old = get('SELECT * FROM income WHERE id = ? AND user_id = ?', [id, userId]);
    if (!old) throw httpError(404, 'Ingreso no encontrado.');
    run("UPDATE income SET account_id = COALESCE(?, account_id), category_id = COALESCE(?, category_id), date = COALESCE(?, date), description = COALESCE(?, description), amount = COALESCE(?, amount), income_method = COALESCE(?, income_method), income_type = COALESCE(?, income_type), is_recurring = COALESCE(?, is_recurring), notes = COALESCE(?, notes), updated_at = datetime('now') WHERE id = ?", [body.account_id ?? null, body.category_id ?? null, body.date ?? null, body.description ?? null, body.amount ?? null, body.income_method ?? null, body.income_type ?? null, body.is_recurring ?? null, body.notes ?? null, id]);
    recomputeBalances(userId);
    logAudit(currentUser.id, 'update', 'ingresos', id, old);
    return { income: get('SELECT * FROM income WHERE id = ?', [id]) };
  }
  if ((m = match(['/income/:id'], path)) && method === 'DELETE') {
    requirePermission('ingresos.eliminar');
    const id = parseId(m);
    const userId = targetUserIdForRead(query);
    run('DELETE FROM income WHERE id = ? AND user_id = ?', [id, userId]);
    recomputeBalances(userId);
    logAudit(currentUser.id, 'delete', 'ingresos', id);
    return { message: 'Ingreso eliminado.' };
  }

  // --- Gastos ---
  const expenseFilters = (query, userId, params, conditions) => {
    if (query.from) { conditions.push('date >= ?'); params.push(query.from); }
    if (query.to) { conditions.push('date <= ?'); params.push(query.to); }
    if (query.category_id) { conditions.push('category_id = ?'); params.push(query.category_id); }
    if (query.account_id) { conditions.push('account_id = ?'); params.push(query.account_id); }
    if (query.payment_method) { conditions.push('payment_method = ?'); params.push(query.payment_method); }
    if (query.min_amount) { conditions.push('amount >= ?'); params.push(query.min_amount); }
    if (query.max_amount) { conditions.push('amount <= ?'); params.push(query.max_amount); }
    if (query.search) { conditions.push('(description LIKE ? OR merchant LIKE ?)'); params.push(`%${query.search}%`, `%${query.search}%`); }
  };
  if (path === '/expenses' && method === 'GET') {
    requirePermission('gastos.ver');
    const userId = targetUserIdForRead(query);
    const { page, limit, offset } = buildPagination(query);
    const conditions = ['user_id = ?'];
    const params = [userId];
    expenseFilters(query, userId, params, conditions);
    const where = `WHERE ${conditions.join(' AND ')}`;
    const total = get(`SELECT COUNT(*) AS c FROM expenses ${where}`, params).c;
    const rows = all(`SELECT e.*, a.name AS account_name, c.name AS category_name, s.name AS subcategory_name FROM expenses e LEFT JOIN accounts a ON a.id = e.account_id LEFT JOIN categories c ON c.id = e.category_id LEFT JOIN subcategories s ON s.id = e.subcategory_id ${where} ORDER BY e.date DESC, e.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]).map((r) => ({ ...r, is_recurring: !!r.is_recurring }));
    return { data: rows, total, page, limit };
  }
  if (path === '/expenses/export' && method === 'GET') {
    requirePermission('gastos.ver');
    const userId = targetUserIdForRead(query);
    const conditions = ['user_id = ?'];
    const params = [userId];
    expenseFilters(query, userId, params, conditions);
    const where = `WHERE ${conditions.join(' AND ')}`;
    const rows = all(`SELECT e.date, e.description, c.name AS category_name, s.name AS subcategory_name, a.name AS account_name, e.payment_method, e.merchant, e.amount FROM expenses e LEFT JOIN accounts a ON a.id = e.account_id LEFT JOIN categories c ON c.id = e.category_id LEFT JOIN subcategories s ON s.id = e.subcategory_id ${where} ORDER BY e.date DESC`, params);
    const headers = [
      { key: 'date', label: 'Fecha' }, { key: 'description', label: 'Descripción' }, { key: 'category_name', label: 'Categoría' },
      { key: 'subcategory_name', label: 'Subcategoría' }, { key: 'account_name', label: 'Cuenta' }, { key: 'payment_method', label: 'Método' },
      { key: 'merchant', label: 'Comercio' }, { key: 'amount', label: 'Valor' },
    ];
    return exportBlob(query.format || 'csv', headers, rows, 'Gastos');
  }
  if (path === '/expenses' && method === 'POST') {
    requirePermission('gastos.crear');
    const userId = hasPermission('datos.globales.gestionar') && body.user_id ? Number(body.user_id) : currentUser.id;
    const id = insert('INSERT INTO expenses (user_id, account_id, category_id, subcategory_id, date, description, amount, payment_method, merchant, is_recurring, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [userId, body.account_id, body.category_id || null, body.subcategory_id || null, body.date, body.description || null, body.amount, body.payment_method || null, body.merchant || null, body.is_recurring ? 1 : 0, body.notes || null]);
    recomputeBalances(userId);
    logAudit(currentUser.id, 'create', 'gastos', id);
    return { expense: get('SELECT * FROM expenses WHERE id = ?', [id]) };
  }
  if ((m = match(['/expenses/:id'], path)) && method === 'PUT') {
    requirePermission('gastos.editar');
    const id = parseId(m);
    const userId = targetUserIdForRead(query);
    const old = get('SELECT * FROM expenses WHERE id = ? AND user_id = ?', [id, userId]);
    if (!old) throw httpError(404, 'Gasto no encontrado.');
    run("UPDATE expenses SET account_id = COALESCE(?, account_id), category_id = COALESCE(?, category_id), subcategory_id = COALESCE(?, subcategory_id), date = COALESCE(?, date), description = COALESCE(?, description), amount = COALESCE(?, amount), payment_method = COALESCE(?, payment_method), merchant = COALESCE(?, merchant), is_recurring = COALESCE(?, is_recurring), notes = COALESCE(?, notes), updated_at = datetime('now') WHERE id = ?", [body.account_id ?? null, body.category_id ?? null, body.subcategory_id ?? null, body.date ?? null, body.description ?? null, body.amount ?? null, body.payment_method ?? null, body.merchant ?? null, body.is_recurring ?? null, body.notes ?? null, id]);
    recomputeBalances(userId);
    logAudit(currentUser.id, 'update', 'gastos', id, old);
    return { expense: get('SELECT * FROM expenses WHERE id = ?', [id]) };
  }
  if ((m = match(['/expenses/:id'], path)) && method === 'DELETE') {
    requirePermission('gastos.eliminar');
    const id = parseId(m);
    const userId = targetUserIdForRead(query);
    run('DELETE FROM expenses WHERE id = ? AND user_id = ?', [id, userId]);
    recomputeBalances(userId);
    logAudit(currentUser.id, 'delete', 'gastos', id);
    return { message: 'Gasto eliminado.' };
  }

  // --- Transferencias ---
  if (path === '/transfers' && method === 'GET') {
    requirePermission('transferencias.ver');
    const userId = targetUserIdForRead(query);
    return { data: all('SELECT t.*, fa.name AS from_account_name, ta.name AS to_account_name FROM transfers t JOIN accounts fa ON fa.id = t.from_account_id JOIN accounts ta ON ta.id = t.to_account_id WHERE t.user_id = ? ORDER BY t.date DESC, t.id DESC LIMIT 200', [userId]) };
  }
  if (path === '/transfers' && method === 'POST') {
    requirePermission('transferencias.crear');
    const userId = hasPermission('datos.globales.gestionar') && body.user_id ? Number(body.user_id) : currentUser.id;
    if (body.from_account_id === body.to_account_id) throw httpError(400, 'La cuenta origen y destino deben ser diferentes.');
    ensureFunds(body.from_account_id, body.amount);
    const id = insert('INSERT INTO transfers (user_id, from_account_id, to_account_id, amount, date, description, group_id) VALUES (?, ?, ?, ?, ?, ?, ?)', [userId, body.from_account_id, body.to_account_id, body.amount, body.date, body.description || null, 't' + Date.now()]);
    recomputeBalances(userId);
    logAudit(currentUser.id, 'create', 'transferencias', id);
    return { transfer: get('SELECT * FROM transfers WHERE id = ?', [id]) };
  }
  if ((m = match(['/transfers/:id'], path)) && method === 'DELETE') {
    requirePermission('transferencias.eliminar');
    const id = parseId(m);
    const userId = targetUserIdForRead(query);
    run('DELETE FROM transfers WHERE id = ? AND user_id = ?', [id, userId]);
    recomputeBalances(userId);
    logAudit(currentUser.id, 'delete', 'transferencias', id);
    return { message: 'Transferencia eliminada.' };
  }

  // --- Movimientos ---
  const movementTypes = { income: 'Ingreso', expense: 'Gasto', transfer: 'Transferencia', loan_payment: 'Pago de préstamo', debt_payment: 'Pago de deuda' };
  if (path === '/movements' && method === 'GET') {
    requirePermission('movimientos.ver');
    const userId = targetUserIdForRead(query);
    const { page, limit, offset } = buildPagination(query);
    const rows = [];
    for (const r of all('SELECT i.id, i.date, i.description, i.amount, a.name AS account, c.name AS category FROM income i LEFT JOIN accounts a ON a.id = i.account_id LEFT JOIN categories c ON c.id = i.category_id WHERE i.user_id = ?', [userId])) rows.push({ ...r, type: 'income', type_label: 'Ingreso', status: 'completed' });
    for (const r of all('SELECT e.id, e.date, e.description, e.amount, a.name AS account, c.name AS category FROM expenses e LEFT JOIN accounts a ON a.id = e.account_id LEFT JOIN categories c ON c.id = e.category_id WHERE e.user_id = ?', [userId])) rows.push({ ...r, type: 'expense', type_label: 'Gasto', status: 'completed' });
    for (const r of all('SELECT t.id, t.date, t.description, t.amount, fa.name AS fa, ta.name AS ta FROM transfers t JOIN accounts fa ON fa.id = t.from_account_id JOIN accounts ta ON ta.id = t.to_account_id WHERE t.user_id = ?', [userId])) rows.push({ id: r.id, date: r.date, description: r.description, amount: r.amount, category: null, account: `${r.fa} -> ${r.ta}`, type: 'transfer', type_label: 'Transferencia', status: 'completed' });
    for (const r of all('SELECT lp.id, lp.date, lp.amount, l.description, a.name AS account FROM loan_payments lp JOIN loans l ON l.id = lp.loan_id LEFT JOIN accounts a ON a.id = lp.account_id WHERE l.user_id = ?', [userId])) rows.push({ ...r, category: null, type: 'loan_payment', type_label: 'Pago de préstamo', status: 'completed' });
    for (const r of all('SELECT dp.id, dp.date, dp.amount, d.concept AS description, a.name AS account FROM debt_payments dp JOIN debts d ON d.id = dp.debt_id LEFT JOIN accounts a ON a.id = dp.account_id WHERE d.user_id = ?', [userId])) rows.push({ ...r, category: null, type: 'debt_payment', type_label: 'Pago de deuda', status: 'completed' });

    let filtered = rows;
    if (query.from) filtered = filtered.filter((r) => r.date >= query.from);
    if (query.to) filtered = filtered.filter((r) => r.date <= query.to);
    if (query.type) filtered = filtered.filter((r) => r.type === query.type);
    if (query.search) { const s = query.search.toLowerCase(); filtered = filtered.filter((r) => (r.description || '').toLowerCase().includes(s) || (r.category || '').toLowerCase().includes(s)); }
    filtered.sort((a, b) => (b.date === a.date ? b.id - a.id : b.date.localeCompare(a.date)));
    const total = filtered.length;
    return { data: filtered.slice(offset, offset + limit), total, page, limit };
  }
  if (path === '/movements/export' && method === 'GET') {
    requirePermission('movimientos.ver');
    const userId = targetUserIdForRead(query);
    const headers = [
      { key: 'date', label: 'Fecha' }, { key: 'type_label', label: 'Tipo' }, { key: 'description', label: 'Descripción' },
      { key: 'category', label: 'Categoría' }, { key: 'account', label: 'Cuenta' }, { key: 'amount', label: 'Valor' }, { key: 'status', label: 'Estado' },
    ];
    const res = handle('GET', `/movements?limit=10000&${queryString}`); // reutiliza el listado
    const data = res.data.map((r) => ({ date: r.date, type_label: r.type_label, description: r.description, category: r.category, account: r.account, amount: r.amount, status: r.status }));
    return exportBlob(query.format || 'csv', headers, data, 'Movimientos');
  }

  // --- Personas ---
  if (path === '/people' && method === 'GET') {
    requirePermission('personas.ver');
    const userId = targetUserIdForRead(query);
    const search = query.search || '';
    const where = search ? 'AND full_name LIKE ?' : '';
    const params = search ? [userId, `%${search}%`] : [userId];
    return { data: all(`SELECT p.*, (SELECT COUNT(*) FROM loans WHERE person_id = p.id) AS loans_count FROM people p WHERE p.user_id = ? ${where} ORDER BY p.full_name`, params) };
  }
  if (path === '/people' && method === 'POST') {
    requirePermission('personas.crear');
    const userId = hasPermission('datos.globales.gestionar') && body.user_id ? Number(body.user_id) : currentUser.id;
    const id = insert('INSERT INTO people (user_id, full_name, phone, email, relation_type, notes, status) VALUES (?, ?, ?, ?, ?, ?, ?)', [userId, body.full_name, body.phone || null, body.email || null, body.relation_type || null, body.notes || null, body.status || 'active']);
    return { person: get('SELECT * FROM people WHERE id = ?', [id]) };
  }
  if ((m = match(['/people/:id'], path)) && method === 'PUT') {
    requirePermission('personas.editar');
    const id = parseId(m);
    const userId = targetUserIdForRead(query);
    const old = get('SELECT * FROM people WHERE id = ? AND user_id = ?', [id, userId]);
    if (!old) throw httpError(404, 'Persona no encontrada.');
    run('UPDATE people SET full_name = COALESCE(?, full_name), phone = COALESCE(?, phone), email = COALESCE(?, email), relation_type = COALESCE(?, relation_type), notes = COALESCE(?, notes), status = COALESCE(?, status) WHERE id = ?', [body.full_name ?? null, body.phone ?? null, body.email ?? null, body.relation_type ?? null, body.notes ?? null, body.status ?? null, id]);
    return { person: get('SELECT * FROM people WHERE id = ?', [id]) };
  }
  if ((m = match(['/people/:id'], path)) && method === 'DELETE') {
    requirePermission('personas.eliminar');
    const id = parseId(m);
    const userId = targetUserIdForRead(query);
    const count = get('SELECT COUNT(*) AS c FROM loans WHERE person_id = ?', [id]).c;
    if (count > 0) throw httpError(400, 'La persona tiene préstamos asociados.');
    run('DELETE FROM people WHERE id = ? AND user_id = ?', [id, userId]);
    return { message: 'Persona eliminada.' };
  }

  // --- Préstamos ---
  if (path === '/loans' && method === 'GET') {
    requirePermission('prestamos.ver');
    const userId = targetUserIdForRead(query);
    const conditions = ['l.user_id = ?'];
    const params = [userId];
    if (query.type) { conditions.push('l.type = ?'); params.push(query.type); }
    if (query.status) { conditions.push('l.status = ?'); params.push(query.status); }
    const rows = all(`${LOAN_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY l.date DESC`, params).map(summarizeLoan);
    return { data: rows };
  }
  if ((m = match(['/loans/:id'], path)) && method === 'GET') {
    requirePermission('prestamos.ver');
    const id = parseId(m);
    const userId = targetUserIdForRead(query);
    const row = get(`${LOAN_SELECT} WHERE l.id = ? AND l.user_id = ?`, [id, userId]);
    if (!row) throw httpError(404, 'Préstamo no encontrado.');
    const payments = all('SELECT lp.*, a.name AS account_name FROM loan_payments lp LEFT JOIN accounts a ON a.id = lp.account_id WHERE lp.loan_id = ? ORDER BY lp.date, lp.id', [id]);
    return { loan: summarizeLoan(row), payments };
  }
  if (path === '/loans' && method === 'POST') {
    requirePermission('prestamos.crear');
    const userId = hasPermission('datos.globales.gestionar') && body.user_id ? Number(body.user_id) : currentUser.id;
    const id = insert('INSERT INTO loans (user_id, person_id, type, amount, interest_rate, date, due_date, num_installments, periodicity, installment_amount, description, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [userId, body.person_id || null, body.type, body.amount, body.interest_rate || 0, body.date, body.due_date || null, body.num_installments || 1, body.periodicity || 'mensual', body.installment_amount || 0, body.description || null, body.status || 'pending']);
    logAudit(currentUser.id, 'create', 'prestamos', id);
    return { loan: get('SELECT * FROM loans WHERE id = ?', [id]) };
  }
  if ((m = match(['/loans/:id'], path)) && method === 'PUT') {
    requirePermission('prestamos.editar');
    const id = parseId(m);
    const userId = targetUserIdForRead(query);
    const old = get('SELECT * FROM loans WHERE id = ? AND user_id = ?', [id, userId]);
    if (!old) throw httpError(404, 'Préstamo no encontrado.');
    run("UPDATE loans SET person_id = COALESCE(?, person_id), type = COALESCE(?, type), amount = COALESCE(?, amount), interest_rate = COALESCE(?, interest_rate), date = COALESCE(?, date), due_date = COALESCE(?, due_date), num_installments = COALESCE(?, num_installments), periodicity = COALESCE(?, periodicity), installment_amount = COALESCE(?, installment_amount), description = COALESCE(?, description), status = COALESCE(?, status), updated_at = datetime('now') WHERE id = ?", [body.person_id ?? null, body.type ?? null, body.amount ?? null, body.interest_rate ?? null, body.date ?? null, body.due_date ?? null, body.num_installments ?? null, body.periodicity ?? null, body.installment_amount ?? null, body.description ?? null, body.status ?? null, id]);
    refreshLoanStatus(id);
    logAudit(currentUser.id, 'update', 'prestamos', id, old);
    return { loan: get('SELECT * FROM loans WHERE id = ?', [id]) };
  }
  if ((m = match(['/loans/:id'], path)) && method === 'DELETE') {
    requirePermission('prestamos.eliminar');
    const id = parseId(m);
    const userId = targetUserIdForRead(query);
    run('DELETE FROM loans WHERE id = ? AND user_id = ?', [id, userId]);
    recomputeBalances(userId);
    logAudit(currentUser.id, 'delete', 'prestamos', id);
    return { message: 'Préstamo eliminado.' };
  }
  if ((m = match(['/loans/:id/payments'], path)) && method === 'POST') {
    requirePermission('prestamos.editar');
    const loanId = parseId(m);
    const userId = targetUserIdForRead(query);
    const loan = get('SELECT l.*, COALESCE((SELECT SUM(principal) FROM loan_payments WHERE loan_id = l.id), 0) AS principal_paid FROM loans l WHERE l.id = ? AND l.user_id = ?', [loanId, userId]);
    if (!loan) throw httpError(404, 'Préstamo no encontrado.');
    const principal = body.principal ?? body.amount;
    const pending = Math.max(0, loan.amount - loan.principal_paid);
    if (principal > pending + 0.001) throw httpError(400, 'El pago supera el saldo pendiente del préstamo.');
    const id = insert('INSERT INTO loan_payments (loan_id, account_id, date, amount, installment_number, principal, interest, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [loanId, body.account_id || null, body.date, body.amount, body.installment_number || null, principal, body.interest || 0, body.notes || null]);
    recomputeBalances(userId);
    refreshLoanStatus(loanId);
    logAudit(currentUser.id, 'create_payment', 'prestamos', loanId);
    return { payment: get('SELECT * FROM loan_payments WHERE id = ?', [id]) };
  }
  if ((m = match(['/loans/:id/payments/:paymentId'], path)) && method === 'DELETE') {
    requirePermission('prestamos.editar');
    const loanId = parseId(m);
    const paymentId = Number(m.paymentId);
    const userId = targetUserIdForRead(query);
    run('DELETE FROM loan_payments WHERE id = ? AND loan_id = ?', [paymentId, loanId]);
    recomputeBalances(userId);
    refreshLoanStatus(loanId);
    logAudit(currentUser.id, 'delete_payment', 'prestamos', loanId);
    return { message: 'Pago eliminado.' };
  }

  // --- Deudas ---
  if (path === '/debts' && method === 'GET') {
    requirePermission('deudas.ver');
    const userId = targetUserIdForRead(query);
    const rows = all(`SELECT d.*, COALESCE((SELECT SUM(amount) FROM debt_payments WHERE debt_id = d.id), 0) AS paid, (SELECT COUNT(*) FROM debt_payments WHERE debt_id = d.id) AS payments_count FROM debts d WHERE d.user_id = ? ORDER BY d.due_date ASC`, [userId]).map(summarizeDebt);
    return { data: rows };
  }
  if ((m = match(['/debts/:id'], path)) && method === 'GET') {
    requirePermission('deudas.ver');
    const id = parseId(m);
    const userId = targetUserIdForRead(query);
    const row = get('SELECT d.*, COALESCE((SELECT SUM(amount) FROM debt_payments WHERE debt_id = d.id), 0) AS paid FROM debts d WHERE d.id = ? AND d.user_id = ?', [id, userId]);
    if (!row) throw httpError(404, 'Deuda no encontrada.');
    const payments = all('SELECT dp.*, a.name AS account_name FROM debt_payments dp LEFT JOIN accounts a ON a.id = dp.account_id WHERE dp.debt_id = ? ORDER BY dp.date, dp.id', [id]);
    return { debt: summarizeDebt(row), payments };
  }
  if (path === '/debts' && method === 'POST') {
    requirePermission('deudas.crear');
    const userId = hasPermission('datos.globales.gestionar') && body.user_id ? Number(body.user_id) : currentUser.id;
    const id = insert('INSERT INTO debts (user_id, creditor, concept, amount, start_date, due_date, interest_rate, num_installments, installment_amount, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [userId, body.creditor, body.concept || null, body.amount, body.start_date, body.due_date || null, body.interest_rate || 0, body.num_installments || 1, body.installment_amount || 0, body.status || 'pending']);
    logAudit(currentUser.id, 'create', 'deudas', id);
    return { debt: get('SELECT * FROM debts WHERE id = ?', [id]) };
  }
  if ((m = match(['/debts/:id'], path)) && method === 'PUT') {
    requirePermission('deudas.editar');
    const id = parseId(m);
    const userId = targetUserIdForRead(query);
    const old = get('SELECT * FROM debts WHERE id = ? AND user_id = ?', [id, userId]);
    if (!old) throw httpError(404, 'Deuda no encontrada.');
    run("UPDATE debts SET creditor = COALESCE(?, creditor), concept = COALESCE(?, concept), amount = COALESCE(?, amount), start_date = COALESCE(?, start_date), due_date = COALESCE(?, due_date), interest_rate = COALESCE(?, interest_rate), num_installments = COALESCE(?, num_installments), installment_amount = COALESCE(?, installment_amount), status = COALESCE(?, status), updated_at = datetime('now') WHERE id = ?", [body.creditor ?? null, body.concept ?? null, body.amount ?? null, body.start_date ?? null, body.due_date ?? null, body.interest_rate ?? null, body.num_installments ?? null, body.installment_amount ?? null, body.status ?? null, id]);
    refreshDebtStatus(id);
    logAudit(currentUser.id, 'update', 'deudas', id, old);
    return { debt: get('SELECT * FROM debts WHERE id = ?', [id]) };
  }
  if ((m = match(['/debts/:id'], path)) && method === 'DELETE') {
    requirePermission('deudas.eliminar');
    const id = parseId(m);
    const userId = targetUserIdForRead(query);
    run('DELETE FROM debts WHERE id = ? AND user_id = ?', [id, userId]);
    recomputeBalances(userId);
    logAudit(currentUser.id, 'delete', 'deudas', id);
    return { message: 'Deuda eliminada.' };
  }
  if ((m = match(['/debts/:id/payments'], path)) && method === 'POST') {
    requirePermission('deudas.editar');
    const debtId = parseId(m);
    const userId = targetUserIdForRead(query);
    const debt = get('SELECT d.*, COALESCE((SELECT SUM(amount) FROM debt_payments WHERE debt_id = d.id), 0) AS paid FROM debts d WHERE d.id = ? AND d.user_id = ?', [debtId, userId]);
    if (!debt) throw httpError(404, 'Deuda no encontrada.');
    const pending = Math.max(0, debt.amount - debt.paid);
    if (body.amount > pending + 0.001) throw httpError(400, 'El pago supera el saldo pendiente de la deuda.');
    const id = insert('INSERT INTO debt_payments (debt_id, account_id, date, amount, notes) VALUES (?, ?, ?, ?, ?)', [debtId, body.account_id || null, body.date, body.amount, body.notes || null]);
    recomputeBalances(userId);
    refreshDebtStatus(debtId);
    logAudit(currentUser.id, 'create_payment', 'deudas', debtId);
    return { payment: get('SELECT * FROM debt_payments WHERE id = ?', [id]) };
  }
  if ((m = match(['/debts/:id/payments/:paymentId'], path)) && method === 'DELETE') {
    requirePermission('deudas.editar');
    const debtId = parseId(m);
    const paymentId = Number(m.paymentId);
    const userId = targetUserIdForRead(query);
    run('DELETE FROM debt_payments WHERE id = ? AND debt_id = ?', [paymentId, debtId]);
    recomputeBalances(userId);
    refreshDebtStatus(debtId);
    logAudit(currentUser.id, 'delete_payment', 'deudas', debtId);
    return { message: 'Pago eliminado.' };
  }

  // --- Presupuestos ---
  const budgetSelect = `SELECT b.*, c.name AS category_name, c.color AS category_color, COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.category_id = b.category_id AND e.user_id = b.user_id AND e.date >= b.period AND e.date < date(b.period, '+1 month')), 0) AS spent FROM budgets b JOIN categories c ON c.id = b.category_id`;
  const summarizeBudget = (b) => {
    const spent = round2(b.spent || 0);
    const amount = Number(b.amount);
    const available = round2(amount - spent);
    const percent = amount > 0 ? round2((spent / amount) * 100) : 0;
    return { ...b, spent, available, percent };
  };
  if (path === '/budgets' && method === 'GET') {
    requirePermission('presupuestos.ver');
    const userId = targetUserIdForRead(query);
    const period = query.period || monthFirst();
    return { data: all(`${budgetSelect} WHERE b.user_id = ? AND b.period = ? ORDER BY c.name`, [userId, period]).map(summarizeBudget) };
  }
  if (path === '/budgets/history' && method === 'GET') {
    requirePermission('presupuestos.ver');
    const userId = targetUserIdForRead(query);
    const rows = all(`${budgetSelect} WHERE b.user_id = ? ORDER BY b.period DESC LIMIT 24`, [userId]).map(summarizeBudget);
    return { data: rows };
  }
  if (path === '/budgets' && method === 'POST') {
    requirePermission('presupuestos.crear');
    const userId = hasPermission('datos.globales.gestionar') && body.user_id ? Number(body.user_id) : currentUser.id;
    const exists = get('SELECT id FROM budgets WHERE user_id = ? AND category_id = ? AND period = ?', [userId, body.category_id, body.period]);
    let id;
    if (exists) { run('UPDATE budgets SET amount = ? WHERE id = ?', [body.amount, exists.id]); id = exists.id; }
    else { id = insert('INSERT INTO budgets (user_id, category_id, period, amount) VALUES (?, ?, ?, ?)', [userId, body.category_id, body.period, body.amount]); }
    return { budget: get('SELECT * FROM budgets WHERE id = ?', [id]) };
  }
  if ((m = match(['/budgets/:id'], path)) && method === 'PUT') {
    requirePermission('presupuestos.editar');
    const id = parseId(m);
    const userId = targetUserIdForRead(query);
    run('UPDATE budgets SET amount = COALESCE(?, amount) WHERE id = ? AND user_id = ?', [body.amount ?? null, id, userId]);
    return { budget: get('SELECT * FROM budgets WHERE id = ?', [id]) };
  }
  if ((m = match(['/budgets/:id'], path)) && method === 'DELETE') {
    requirePermission('presupuestos.eliminar');
    const id = parseId(m);
    const userId = targetUserIdForRead(query);
    run('DELETE FROM budgets WHERE id = ? AND user_id = ?', [id, userId]);
    return { message: 'Presupuesto eliminado.' };
  }

  // --- Recurrentes ---
  if (path === '/recurring' && method === 'GET') {
    requirePermission('recurrentes.ver');
    const userId = targetUserIdForRead(query);
    return { data: all('SELECT r.*, c.name AS category_name, a.name AS account_name FROM recurring_expenses r LEFT JOIN categories c ON c.id = r.category_id LEFT JOIN accounts a ON a.id = r.account_id WHERE r.user_id = ? ORDER BY r.next_due_date ASC', [userId]) };
  }
  if (path === '/recurring' && method === 'POST') {
    requirePermission('recurrentes.crear');
    const userId = hasPermission('datos.globales.gestionar') && body.user_id ? Number(body.user_id) : currentUser.id;
    const id = insert('INSERT INTO recurring_expenses (user_id, name, amount, category_id, account_id, frequency, next_due_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [userId, body.name, body.amount, body.category_id || null, body.account_id || null, body.frequency, body.next_due_date || null, body.end_date || null, body.status || 'active']);
    return { recurring: get('SELECT * FROM recurring_expenses WHERE id = ?', [id]) };
  }
  if ((m = match(['/recurring/:id'], path)) && method === 'PUT') {
    requirePermission('recurrentes.editar');
    const id = parseId(m);
    const userId = targetUserIdForRead(query);
    const old = get('SELECT * FROM recurring_expenses WHERE id = ? AND user_id = ?', [id, userId]);
    if (!old) throw httpError(404, 'Gasto recurrente no encontrado.');
    run('UPDATE recurring_expenses SET name = COALESCE(?, name), amount = COALESCE(?, amount), category_id = COALESCE(?, category_id), account_id = COALESCE(?, account_id), frequency = COALESCE(?, frequency), next_due_date = COALESCE(?, next_due_date), end_date = COALESCE(?, end_date), status = COALESCE(?, status) WHERE id = ?', [body.name ?? null, body.amount ?? null, body.category_id ?? null, body.account_id ?? null, body.frequency ?? null, body.next_due_date ?? null, body.end_date ?? null, body.status ?? null, id]);
    return { recurring: get('SELECT * FROM recurring_expenses WHERE id = ?', [id]) };
  }
  if ((m = match(['/recurring/:id'], path)) && method === 'DELETE') {
    requirePermission('recurrentes.eliminar');
    const id = parseId(m);
    const userId = targetUserIdForRead(query);
    run('DELETE FROM recurring_expenses WHERE id = ? AND user_id = ?', [id, userId]);
    return { message: 'Gasto recurrente eliminado.' };
  }
  if ((m = match(['/recurring/:id/generate'], path)) && method === 'POST') {
    requirePermission('recurrentes.editar');
    const id = parseId(m);
    const userId = targetUserIdForRead(query);
    const r = get('SELECT * FROM recurring_expenses WHERE id = ? AND user_id = ?', [id, userId]);
    if (!r) throw httpError(404, 'Gasto recurrente no encontrado.');
    const expenseId = insert("INSERT INTO expenses (user_id, account_id, category_id, date, description, amount, payment_method, is_recurring, notes) VALUES (?, ?, ?, ?, ?, ?, 'Automático', 1, 'Generado desde gasto recurrente')", [userId, r.account_id, r.category_id, r.next_due_date, r.name, r.amount]);
    let next = r.next_due_date;
    const d = new Date(`${next}T00:00:00`);
    const freq = { daily: 1, weekly: 7, biweekly: 15, monthly: 1, quarterly: 3, yearly: 1 };
    if (r.frequency === 'monthly') d.setMonth(d.getMonth() + 1);
    else if (r.frequency === 'quarterly') d.setMonth(d.getMonth() + 3);
    else if (r.frequency === 'yearly') d.setFullYear(d.getFullYear() + 1);
    else d.setDate(d.getDate() + (freq[r.frequency] || 1));
    next = d.toISOString().slice(0, 10);
    const finished = r.end_date && next > r.end_date;
    run('UPDATE recurring_expenses SET next_due_date = ?, status = ? WHERE id = ?', [finished ? null : next, finished ? 'finished' : 'active', id]);
    recomputeBalances(userId);
    return { expense: get('SELECT * FROM expenses WHERE id = ?', [expenseId]) };
  }

  // --- Dashboard ---
  if (path === '/dashboard' && method === 'GET') { requirePermission('dashboard.ver'); return dashboard(query); }
  if (path === '/dashboard/calendar' && method === 'GET') { requirePermission('dashboard.ver'); return calendar(query); }

  // --- Reportes ---
  if (path === '/reports/monthly' && method === 'GET') {
    requirePermission('reportes.ver');
    const userId = targetUserIdForRead(query);
    const year = Number(query.year || new Date().getFullYear());
    const month = Number(query.month || new Date().getMonth() + 1);
    const lastDay = new Date(year, month, 0).getDate();
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const totals = get('SELECT (SELECT COALESCE(SUM(amount),0) FROM income WHERE user_id = ? AND date BETWEEN ? AND ?) AS income, (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE user_id = ? AND date BETWEEN ? AND ?) AS expense', [userId, start, end, userId, start, end]);
    const expenseByCat = all('SELECT c.name, c.color, SUM(e.amount) AS total, COUNT(*) AS count FROM expenses e JOIN categories c ON c.id = e.category_id WHERE e.user_id = ? AND e.date BETWEEN ? AND ? GROUP BY c.id ORDER BY total DESC', [userId, start, end]);
    const incomeByCat = all('SELECT c.name, c.color, SUM(i.amount) AS total, COUNT(*) AS count FROM income i JOIN categories c ON c.id = i.category_id WHERE i.user_id = ? AND i.date BETWEEN ? AND ? GROUP BY c.id ORDER BY total DESC', [userId, start, end]);
    return { year, month, totals: { income: round2(totals.income), expense: round2(totals.expense), balance: round2(totals.income - totals.expense) }, expense_by_category: expenseByCat.map((r) => ({ ...r, total: round2(r.total) })), income_by_category: incomeByCat.map((r) => ({ ...r, total: round2(r.total) })) };
  }
  if (path === '/reports/annual' && method === 'GET') {
    requirePermission('reportes.ver');
    const userId = targetUserIdForRead(query);
    const year = Number(query.year || new Date().getFullYear());
    const data = [];
    for (let m = 1; m <= 12; m++) {
      const lastDay = new Date(year, m, 0).getDate();
      const start = `${year}-${String(m).padStart(2, '0')}-01`;
      const end = `${year}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      const t = get('SELECT (SELECT COALESCE(SUM(amount),0) FROM income WHERE user_id = ? AND date BETWEEN ? AND ?) AS income, (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE user_id = ? AND date BETWEEN ? AND ?) AS expense', [userId, start, end, userId, start, end]);
      data.push({ month: m, income: round2(t.income), expense: round2(t.expense), balance: round2(t.income - t.expense) });
    }
    return { year, data };
  }
  if (path === '/reports/loans' && method === 'GET') {
    requirePermission('reportes.ver');
    const userId = targetUserIdForRead(query);
    const by_type_status = all('SELECT l.type, l.status, COUNT(*) AS count, COALESCE(SUM(l.amount),0) AS total, COALESCE(SUM((SELECT SUM(amount) FROM loan_payments WHERE loan_id = l.id)),0) AS recovered FROM loans l WHERE l.user_id = ? GROUP BY l.type, l.status', [userId]).map((r) => ({ ...r, total: round2(r.total), recovered: round2(r.recovered) }));
    const active = get("SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS total, COALESCE(SUM(MAX(0, amount - COALESCE((SELECT SUM(principal) FROM loan_payments WHERE loan_id = loans.id),0))),0) AS pending FROM loans WHERE user_id = ? AND status NOT IN ('paid','cancelled')", [userId]);
    return { by_type_status, active_summary: { count: active.count, total: round2(active.total), pending: round2(active.pending) } };
  }
  if (path === '/reports/debts' && method === 'GET') {
    requirePermission('reportes.ver');
    const userId = targetUserIdForRead(query);
    const by_status = all('SELECT d.status, COUNT(*) AS count, COALESCE(SUM(d.amount),0) AS total, COALESCE(SUM((SELECT SUM(amount) FROM debt_payments WHERE debt_id = d.id)),0) AS paid FROM debts d WHERE d.user_id = ? GROUP BY d.status', [userId]).map((r) => ({ ...r, total: round2(r.total), paid: round2(r.paid) }));
    const upcoming = all("SELECT id, creditor, concept, due_date, amount, MAX(0, amount - COALESCE((SELECT SUM(amount) FROM debt_payments WHERE debt_id = debts.id),0)) AS pending FROM debts WHERE user_id = ? AND status NOT IN ('paid','cancelled') AND due_date IS NOT NULL ORDER BY due_date LIMIT 50", [userId]).map((r) => ({ ...r, amount: round2(r.amount), pending: round2(r.pending) }));
    return { by_status, upcoming };
  }
  if (path === '/reports/categories' && method === 'GET') {
    requirePermission('reportes.ver');
    const userId = targetUserIdForRead(query);
    const from = query.from || '1900-01-01';
    const to = query.to || '2999-12-31';
    const data = all("SELECT c.name, c.color, c.type, COALESCE(SUM(e.amount),0) AS total, COUNT(e.id) AS count FROM categories c LEFT JOIN expenses e ON e.category_id = c.id AND e.user_id = ? AND e.date BETWEEN ? AND ? WHERE (c.is_global = 1 OR c.user_id = ?) AND c.type = 'expense' GROUP BY c.id ORDER BY total DESC", [userId, from, to, userId]).map((r) => ({ ...r, total: round2(r.total) }));
    return { data };
  }
  if (path === '/reports/export' && method === 'GET') {
    requirePermission('reportes.ver');
    const userId = targetUserIdForRead(query);
    const type = query.type || 'monthly';
    const format = query.format || 'csv';
    const year = Number(query.year || new Date().getFullYear());
    const month = Number(query.month || new Date().getMonth() + 1);
    let headers = [];
    let rows = [];
    let title = 'Reporte';
    if (type === 'annual') {
      const res = handle('GET', `/reports/annual?year=${year}`);
      headers = [{ key: 'month', label: 'Mes' }, { key: 'income', label: 'Ingresos' }, { key: 'expense', label: 'Gastos' }, { key: 'balance', label: 'Balance' }];
      rows = res.data.map((r) => ({ month: r.month, income: r.income, expense: r.expense, balance: r.balance }));
      title = `Reporte anual ${year}`;
    } else if (type === 'categories') {
      const res = handle('GET', '/reports/categories');
      headers = [{ key: 'name', label: 'Categoría' }, { key: 'total', label: 'Total gastado' }, { key: 'count', label: 'Movimientos' }];
      rows = res.data;
      title = 'Reporte por categorías';
    } else {
      const res = handle('GET', `/reports/monthly?year=${year}&month=${month}`);
      headers = [{ key: 'name', label: 'Categoría' }, { key: 'total', label: 'Total gastado' }, { key: 'count', label: 'Movimientos' }];
      rows = res.expense_by_category;
      title = `Reporte mensual ${year}-${month}`;
    }
    return exportBlob(format, headers, rows, title);
  }

  // --- Notificaciones ---
  if (path === '/notifications' && method === 'GET') {
    requirePermission('notificaciones.ver');
    const data = all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100', [currentUser.id]).map((n) => ({ ...n, is_read: !!n.is_read }));
    const unread = get('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0', [currentUser.id]).c;
    return { data, unread };
  }
  if (path === '/notifications/refresh' && method === 'POST') {
    requirePermission('notificaciones.ver');
    generateNotifications(currentUser.id);
    const data = all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100', [currentUser.id]).map((n) => ({ ...n, is_read: !!n.is_read }));
    const unread = get('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0', [currentUser.id]).c;
    return { data, unread };
  }
  if (path === '/notifications/read-all' && method === 'POST') {
    requirePermission('notificaciones.ver');
    run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [currentUser.id]);
    return { message: 'Todas las notificaciones marcadas como leídas.' };
  }
  if ((m = match(['/notifications/:id/read'], path)) && method === 'POST') {
    requirePermission('notificaciones.ver');
    run('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [parseId(m), currentUser.id]);
    return { message: 'Notificación marcada como leída.' };
  }
  if (path === '/notifications/preferences' && method === 'GET') {
    requirePermission('notificaciones.ver');
    const rows = all('SELECT type, enabled FROM notification_preferences WHERE user_id = ?', [currentUser.id]);
    const map = {};
    for (const r of rows) map[r.type] = !!r.enabled;
    const types = ['cuota_por_vencer', 'deuda_vencida', 'presupuesto_excedido', 'gasto_recurrente', 'saldo_bajo', 'pago_pendiente'];
    return { preferences: types.map((t) => ({ type: t, enabled: map[t] ?? true })) };
  }
  if (path === '/notifications/preferences' && method === 'PUT') {
    requirePermission('notificaciones.ver');
    for (const p of body.preferences || []) {
      run('INSERT INTO notification_preferences (user_id, type, enabled) VALUES (?, ?, ?)', [currentUser.id, p.type, p.enabled ? 1 : 0]);
    }
    return { message: 'Preferencias actualizadas.' };
  }

  // --- Auditoría ---
  if (path === '/audit' && method === 'GET') {
    requirePermission('auditoria.ver');
    const { page, limit, offset } = buildPagination(query);
    const conditions = [];
    const params = [];
    if (query.module) { conditions.push('a.module = ?'); params.push(query.module); }
    if (query.action) { conditions.push('a.action = ?'); params.push(query.action); }
    if (query.from) { conditions.push('a.created_at >= ?'); params.push(query.from); }
    if (query.to) { conditions.push('a.created_at <= ?'); params.push(query.to); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const total = get(`SELECT COUNT(*) AS c FROM audit_logs a ${where}`, params).c;
    const rows = all(`SELECT a.*, u.full_name AS user_name, u.email AS user_email FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id ${where} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
    return { data: rows, total, page, limit };
  }

  throw httpError(404, 'Ruta no encontrada.');
}

function generateNotifications(userId) {
  run("DELETE FROM notifications WHERE user_id = ? AND created_at >= date('now')", [userId]);
  const push = (type, title, message, link) => run('INSERT INTO notifications (user_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)', [userId, type, title, message, link]);
  const budgets = all('SELECT b.*, c.name AS category_name, COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.category_id = b.category_id AND e.user_id = b.user_id AND e.date >= b.period AND e.date < date(b.period, \'+1 month\')), 0) AS spent FROM budgets b JOIN categories c ON c.id = b.category_id WHERE b.user_id = ? AND b.period = ?', [userId, monthFirst()]);
  for (const b of budgets) {
    const pct = b.amount > 0 ? (b.spent / b.amount) * 100 : 0;
    if (pct >= 100) push('presupuesto_excedido', 'Presupuesto superado', `El presupuesto de ${b.category_name} fue superado (${pct.toFixed(0)}%).`, '/presupuestos');
    else if (pct >= 90) push('presupuesto_excedido', 'Presupuesto casi agotado', `El presupuesto de ${b.category_name} está al ${pct.toFixed(0)}%.`, '/presupuestos');
  }
  const debts = all("SELECT id, creditor, due_date FROM debts WHERE user_id = ? AND status NOT IN ('paid','cancelled') AND due_date IS NOT NULL AND due_date <= ?", [userId, addDays(today(), 7)]);
  for (const d of debts) push('deuda_vencida', d.due_date < today() ? 'Deuda vencida' : 'Deuda por vencer', `${d.creditor} vence el ${d.due_date}.`, '/deudas');
  const loans = all("SELECT id, type, due_date FROM loans WHERE user_id = ? AND status NOT IN ('paid','cancelled') AND due_date IS NOT NULL AND due_date <= ?", [userId, addDays(today(), 7)]);
  for (const l of loans) push('cuota_por_vencer', l.due_date < today() ? 'Préstamo vencido' : 'Préstamo por vencer', `Préstamo ${l.type === 'lent' ? 'por cobrar' : 'por pagar'} vence el ${l.due_date}.`, '/prestamos');
  const low = all("SELECT name FROM accounts WHERE user_id = ? AND status = 'active' AND current_balance < 50000", [userId]);
  for (const a of low) push('saldo_bajo', 'Saldo bajo', `La cuenta ${a.name} tiene saldo bajo.`, '/cuentas');
  const rec = all("SELECT name, next_due_date FROM recurring_expenses WHERE user_id = ? AND status = 'active' AND next_due_date IS NOT NULL AND next_due_date <= ?", [userId, addDays(today(), 7)]);
  for (const r of rec) push('gasto_recurrente', 'Gasto recurrente próximo', `${r.name} se cobrará el ${r.next_due_date}.`, '/recurrentes');
}

const CATALOGS = {
  account_types: ['Cuenta bancaria', 'Cuenta de ahorros', 'Cuenta corriente', 'Efectivo', 'Billetera digital', 'Tarjeta de crédito', 'Otro'],
  payment_methods: ['Efectivo', 'Débito', 'Tarjeta de crédito', 'Transferencia', 'Consignación', 'Cheque', 'Otro'],
  income_types: ['Salario', 'Freelance', 'Negocio', 'Venta', 'Intereses', 'Transferencia', 'Regalo', 'Otro'],
  income_methods: ['Consignación', 'Transferencia', 'Efectivo', 'Cheque', 'Otro'],
  loan_statuses: ['pending', 'active', 'partially_paid', 'paid', 'overdue', 'cancelled'],
  debt_statuses: ['pending', 'active', 'partially_paid', 'paid', 'overdue', 'cancelled'],
  periodicity: ['diaria', 'semanal', 'quincenal', 'mensual', 'bimestral', 'trimestral', 'anual'],
  recurring_frequencies: ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'],
  currencies: ['COP', 'USD', 'EUR', 'MXN', 'ARS', 'CLP', 'PEN'],
  relation_types: ['Amigo', 'Familiar', 'Compañero', 'Entidad', 'Otro'],
};

const STATUS_LABELS = {
  loan: { pending: 'Pendiente', active: 'Activo', partially_paid: 'Pagado parcialmente', paid: 'Pagado', overdue: 'Vencido', cancelled: 'Cancelado' },
  debt: { pending: 'Pendiente', active: 'Activo', partially_paid: 'Pagado parcialmente', paid: 'Pagado', overdue: 'Vencido', cancelled: 'Cancelado' },
};

export function getCurrentUser() {
  return currentUser;
}

export function setCurrentUser(user) {
  currentUser = user;
}
