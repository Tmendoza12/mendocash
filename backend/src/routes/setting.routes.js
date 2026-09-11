import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { validate } from '../middleware/errorHandler.js';
import { listSettings, updateSettings } from '../controllers/setting.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('configuracion.ver'), listSettings);
router.put('/', requirePermission('configuracion.editar'), body('settings').isObject(), validate, updateSettings);

export default router;
