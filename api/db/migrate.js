#!/usr/bin/env node
import { readdirSync, readFileSync, createHash } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, 'migrations');
const TABLE_NAME = '_migrations';

function checksum(content) {
  return createHash('sha256').update(content).digest('hex');
}

function parseArgs() {
  const args = process.argv.slice(2);
  return { status: args.includes('--status'), rollback: args.includes('--rollback') };
}

async function getApplied(pool) {
  const { rows } = await pool.query('SELECT filename, checksum FROM ' + TABLE_NAME + ' ORDER BY id');
  return rows;
}

async function markApplied(pool, filename, hash) {
  await pool.query(
    'INSERT INTO ' + TABLE_NAME + ' (filename, checksum) VALUES ($1, $2) ON CONFLICT (filename) DO UPDATE SET checksum = $2',
    [filename, hash]
  );
}

async function markRollback(pool, filename) {
  await pool.query('DELETE FROM ' + TABLE_NAME + ' WHERE filename = $1', [filename]);
}

async function run() {
  const opts = parseArgs();
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  try {
    await pool.query(
      'CREATE TABLE IF NOT EXISTS ' + TABLE_NAME + ' (id SERIAL PRIMARY KEY, filename VARCHAR(255) NOT NULL UNIQUE, applied_at TIMESTAMPTZ DEFAULT NOW(), checksum VARCHAR(64) NOT NULL)'
    );

    const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
    if (files.length === 0) { console.log('Aucune migration trouvee.'); return; }

    const applied = await getApplied(pool);
    const appliedMap = new Map(applied.map(r => [r.filename, r.checksum]));

    if (opts.status) {
      console.log('=== Etat des migrations ===');
      for (const file of files) {
        const content = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf-8');
        const hash = checksum(content);
        const isApplied = appliedMap.has(file);
        const match = isApplied && appliedMap.get(file) === hash;
        const status = isApplied ? (match ? '[OK]' : '[MODIFIE]') : '[EN ATTENTE]';
        console.log('  ' + status + ' ' + file);
      }
      return;
    }

    if (opts.rollback) {
      const last = applied[applied.length - 1];
      if (!last) { console.log('Aucune migration a annuler.'); return; }
      console.log('Annulation de ' + last.filename + '...');
      const rbFile = resolve(MIGRATIONS_DIR, last.filename.replace('.sql', '.rollback.sql'));
      try {
        const rbContent = readFileSync(rbFile, 'utf-8');
        await pool.query(rbContent);
        console.log('  Rollback execute');
      } catch { console.log('  Aucun rollback defini pour ' + last.filename); }
      await markRollback(pool, last.filename);
      console.log('  ' + last.filename + ' marquee comme non appliquee');
      return;
    }

    let count = 0;
    for (const file of files) {
      if (appliedMap.has(file)) continue;
      const content = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf-8');
      const hash = checksum(content);
      console.log('Application de ' + file + '...');
      await pool.query(content);
      await markApplied(pool, file, hash);
      console.log('  ' + file + ' appliquee (' + hash.slice(0, 8) + ')');
      count++;
    }

    if (count === 0) { console.log('Toutes les migrations sont a jour.'); }
    else { console.log(count + ' migration(s) appliquee(s) avec succes.'); }
  } finally {
    await pool.end();
  }
}

run().catch(err => {
  console.error('Erreur de migration:', err.message);
  process.exit(1);
});
