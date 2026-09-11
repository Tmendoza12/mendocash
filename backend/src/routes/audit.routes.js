import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { listAuditLogs } from '../controllers/audit.controller.js';

const router = Router();
router.use(authenticate);
router.get('/', requirePermission('auditoria.ver'), listAuditLogs);

export default router;
