import app from './app.js';
import { env } from './config/env.js';
import { pool } from './config/db.js';
import { setupDatabase } from './db/setup.js';

async function start() {
  try {
    await pool.query('SELECT 1');
    console.log('Conexión a PostgreSQL establecida.');
  } catch (err) {
    console.error('No se pudo conectar a PostgreSQL:', err.message);
    process.exit(1);
  }

  try {
    await setupDatabase();
  } catch (err) {
    console.error('No se pudo preparar la base de datos:', err.message);
  }

  app.listen(env.port, () => {
    console.log(`MendoCash escuchando en el puerto ${env.port}`);
  });
}

start();
