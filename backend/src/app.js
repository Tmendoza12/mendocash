import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimit.js';

import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import roleRoutes from './routes/role.routes.js';
import permissionRoutes from './routes/permission.routes.js';
import accountRoutes from './routes/account.routes.js';
import categoryRoutes from './routes/category.routes.js';
import incomeRoutes from './routes/income.routes.js';
import expenseRoutes from './routes/expense.routes.js';
import transferRoutes from './routes/transfer.routes.js';
import movementRoutes from './routes/movement.routes.js';
import personRoutes from './routes/person.routes.js';
import loanRoutes from './routes/loan.routes.js';
import debtRoutes from './routes/debt.routes.js';
import budgetRoutes from './routes/budget.routes.js';
import recurringRoutes from './routes/recurring.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import reportRoutes from './routes/report.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import auditRoutes from './routes/audit.routes.js';
import settingRoutes from './routes/setting.routes.js';

const app = express();

app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
app.use(
  cors({
    origin: env.nodeEnv === 'development' ? true : env.clientOrigin,
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
if (env.nodeEnv === 'development') app.use(morgan('dev'));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api', apiLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/income', incomeRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/movements', movementRoutes);
app.use('/api/people', personRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/debts', debtRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/recurring', recurringRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/settings', settingRoutes);

// Servir el frontend compilado (login + app) desde el mismo backend.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(__dirname, '../../frontend/dist');
app.use(express.static(frontendDist));
app.get('/', (req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
app.get('/app.html', (req, res) => res.sendFile(path.join(frontendDist, 'app.html')));

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
