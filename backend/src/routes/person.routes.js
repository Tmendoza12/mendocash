import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { validate } from '../middleware/errorHandler.js';
import { listPeople, createPerson, updatePerson, removePerson } from '../controllers/person.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('personas.ver'), listPeople);

router.post(
  '/',
  requirePermission('personas.crear'),
  body('full_name').notEmpty().withMessage('El nombre es obligatorio.'),
  body('email').optional().isEmail(),
  validate,
  createPerson
);

router.put('/:id', requirePermission('personas.editar'), body('email').optional().isEmail(), validate, updatePerson);
router.delete('/:id', requirePermission('personas.eliminar'), removePerson);

export default router;
