import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';
import { env } from '../config/env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function ensureDatabase() {
  const client = new pg.Client({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: 'postgres',
  });
  await client.connect();
  const { rowCount } = await client.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [env.db.database]
  );
  if (rowCount === 0) {
    await client.query(`CREATE DATABASE ${env.db.database}`);
    console.log(`Base de datos "${env.db.database}" creada.`);
  } else {
    console.log(`Base de datos "${env.db.database}" ya existe.`);
  }
  await client.end();
}

async function migrate() {
  await ensureDatabase();
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  const client = new pg.Client({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
  });
  await client.connect();
  await client.query(schema);
  await client.end();
  console.log('Esquema aplicado correctamente.');
}

migrate().catch((err) => {
  console.error('Error en la migración:', err.message);
  process.exit(1);
});
