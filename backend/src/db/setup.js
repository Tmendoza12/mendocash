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
  await seedDatabase();
}
