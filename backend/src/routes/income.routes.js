import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { validate } from '../middleware/errorHandler.js';
import {
  listIncome, getIncome, createIncome, updateIncome, removeIncome,
} from '../controllers/income.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('ingresos.ver'), listIncome);
router.get('/:id', requirePermission('ingresos.ver'), getIncome);

router.post(
  '/',
  requirePermission('ingresos.crear'),
  body('account_id').isInt().withMessage('Cuenta inválida.'),
  body('amount').isFloat({ gt: 0 }).withMessage('El valor debe ser mayor que cero.'),
  body('date').notEmpty().withMessage('La fecha es obligatoria.'),
  validate,
  createIncome
);

router.put(
  '/:id',
  requirePermission('ingresos.editar'),
  body('amount').optional().isFloat({ gt: 0 }),
  validate,
  updateIncome
);

router.delete('/:id', requirePermission('ingresos.eliminar'), removeIncome);

export default router;
