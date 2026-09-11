import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { validate } from '../middleware/errorHandler.js';
import { listTransfers, createTransfer, removeTransfer } from '../controllers/transfer.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('transferencias.ver'), listTransfers);

router.post(
  '/',
  requirePermission('transferencias.crear'),
  body('from_account_id').isInt(),
  body('to_account_id').isInt(),
  body('amount').isFloat({ gt: 0 }).withMessage('El valor debe ser mayor que cero.'),
  body('date').notEmpty(),
  validate,
  createTransfer
);

router.delete('/:id', requirePermission('transferencias.eliminar'), removeTransfer);

export default router;
