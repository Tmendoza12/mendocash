import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { validate } from '../middleware/errorHandler.js';
import {
  listLoans, getLoan, createLoan, updateLoan, removeLoan,
  listLoanPayments, createLoanPayment, removeLoanPayment,
} from '../controllers/loan.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('prestamos.ver'), listLoans);
router.get('/:id', requirePermission('prestamos.ver'), getLoan);

router.post(
  '/',
  requirePermission('prestamos.crear'),
  body('type').isIn(['lent', 'borrowed']).withMessage('Tipo inválido.'),
  body('amount').isFloat({ gt: 0 }).withMessage('El valor debe ser mayor que cero.'),
  body('date').notEmpty(),
  body('num_installments').isInt({ min: 1 }),
  validate,
  createLoan
);

router.put('/:id', requirePermission('prestamos.editar'), body('amount').optional().isFloat({ gt: 0 }), validate, updateLoan);
router.delete('/:id', requirePermission('prestamos.eliminar'), removeLoan);

router.get('/:id/payments', requirePermission('prestamos.ver'), listLoanPayments);
router.post(
  '/:id/payments',
  requirePermission('prestamos.editar'),
  body('amount').isFloat({ gt: 0 }).withMessage('El valor debe ser mayor que cero.'),
  body('date').notEmpty(),
  validate,
  createLoanPayment
);
router.delete('/:id/payments/:paymentId', requirePermission('prestamos.editar'), removeLoanPayment);

export default router;
