import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/errorHandler.js';
import {
  login, logout, me, changePassword, forgotPassword, resetPassword, updateProfile, googleLogin, register,
} from '../controllers/auth.controller.js';
import { loginLimiter } from '../middleware/rateLimit.js';

const router = Router();

router.post(
  '/login',
  loginLimiter,
  body('email').isEmail().withMessage('Correo inválido.'),
  body('password').notEmpty().withMessage('La contraseña es obligatoria.'),
  validate,
  login
);

router.post('/logout', authenticate, logout);
router.get('/me', authenticate, me);

router.post(
  '/google',
  body('credential').notEmpty().withMessage('Credencial de Google requerida.'),
  validate,
  googleLogin
);

router.post(
  '/register',
  body('full_name').isLength({ min: 3 }).withMessage('El nombre es obligatorio.'),
  body('email').isEmail().withMessage('Correo inválido.'),
  body('password').isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres.'),
  validate,
  register
);

router.post(
  '/change-password',
  authenticate,
  body('current_password').notEmpty(),
  body('new_password').isLength({ min: 8 }).withMessage('La nueva contraseña debe tener al menos 8 caracteres.'),
  validate,
  changePassword
);

router.post('/forgot-password', body('email').isEmail(), validate, forgotPassword);
router.post(
  '/reset-password',
  body('token').notEmpty(),
  body('new_password').isLength({ min: 8 }),
  validate,
  resetPassword
);

router.put(
  '/profile',
  authenticate,
  body('full_name').optional().isLength({ min: 3 }),
  body('phone').optional(),
  body('avatar_url').optional(),
  validate,
  updateProfile
);

export default router;
