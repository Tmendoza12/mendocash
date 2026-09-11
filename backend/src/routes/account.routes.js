import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { validate } from '../middleware/errorHandler.js';
import {
  listAccounts, getAccount, createAccount, updateAccount, removeAccount,
} from '../controllers/account.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('cuentas.ver'), listAccounts);
router.get('/:id', requirePermission('cuentas.ver'), getAccount);

router.post(
  '/',
  requirePermission('cuentas.crear'),
  body('name').notEmpty().withMessage('El nombre es obligatorio.'),
  body('type').notEmpty().withMessage('El tipo es obligatorio.'),
  body('initial_balance').optional().isNumeric(),
  validate,
  createAccount
);

router.put('/:id', requirePermission('cuentas.editar'), validate, updateAccount);
router.delete('/:id', requirePermission('cuentas.eliminar'), removeAccount);

export default router;
