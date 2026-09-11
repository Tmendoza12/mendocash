import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { validate } from '../middleware/errorHandler.js';
import {
  listUsers, getUser, createUser, updateUser, removeUser, changeStatus,
} from '../controllers/user.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('usuarios.ver'), listUsers);
router.get('/:id', requirePermission('usuarios.ver'), getUser);

router.post(
  '/',
  requirePermission('usuarios.crear'),
  body('full_name').notEmpty().withMessage('El nombre es obligatorio.'),
  body('email').isEmail().withMessage('Correo inválido.'),
  body('password').isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres.'),
  body('roles').isArray(),
  validate,
  createUser
);

router.put(
  '/:id',
  requirePermission('usuarios.editar'),
  body('email').optional().isEmail(),
  body('password').optional().isLength({ min: 8 }),
  validate,
  updateUser
);

router.patch(
  '/:id/status',
  requirePermission('usuarios.editar'),
  body('is_active').isBoolean(),
  validate,
  changeStatus
);

router.delete('/:id', requirePermission('usuarios.eliminar'), removeUser);

export default router;
