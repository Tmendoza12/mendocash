import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { getDashboard, getCalendar } from '../controllers/dashboard.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('dashboard.ver'), getDashboard);
router.get('/calendar', requirePermission('dashboard.ver'), getCalendar);

export default router;
