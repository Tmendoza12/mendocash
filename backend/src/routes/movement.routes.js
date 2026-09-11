import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { listMovements, exportMovements } from '../controllers/movement.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('movimientos.ver'), listMovements);
router.get('/export', requirePermission('movimientos.ver'), exportMovements);

export default router;
