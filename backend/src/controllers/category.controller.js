import { query, withTransaction } from '../config/db.js';
import { asyncHandler } from '../utils/helpers.js';
import { logAudit } from '../services/audit.js';

export const listCategories = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const type = req.query.type;
  const { rows } = await query(
    `SELECT c.*,
            COALESCE(json_agg(DISTINCT jsonb_build_object('id', s.id, 'name', s.name, 'is_active', s.is_active, 'sort_order', s.sort_order))
              FILTER (WHERE s.id IS NOT NULL), '[]') AS subcategories
       FROM categories c
       LEFT JOIN subcategories s ON s.category_id = c.id
      WHERE (c.is_global = TRUE OR c.user_id = $1)
        AND ($2::text IS NULL OR c.type = $2)
      GROUP BY c.id
      ORDER BY c.type, c.sort_order, c.name`,
    [userId, type]
  );
  res.json({ data: rows });
});

export const getCategory = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { rows } = await query(
    `SELECT * FROM categories WHERE id = $1 AND (is_global = TRUE OR user_id = $2)`,
    [req.params.id, userId]
  );
  if (!rows.length) return res.status(404).json({ message: 'Categoría no encontrada.' });
  res.json({ category: rows[0] });
});

export const createCategory = asyncHandler(async (req, res) => {
  const { name, type = 'expense', color, icon, is_global = false, sort_order = 0 } = req.body;
  const canGlobal = req.permissions?.includes('categorias.crear') && (is_global ? req.permissions?.includes('datos.globales.gestionar') : true);
  const ownerId = is_global && req.permissions?.includes('datos.globales.gestionar') ? null : req.user.id;

  const category = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO categories (user_id, name, type, color, icon, is_global, is_active, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7) RETURNING *`,
      [ownerId, name, type, color || null, icon || null, Boolean(ownerId === null), sort_order]
    );
    await logAudit(client, { userId: req.user.id, action: 'create', module: 'categorias', recordId: rows[0].id, newData: rows[0], req });
    return rows[0];
  });
  res.status(201).json({ category });
});

export const updateCategory = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const { name, color, icon, is_active, sort_order } = req.body;
  const userId = req.user.id;
  const isGlobalAdmin = req.permissions?.includes('datos.globales.gestionar');

  const category = await withTransaction(async (client) => {
    const { rows: oldRows } = await client.query(
      `SELECT * FROM categories WHERE id = $1 AND (is_global = TRUE AND $2 = TRUE OR user_id = $3)`,
      [id, isGlobalAdmin, userId]
    );
    if (!oldRows.length) {
      const e = new Error('Categoría no encontrada o sin permisos.');
      e.status = 404;
      throw e;
    }
    const old = oldRows[0];
    const { rows } = await client.query(
      `UPDATE categories SET
         name = COALESCE($2, name),
         color = COALESCE($3, color),
         icon = COALESCE($4, icon),
         is_active = COALESCE($5, is_active),
         sort_order = COALESCE($6, sort_order)
       WHERE id = $1 RETURNING *`,
      [id, name ?? old.name, color ?? old.color, icon ?? old.icon, is_active ?? old.is_active, sort_order ?? old.sort_order]
    );
    await logAudit(client, { userId: req.user.id, action: 'update', module: 'categorias', recordId: id, oldData: old, newData: rows[0], req });
    return rows[0];
  });
  res.json({ category });
});

export const removeCategory = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const userId = req.user.id;
  const isGlobalAdmin = req.permissions?.includes('datos.globales.gestionar');

  await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM categories WHERE id = $1 AND (is_global = TRUE AND $2 = TRUE OR user_id = $3)`,
      [id, isGlobalAdmin, userId]
    );
    if (!rows.length) {
      const e = new Error('Categoría no encontrada.');
      e.status = 404;
      throw e;
    }
    const { rows: usage } = await client.query(
      `SELECT
         (SELECT count(*) FROM income WHERE category_id = $1) +
         (SELECT count(*) FROM expenses WHERE category_id = $1) AS c`,
      [id]
    );
    if (usage[0].c > 0) {
      const e = new Error('La categoría tiene movimientos asociados. Desactívala en lugar de eliminarla.');
      e.status = 400;
      throw e;
    }
    await client.query('DELETE FROM categories WHERE id = $1', [id]);
    await logAudit(client, { userId: req.user.id, action: 'delete', module: 'categorias', recordId: id, oldData: rows[0], req });
  });
  res.json({ message: 'Categoría eliminada.' });
});

// ---------- Subcategorías ----------
export const createSubcategory = asyncHandler(async (req, res) => {
  const { name, sort_order = 0 } = req.body;
  const categoryId = req.params.id;
  const userId = req.user.id;
  const { rows: cat } = await query(
    'SELECT id FROM categories WHERE id = $1 AND (is_global = TRUE OR user_id = $2)',
    [categoryId, userId]
  );
  if (!cat.length) return res.status(404).json({ message: 'Categoría no encontrada.' });

  const { rows } = await query(
    'INSERT INTO subcategories (category_id, name, sort_order) VALUES ($1, $2, $3) RETURNING *',
    [categoryId, name, sort_order]
  );
  res.status(201).json({ subcategory: rows[0] });
});

export const updateSubcategory = asyncHandler(async (req, res) => {
  const { name, is_active, sort_order } = req.body;
  const { rows } = await query(
    `UPDATE subcategories SET
       name = COALESCE($2, name),
       is_active = COALESCE($3, is_active),
       sort_order = COALESCE($4, sort_order)
     WHERE id = $1 RETURNING *`,
    [req.params.id, name ?? null, is_active ?? null, sort_order ?? null]
  );
  if (!rows.length) return res.status(404).json({ message: 'Subcategoría no encontrada.' });
  res.json({ subcategory: rows[0] });
});

export const removeSubcategory = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const { rows: usage } = await query('SELECT count(*)::int AS c FROM expenses WHERE subcategory_id = $1', [id]);
  if (usage[0].c > 0) {
    return res.status(400).json({ message: 'La subcategoría tiene movimientos asociados.' });
  }
  await query('DELETE FROM subcategories WHERE id = $1', [id]);
  res.json({ message: 'Subcategoría eliminada.' });
});
