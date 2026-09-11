// Resuelve el id de usuario objetivo para operaciones de lectura.
// Los usuarios con permiso de alcance global pueden consultar datos de otros.
export function targetUserIdForRead(req) {
  const canGlobal = req.permissions?.includes('datos.globales.ver');
  const requested = req.query.user_id;
  if (canGlobal && requested) return Number(requested);
  return req.user.id;
}

// Resuelve el id de usuario objetivo para operaciones de escritura.
export function targetUserIdForWrite(req, bodyUserId) {
  const canManage = req.permissions?.includes('datos.globales.gestionar');
  if (canManage && bodyUserId) return Number(bodyUserId);
  return req.user.id;
}
