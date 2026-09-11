import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { validate } from '../middleware/errorHandler.js';
import {
  listBudgets, getBudget, createBudget, updateBudget, removeBudget, budgetHistory,
} from '../controllers/budget.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('presupuestos.ver'), listBudgets);
router.get('/history', requirePermission('presupuestos.ver'), budgetHistory);
router.get('/:id', requirePermission('presupuestos.ver'), getBudget);

router.post(
  '/',
  requirePermission('presupuestos.crear'),
  body('category_id').isInt(),
  body('amount').isFloat({ gt: 0 }).withMessage('El valor debe ser mayor que cero.'),
  body('period').notEmpty(),
  validate,
  createBudget
);

router.put('/:id', requirePermission('presupuestos.editar'), body('amount').isFloat({ gt: 0 }), validate, updateBudget);
router.delete('/:id', requirePermission('presupuestos.eliminar'), removeBudget);

export default router;
