// Pool PostgreSQL partagé par les agents Hermes. Lecture seule par défaut :
// les écritures (mémos, alertes, brouillons de relance) ne se font que si
// DRY_RUN !== 'true'.
import pkg from 'pg';
const { Pool } = pkg;

export const DRY_RUN = (process.env.DRY_RUN ?? 'true') !== 'false';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 4,
});

export async function query(text, params = []) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

// Garde d'écriture : n'exécute la requête que hors mode simulation.
export async function write(text, params = [], label = 'write') {
  if (DRY_RUN) {
    console.log(`[DRY_RUN] écriture ignorée (${label}).`);
    return { rowCount: 0, rows: [], dryRun: true };
  }
  return query(text, params);
}
