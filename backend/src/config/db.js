import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;

// Parse NUMERIC como número para facilitar el trabajo con dinero.
pg.types.setTypeParser(1700, (val) => (val === null ? null : parseFloat(val)));
// Parse INT8 (bigint) como número.
pg.types.setTypeParser(20, (val) => (val === null ? null : parseInt(val, 10)));
// Devolver DATE como string 'YYYY-MM-DD' en lugar de objeto Date.
pg.types.setTypeParser(1082, (val) => val);

export function getConnectionConfig() {
  if (env.databaseUrl) {
    return {
      connectionString: env.databaseUrl,
      ssl: { rejectUnauthorized: false },
    };
  }
  return {
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
  };
}

export const pool = new Pool({
  ...getConnectionConfig(),
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('Error inesperado en el pool de PostgreSQL:', err.message);
});

export const query = (text, params) => pool.query(text, params);

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
