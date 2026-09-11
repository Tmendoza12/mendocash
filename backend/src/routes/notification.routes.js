import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { validate } from '../middleware/errorHandler.js';
import {
  listNotifications, refreshNotifications, markRead, markAllRead, getPreferences, updatePreferences,
} from '../controllers/notification.controller.js';

const router = Router();
router.use(authenticate);
router.use(requirePermission('notificaciones.ver'));

router.get('/', listNotifications);
router.get('/preferences', getPreferences);
router.put('/preferences', body('preferences').isArray(), validate, updatePreferences);
router.post('/refresh', refreshNotifications);
router.post('/read-all', markAllRead);
router.post('/:id/read', markRead);

export default router;
