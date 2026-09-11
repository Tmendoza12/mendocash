import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { listPermissions } from '../controllers/role.controller.js';

const router = Router();
router.use(authenticate);
router.get('/', requirePermission('permisos.ver'), listPermissions);

export default router;
