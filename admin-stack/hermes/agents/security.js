// Agent de Sécurité — analyse des journaux d'accès (audit_logs) pour remonter
// les anomalies : pics d'échecs d'authentification, dispersion d'adresses IP
// par utilisateur, volumétrie anormale d'actions sensibles.
// Produit un rapport et journalise les alertes (table security_alerts).
import { query, write, DRY_RUN, pool } from '../lib/db.js';

const ENSURE_TABLE = `
CREATE TABLE IF NOT EXISTS security_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  severity VARCHAR(16) NOT NULL,
  kind VARCHAR(48) NOT NULL,
  subject TEXT,
  detail TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);`;

const WINDOW = "NOW() - INTERVAL '24 hours'";

export async function run() {
  console.log(`[security] analyse des dernières 24h (dry_run=${DRY_RUN})`);
  const alerts = [];

  // 1) Pics d'échecs d'authentification par utilisateur/IP.
  const failed = await query(
    `SELECT user_id, ip_address, COUNT(*) AS n
       FROM audit_logs
      WHERE created_at > ${WINDOW}
        AND action ILIKE '%fail%'
      GROUP BY user_id, ip_address
      HAVING COUNT(*) >= 5
      ORDER BY n DESC`
  ).catch((e) => { console.warn('[security] audit_logs indisponible:', e.message); return { rows: [] }; });

  for (const r of failed.rows) {
    alerts.push({
      severity: 'high', kind: 'auth_failures',
      subject: `user=${r.user_id ?? '?'} ip=${r.ip_address ?? '?'}`,
      detail: `${r.n} échecs d'authentification en 24h`,
    });
  }

  // 2) Même utilisateur depuis un nombre inhabituel d'IP distinctes.
  const multiIp = await query(
    `SELECT user_id, COUNT(DISTINCT ip_address) AS ips
       FROM audit_logs
      WHERE created_at > ${WINDOW} AND user_id IS NOT NULL
      GROUP BY user_id
      HAVING COUNT(DISTINCT ip_address) >= 4
      ORDER BY ips DESC`
  ).catch(() => ({ rows: [] }));

  for (const r of multiIp.rows) {
    alerts.push({
      severity: 'medium', kind: 'ip_dispersion',
      subject: `user=${r.user_id}`,
      detail: `${r.ips} adresses IP distinctes en 24h`,
    });
  }

  // 3) Volumétrie anormale d'actions sensibles (suppressions, changements de droits).
  const sensitive = await query(
    `SELECT user_id, action, COUNT(*) AS n
       FROM audit_logs
      WHERE created_at > ${WINDOW}
        AND (action ILIKE '%delete%' OR action ILIKE '%permission%' OR action ILIKE '%role%')
      GROUP BY user_id, action
      HAVING COUNT(*) >= 20`
  ).catch(() => ({ rows: [] }));

  for (const r of sensitive.rows) {
    alerts.push({
      severity: 'medium', kind: 'sensitive_volume',
      subject: `user=${r.user_id} action=${r.action}`,
      detail: `${r.n} actions sensibles en 24h`,
    });
  }

  if (alerts.length === 0) {
    console.log('[security] aucune anomalie détectée.');
  } else {
    console.log(`[security] ${alerts.length} anomalie(s) :`);
    for (const a of alerts) console.log(`  [${a.severity}] ${a.kind} — ${a.subject} : ${a.detail}`);
    await write(ENSURE_TABLE, [], 'ensure security_alerts');
    for (const a of alerts) {
      await write(
        `INSERT INTO security_alerts (severity, kind, subject, detail) VALUES ($1, $2, $3, $4)`,
        [a.severity, a.kind, a.subject, a.detail],
        'insert security_alert'
      );
    }
  }

  console.log('[security] terminé.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((e) => { console.error(e); process.exit(1); }).finally(() => pool.end());
}
