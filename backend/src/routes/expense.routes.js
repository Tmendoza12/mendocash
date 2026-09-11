import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { validate } from '../middleware/errorHandler.js';
import {
  listExpenses, getExpense, createExpense, updateExpense, removeExpense, exportExpenses,
} from '../controllers/expense.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('gastos.ver'), listExpenses);
router.get('/export', requirePermission('gastos.ver'), exportExpenses);
router.get('/:id', requirePermission('gastos.ver'), getExpense);

router.post(
  '/',
  requirePermission('gastos.crear'),
  body('account_id').isInt().withMessage('Cuenta inválida.'),
  body('amount').isFloat({ gt: 0 }).withMessage('El valor debe ser mayor que cero.'),
  body('date').notEmpty().withMessage('La fecha es obligatoria.'),
  validate,
  createExpense
);

router.put(
  '/:id',
  requirePermission('gastos.editar'),
  body('amount').optional().isFloat({ gt: 0 }),
  validate,
  updateExpense
);

router.delete('/:id', requirePermission('gastos.eliminar'), removeExpense);

export default router;
