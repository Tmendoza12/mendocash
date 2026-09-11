import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { validate } from '../middleware/errorHandler.js';
import {
  listCategories, getCategory, createCategory, updateCategory, removeCategory,
  createSubcategory, updateSubcategory, removeSubcategory,
} from '../controllers/category.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('categorias.ver'), listCategories);
router.get('/:id', requirePermission('categorias.ver'), getCategory);

router.post(
  '/',
  requirePermission('categorias.crear'),
  body('name').notEmpty().withMessage('El nombre es obligatorio.'),
  body('type').isIn(['income', 'expense']).withMessage('Tipo inválido.'),
  validate,
  createCategory
);

router.put('/:id', requirePermission('categorias.editar'), validate, updateCategory);
router.delete('/:id', requirePermission('categorias.eliminar'), removeCategory);

router.post('/:id/subcategories', requirePermission('categorias.crear'), body('name').notEmpty(), validate, createSubcategory);
router.put('/subcategories/:id', requirePermission('categorias.editar'), validate, updateSubcategory);
router.delete('/subcategories/:id', requirePermission('categorias.eliminar'), removeSubcategory);

export default router;
