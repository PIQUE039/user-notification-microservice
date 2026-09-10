import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.NOTIF_DB_HOST,
  port: Number(process.env.NOTIF_DB_PORT || 5432),
  database: process.env.NOTIF_DB_NAME,
  user: process.env.NOTIF_DB_USER,
  password: process.env.NOTIF_DB_PASSWORD,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

pool.on('error', (err) => {
  console.error('[notification-service] Unexpected Postgres pool error', err);
});

export async function checkDbConnection() {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
  } finally {
    client.release();
  }
}
