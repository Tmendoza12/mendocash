import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { validate } from '../middleware/errorHandler.js';
import {
  listRecurring, createRecurring, updateRecurring, removeRecurring, generateRecurring,
} from '../controllers/recurring.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('recurrentes.ver'), listRecurring);

router.post(
  '/',
  requirePermission('recurrentes.crear'),
  body('name').notEmpty(),
  body('amount').isFloat({ gt: 0 }),
  body('frequency').isIn(['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']),
  validate,
  createRecurring
);

router.put('/:id', requirePermission('recurrentes.editar'), body('amount').optional().isFloat({ gt: 0 }), validate, updateRecurring);
router.delete('/:id', requirePermission('recurrentes.eliminar'), removeRecurring);
router.post('/:id/generate', requirePermission('recurrentes.editar'), generateRecurring);

export default router;
