import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { validate } from '../middleware/errorHandler.js';
import {
  listDebts, getDebt, createDebt, updateDebt, removeDebt, createDebtPayment, removeDebtPayment,
} from '../controllers/debt.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('deudas.ver'), listDebts);
router.get('/:id', requirePermission('deudas.ver'), getDebt);

router.post(
  '/',
  requirePermission('deudas.crear'),
  body('creditor').notEmpty().withMessage('El acreedor es obligatorio.'),
  body('amount').isFloat({ gt: 0 }).withMessage('El valor debe ser mayor que cero.'),
  body('start_date').notEmpty(),
  validate,
  createDebt
);

router.put('/:id', requirePermission('deudas.editar'), body('amount').optional().isFloat({ gt: 0 }), validate, updateDebt);
router.delete('/:id', requirePermission('deudas.eliminar'), removeDebt);

router.post(
  '/:id/payments',
  requirePermission('deudas.editar'),
  body('amount').isFloat({ gt: 0 }),
  body('date').notEmpty(),
  validate,
  createDebtPayment
);
router.delete('/:id/payments/:paymentId', requirePermission('deudas.editar'), removeDebtPayment);

export default router;
