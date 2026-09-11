import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import {
  monthlyReport, annualReport, loansReport, debtsReport, categoriesReport, exportReport,
} from '../controllers/report.controller.js';

const router = Router();
router.use(authenticate);
router.use(requirePermission('reportes.ver'));

router.get('/monthly', monthlyReport);
router.get('/annual', annualReport);
router.get('/loans', loansReport);
router.get('/debts', debtsReport);
router.get('/categories', categoriesReport);
router.get('/export', exportReport);

export default router;
