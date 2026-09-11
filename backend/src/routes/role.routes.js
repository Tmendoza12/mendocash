import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { validate } from '../middleware/errorHandler.js';
import {
  listRoles, getRole, listPermissions, createRole, updateRole, removeRole,
} from '../controllers/role.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('roles.ver'), listRoles);
router.get('/:id', requirePermission('roles.ver'), getRole);
router.post(
  '/',
  requirePermission('roles.crear'),
  body('name').notEmpty(),
  body('slug').notEmpty(),
  body('permissions').isArray(),
  validate,
  createRole
);
router.put('/:id', requirePermission('roles.editar'), body('permissions').optional().isArray(), validate, updateRole);
router.delete('/:id', requirePermission('roles.eliminar'), removeRole);

export default router;
