// Agent Comptable — clôture financière quotidienne.
// Pour chaque agence : balances de change (par devise), bénéfice réel en USD du
// jour, volume d'opérations ; génère un mémo de clôture (table closing_memos).
//
// Lecture seule sauf insertion du mémo (désactivée en DRY_RUN).
import { query, write, DRY_RUN, pool } from '../lib/db.js';

const ENSURE_TABLE = `
CREATE TABLE IF NOT EXISTS closing_memos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID,
  memo_date DATE NOT NULL,
  profit_usd NUMERIC(24,8) DEFAULT 0,
  tx_count INTEGER DEFAULT 0,
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);`;

export async function run({ dateISO = new Date().toISOString().slice(0, 10) } = {}) {
  console.log(`[accountant] clôture du ${dateISO} (dry_run=${DRY_RUN})`);

  const { rows: agencies } = await query('SELECT id, name FROM agencies WHERE is_active = true');

  for (const agency of agencies) {
    const { rows: profitRows } = await query(
      `SELECT COALESCE(SUM(profit_usd), 0) AS profit_usd, COUNT(*) AS tx_count
         FROM transactions
        WHERE agency_id = $1 AND status = 'completed'
          AND timestamp::date = $2`,
      [agency.id, dateISO]
    );
    const profit = Number(profitRows[0]?.profit_usd || 0);
    const txCount = Number(profitRows[0]?.tx_count || 0);

    const { rows: balances } = await query(
      `SELECT currency_code, COALESCE(SUM(balance), 0) AS balance
         FROM wallets WHERE agency_id = $1 AND is_active = true
        GROUP BY currency_code ORDER BY currency_code`,
      [agency.id]
    );

    const balanceLines = balances.map((b) => `  - ${b.currency_code} : ${Number(b.balance).toLocaleString('fr-FR')}`).join('\n');
    const content = [
      `Mémo de clôture — ${agency.name} — ${dateISO}`,
      `Opérations complétées : ${txCount}`,
      `Bénéfice réel : ${profit.toFixed(2)} USD`,
      `Soldes de caisses par devise :`,
      balanceLines || '  (aucune caisse active)',
    ].join('\n');

    console.log('\n' + content + '\n');

    await write(ENSURE_TABLE, [], 'ensure closing_memos');
    await write(
      `INSERT INTO closing_memos (agency_id, memo_date, profit_usd, tx_count, content)
       VALUES ($1, $2, $3, $4, $5)`,
      [agency.id, dateISO, profit, txCount, content],
      'insert closing_memo'
    );
  }

  console.log('[accountant] terminé.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((e) => { console.error(e); process.exit(1); }).finally(() => pool.end());
}
