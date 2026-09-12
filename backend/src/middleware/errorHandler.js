import { validationResult } from 'express-validator';

export function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: 'Datos inválidos.',
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
}

export function notFoundHandler(req, res) {
  res.status(404).json({ message: 'Ruta no encontrada.' });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  if (status >= 500) {
    console.error('Error:', err.message);
    return res.status(status).json({ message: 'Error interno del servidor.' });
  }
  res.status(status).json({ message: err.message || 'Error en la solicitud.' });
}
