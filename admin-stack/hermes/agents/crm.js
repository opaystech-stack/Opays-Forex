// Agent CRM — analyse de récence client et composition de relances WhatsApp.
// Détecte les clients inactifs (> CRM_INACTIVITY_DAYS jours sans opération) et
// compose une relance personnalisée via Gemini (repli sur gabarit local).
// Les relances sont journalisées en 'queued' (envoi réel laissé à la passerelle).
import { query, write, DRY_RUN, pool } from '../lib/db.js';
import { generateText } from '../lib/gemini.js';

const INACTIVITY_DAYS = Number(process.env.CRM_INACTIVITY_DAYS || 15);

function fallbackMessage(name, days) {
  const who = name || 'cher client';
  return `Bonjour ${who}, cela fait ${days} jours que nous n'avons pas traité d'opération ensemble. ` +
    `Nos taux du jour sont disponibles — répondez à ce message pour un devis rapide. L'équipe OpaysFox.`;
}

async function composeMessage({ name, days, lastCurrency }) {
  const prompt = [
    'Tu es un assistant CRM pour un bureau de change.',
    `Rédige une relance WhatsApp courte (max 2 phrases), chaleureuse et professionnelle, en français,`,
    `pour le client "${name || 'client'}" inactif depuis ${days} jours`,
    lastCurrency ? `(dernière devise traitée : ${lastCurrency}).` : '.',
    'Pas de promesses chiffrées, pas de taux inventé. Termine par "L\'équipe OpaysFox".',
  ].join(' ');
  const ai = await generateText(prompt);
  return ai || fallbackMessage(name, days);
}

export async function run() {
  console.log(`[crm] récence > ${INACTIVITY_DAYS} jours (dry_run=${DRY_RUN})`);

  const { rows: clients } = await query(
    `SELECT c.id, c.agency_id, c.name, c.phone,
            MAX(t.timestamp) AS last_tx,
            EXTRACT(DAY FROM NOW() - MAX(t.timestamp))::int AS days_inactive
       FROM customers c
       LEFT JOIN transactions t
         ON t.customer_id = c.id AND t.agency_id = c.agency_id AND t.status = 'completed'
      GROUP BY c.id, c.agency_id, c.name, c.phone
     HAVING MAX(t.timestamp) IS NULL OR MAX(t.timestamp) < NOW() - ($1 || ' days')::interval`,
    [String(INACTIVITY_DAYS)]
  );

  console.log(`[crm] ${clients.length} client(s) à relancer.`);

  for (const client of clients) {
    const days = client.days_inactive ?? INACTIVITY_DAYS;
    const content = await composeMessage({ name: client.name, days });
    console.log(`\n→ ${client.name || client.id} (${client.phone || 'sans téléphone'}) :\n${content}\n`);

    await write(
      `INSERT INTO reminder_history
         (agency_id, customer_id, scenario, content, trigger_source, status)
       VALUES ($1, $2, 'recency', $3, 'crm', 'queued')`,
      [client.agency_id, client.id, content],
      'insert reminder (queued)'
    );
  }

  console.log('[crm] terminé.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((e) => { console.error(e); process.exit(1); }).finally(() => pool.end());
}
