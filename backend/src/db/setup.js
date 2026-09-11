import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from '../config/db.js';
import { seedDatabase } from './seed.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function setupDatabase() {
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('Esquema aplicado correctamente.');

  // Migraciones incrementales (idempotentes) para bases de datos existentes.
  await pool.query('ALTER TABLE people ADD COLUMN IF NOT EXISTS cedula VARCHAR(50)');
  await pool.query('ALTER TABLE expenses ADD COLUMN IF NOT EXISTS person_id INTEGER');
  await pool.query('ALTER TABLE expenses ADD COLUMN IF NOT EXISTS is_payment_to_person BOOLEAN NOT NULL DEFAULT FALSE');
  await pool.query('ALTER TABLE debts ADD COLUMN IF NOT EXISTS person_id INTEGER');
  console.log('Migraciones aplicadas.');

  await seedDatabase();
}
