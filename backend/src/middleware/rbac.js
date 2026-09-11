export function requirePermission(...permissions) {
  return (req, res, next) => {
    if (!req.permissions || !req.permissions.length) {
      return res.status(403).json({ message: 'Sin permisos.' });
    }
    const hasAll = permissions.every((p) => req.permissions.includes(p));
    if (!hasAll) {
      return res
        .status(403)
        .json({ message: 'No tienes permiso para realizar esta acción.' });
    }
    next();
  };
}

export function requireAnyPermission(...permissions) {
  return (req, res, next) => {
    if (!req.permissions) {
      return res.status(403).json({ message: 'Sin permisos.' });
    }
    const hasAny = permissions.some((p) => req.permissions.includes(p));
    if (!hasAny) {
      return res
        .status(403)
        .json({ message: 'No tienes permiso para realizar esta acción.' });
    }
    next();
  };
}
