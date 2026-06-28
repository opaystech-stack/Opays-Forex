// Orchestrateur Hermes — planifie les 3 agents via cron (node-cron).
// Les expressions cron sont surchargeables par variables d'environnement.
import cron from 'node-cron';
import { run as runAccountant } from './agents/accountant.js';
import { run as runCrm } from './agents/crm.js';
import { run as runSecurity } from './agents/security.js';

const CRON_ACCOUNTANT = process.env.CRON_ACCOUNTANT || '0 22 * * *';
const CRON_CRM = process.env.CRON_CRM || '0 9 * * *';
const CRON_SECURITY = process.env.CRON_SECURITY || '0 * * * *';

async function safe(label, fn) {
  try {
    await fn();
  } catch (err) {
    console.error(`[hermes] échec de l'agent ${label}:`, err?.message || err);
  }
}

function schedule(expr, label, fn) {
  if (!cron.validate(expr)) {
    console.error(`[hermes] expression cron invalide pour ${label}: "${expr}" — agent désactivé.`);
    return;
  }
  cron.schedule(expr, () => safe(label, fn), { timezone: process.env.TZ || 'UTC' });
  console.log(`[hermes] agent ${label} planifié : "${expr}"`);
}

console.log('[hermes] démarrage de l\'orchestrateur d\'agents IA OpaysFox.');
schedule(CRON_ACCOUNTANT, 'accountant', runAccountant);
schedule(CRON_CRM, 'crm', runCrm);
schedule(CRON_SECURITY, 'security', runSecurity);

// Exécution immédiate optionnelle au démarrage (utile en staging) : RUN_ON_BOOT.
if (process.env.RUN_ON_BOOT === 'true') {
  (async () => {
    await safe('accountant', runAccountant);
    await safe('crm', runCrm);
    await safe('security', runSecurity);
  })();
}

// Garde le process vivant.
process.stdin.resume();
