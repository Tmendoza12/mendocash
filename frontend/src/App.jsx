import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/layout/Layout.jsx';
import { Loading } from './components/ui/Misc.jsx';

import Login from './pages/Login.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Accounts from './pages/Accounts.jsx';
import Income from './pages/Income.jsx';
import Expenses from './pages/Expenses.jsx';
import Transfers from './pages/Transfers.jsx';
import Movements from './pages/Movements.jsx';
import Categories from './pages/Categories.jsx';
import Budgets from './pages/Budgets.jsx';
import Recurring from './pages/Recurring.jsx';
import Loans from './pages/Loans.jsx';
import People from './pages/People.jsx';
import Debts from './pages/Debts.jsx';
import Reports from './pages/Reports.jsx';
import CalendarPage from './pages/CalendarPage.jsx';
import Users from './pages/Users.jsx';
import Roles from './pages/Roles.jsx';
import Audit from './pages/Audit.jsx';
import Settings from './pages/Settings.jsx';
import Profile from './pages/Profile.jsx';

function Protected({ children, permission }) {
  const { user, loading, hasPermission } = useAuth();
  if (loading) return <Loading />;
  if (!user) {
    window.location.replace('/');
    return null;
  }
  if (permission && !hasPermission(permission)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route element={<Protected><Layout /></Protected>}>
        <Route index element={<Protected permission="dashboard.ver"><Dashboard /></Protected>} />
        <Route path="cuentas" element={<Protected permission="cuentas.ver"><Accounts /></Protected>} />
        <Route path="ingresos" element={<Protected permission="ingresos.ver"><Income /></Protected>} />
        <Route path="gastos" element={<Protected permission="gastos.ver"><Expenses /></Protected>} />
        <Route path="transferencias" element={<Protected permission="transferencias.ver"><Transfers /></Protected>} />
        <Route path="movimientos" element={<Protected permission="movimientos.ver"><Movements /></Protected>} />
        <Route path="categorias" element={<Protected permission="categorias.ver"><Categories /></Protected>} />
        <Route path="presupuestos" element={<Protected permission="presupuestos.ver"><Budgets /></Protected>} />
        <Route path="recurrentes" element={<Protected permission="recurrentes.ver"><Recurring /></Protected>} />
        <Route path="prestamos" element={<Protected permission="prestamos.ver"><Loans /></Protected>} />
        <Route path="personas" element={<Protected permission="personas.ver"><People /></Protected>} />
        <Route path="deudas" element={<Protected permission="deudas.ver"><Debts /></Protected>} />
        <Route path="reportes" element={<Protected permission="reportes.ver"><Reports /></Protected>} />
        <Route path="calendario" element={<Protected permission="dashboard.ver"><CalendarPage /></Protected>} />
        <Route path="usuarios" element={<Protected permission="usuarios.ver"><Users /></Protected>} />
        <Route path="roles" element={<Protected permission="roles.ver"><Roles /></Protected>} />
        <Route path="auditoria" element={<Protected permission="auditoria.ver"><Audit /></Protected>} />
        <Route path="configuracion" element={<Protected permission="configuracion.ver"><Settings /></Protected>} />
        <Route path="perfil" element={<Protected><Profile /></Protected>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
