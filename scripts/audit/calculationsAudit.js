// Module d'audit d'intégrité des calculs (axe « calculs » du Rapport_Audit).
//
// Conformément à l'Exigence 1.12 et 4.7 de la spec financial-ops-audit-voice-agent :
//  - Compare les valeurs calculées par le code (`src/utils/finance.js`) aux valeurs
//    attendues, un écart étant constaté lorsque |valeur_code - valeur_attendue| > 0,01.
//  - Classe chaque écart par sévérité : `critique` (solde ou profit),
//    `majeur` (taux ou frais), `mineur` (arrondi <= 0,01).
//  - Recense les cas d'erreur financière non gérés dans `src/context/AppContext.jsx`
//    (fonds insuffisants, montant invalide, portefeuilles identiques, doublon, délai)
//    avec leur localisation (fichier, ligne) et leur type.
//
// Le module est conçu pour être testable : toutes les entrées (module financier,
// textes sources, table de taux, cas de calcul, cas d'erreur) sont injectables.
// Sans injection, il lit les fichiers réels du dépôt.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import * as defaultFinance from '../../src/utils/finance.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');

// Chemins relatifs (au dépôt) consignés dans les findings, et chemins absolus
// utilisés pour la lecture par défaut.
export const FINANCE_REL = 'src/utils/finance.js';
export const APP_CONTEXT_REL = 'src/context/AppContext.jsx';
const FINANCE_PATH = path.join(PROJECT_ROOT, FINANCE_REL);
const APP_CONTEXT_PATH = path.join(PROJECT_ROOT, APP_CONTEXT_REL);

// Seuil d'écart de calcul (Ex. 1.12) : 0,01 unité monétaire.
export const THRESHOLD = 0.01;

// Sévérité de l'écart de calcul selon la nature de la valeur comparée (Ex. 1.12).
export const SEVERITY_BY_KIND = {
  solde: 'critique',
  profit: 'critique',
  taux: 'majeur',
  frais: 'majeur',
  arrondi: 'mineur',
};

// Table de taux de référence (rate_to_usd : USD = montant / rate_to_usd).
export const DEFAULT_RATES = [
  { currency: 'USD', rate_to_usd: 1 },
  { currency: 'UGX', rate_to_usd: 3650 },
  { currency: 'KES', rate_to_usd: 128 },
  { currency: 'EUR', rate_to_usd: 0.92 },
];

// Portefeuilles de référence utilisés par les cas de mutation de soldes.
const SAMPLE_WALLETS = [
  { id: 'w1', currency: 'USD', balance: 1200 },
  { id: 'w2', currency: 'UGX', balance: 3650000 },
];

// Ancre de localisation (regex) de chaque fonction analysée dans finance.js.
const FINANCE_ANCHORS = {
  computeExchangeRate: /export const computeExchangeRate/,
  computeProfitUSD: /export const computeProfitUSD/,
  convertToUSD: /export const convertToUSD/,
  applyBalances: /export const applyBalances/,
  roundHalfUp: /export const roundHalfUp/,
};

// Cas de comparaison code/attendu. Chaque cas calcule une valeur via le module
// financier (`run`) et la confronte à la valeur attendue (`expected`).
export const DEFAULT_CALC_CASES = [
  {
    id: 'taux-exchange-1',
    kind: 'taux',
    fn: 'computeExchangeRate',
    description: 'exchange_rate = dest_amount / source_amount, arrondi à 6 décimales (Ex. 1.1)',
    expected: 3650,
    run: (finance, { rates }) => {
      const r = finance.computeExchangeRate(100, 365000, rates);
      return r && r.ok ? r.rate : NaN;
    },
  },
  {
    id: 'taux-exchange-2',
    kind: 'taux',
    fn: 'computeExchangeRate',
    description: 'taux non entier arrondi à 6 décimales (Ex. 1.1)',
    expected: 3666.666667,
    run: (finance) => {
      const r = finance.computeExchangeRate(150, 550000);
      return r && r.ok ? r.rate : NaN;
    },
  },
  {
    id: 'conversion-usd',
    kind: 'profit',
    fn: 'convertToUSD',
    description: 'conversion vers l\'USD par division par rate_to_usd, 2 décimales (Ex. 1.10)',
    expected: 100,
    run: (finance, { rates }) => finance.convertToUSD(365000, 'UGX', rates, { round: true }),
  },
  {
    id: 'profit-usd-1',
    kind: 'profit',
    fn: 'computeProfitUSD',
    description: 'profit_usd = valeurUSD(source) - valeurUSD(dest), 2 décimales (Ex. 1.3)',
    expected: 10,
    run: (finance, { rates }) => finance.computeProfitUSD(110, 'USD', 365000, 'UGX', rates),
  },
  {
    id: 'profit-usd-neutre',
    kind: 'profit',
    fn: 'computeProfitUSD',
    description: 'profit nul lorsque les valeurs USD source et destination sont égales (Ex. 1.3)',
    expected: 0,
    run: (finance, { rates }) => finance.computeProfitUSD(50, 'USD', 6400, 'KES', rates),
  },
  {
    id: 'solde-exchange-source',
    kind: 'solde',
    fn: 'applyBalances',
    description: 'exchange : portefeuille source débité de source_amount, 2 décimales (Ex. 1.4)',
    expected: 1100,
    run: (finance) => balanceAfter(finance, {
      type: 'exchange', status: 'completed',
      source_wallet_id: 'w1', dest_wallet_id: 'w2',
      source_amount: 100, dest_amount: 365000,
    }, 'w1'),
  },
  {
    id: 'solde-deposit-dest',
    kind: 'solde',
    fn: 'applyBalances',
    description: 'deposit : seul le portefeuille destination est crédité (Ex. 1.5)',
    expected: 3651000,
    run: (finance) => balanceAfter(finance, {
      type: 'deposit', status: 'completed',
      dest_wallet_id: 'w2', dest_amount: 1000,
    }, 'w2'),
  },
  {
    id: 'frais-debit',
    kind: 'frais',
    fn: 'applyBalances',
    description: 'frais > 0 : le portefeuille de frais est débité du montant des frais (Ex. 1.8)',
    expected: 1195,
    run: (finance) => balanceAfter(finance, {
      type: 'deposit', status: 'completed',
      dest_wallet_id: 'w2', dest_amount: 1000,
      fee: 5, fee_wallet_id: 'w1',
    }, 'w1'),
  },
  {
    id: 'arrondi-demi-haut',
    kind: 'arrondi',
    fn: 'roundHalfUp',
    description: 'arrondi au plus proche, demi vers le haut, robuste aux erreurs binaires (Ex. 1.1)',
    expected: 2.68,
    run: (finance) => finance.roundHalfUp(2.675, 2),
  },
];

// Cas d'erreur financière à recenser (Ex. 4.7). Pour chacun, si aucun motif de
// prise en charge n'est trouvé dans la source analysée, on consigne un finding
// « non géré » localisé sur le point d'entrée des mutations financières.
export const DEFAULT_ERROR_CASES = [
  {
    type: 'fonds_insuffisants',
    severity: 'critique',
    label: 'Fonds insuffisants',
    patterns: [/fonds?\s+insuffisant/i, /insufficient/i, /solde\s+disponible/i, /available\s*-\s*requested/],
  },
  {
    type: 'montant_invalide',
    severity: 'majeur',
    label: 'Montant invalide',
    patterns: [/validateAmount/, /montant\s+invalide/i, /amount.*\bisNaN\b/i],
  },
  {
    type: 'portefeuilles_identiques',
    severity: 'majeur',
    label: 'Portefeuilles source et destination identiques',
    patterns: [/ensureDistinctWallets/, /portefeuilles?\s+distinct/i, /source_wallet_id\s*===\s*dest_wallet_id/],
  },
  {
    type: 'doublon',
    severity: 'critique',
    label: 'Doublon par transaction_id réseau',
    patterns: [/detectDuplicate/, /doublon/i, /\bduplicate\b/i],
  },
  {
    type: 'delai',
    severity: 'majeur',
    label: 'Dépassement de délai (timeout) du Gemini_Proxy',
    patterns: [/callGeminiWithTimeout/, /AbortController/, /Promise\.race/, /\btimeout\b/i, /délai/i],
  },
];

// Lecture tolérante : renvoie le contenu texte ou null si illisible.
async function safeRead(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

// Extrait la portion du contexte applicatif portant les mutations financières
// (de `prepareTransaction`/`addTransaction` jusqu'au début de `createWallet`).
// Restreindre le scan à ce périmètre évite les faux négatifs liés à du code non
// financier ailleurs dans le fichier (p. ex. la validation de
// `adjustWalletBalance`) comme les faux positifs (oubli de `prepareTransaction`).
export function extractFinancialScope(source) {
  if (typeof source !== 'string') return source;
  const start = source.search(/const (prepareTransaction|addTransaction)\s*=/);
  if (start === -1) return source;
  const rest = source.slice(start);
  const endRel = rest.search(/const createWallet\s*=/);
  return endRel === -1 ? rest : rest.slice(0, endRel);
}

// Renvoie le numéro de ligne (1-indexé) de la première occurrence de `pattern`
// dans `text`, ou undefined si absent / texte indisponible.
export function locateLine(text, pattern) {
  if (typeof text !== 'string' || !text) return undefined;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    if (pattern.test(lines[i])) return i + 1;
  }
  return undefined;
}

// Applique une opération sur les portefeuilles de référence et renvoie le solde
// résultant du portefeuille `walletId` (ou NaN en cas d'échec / d'erreur).
function balanceAfter(finance, txn, walletId) {
  const result = finance.applyBalances(SAMPLE_WALLETS, txn);
  if (!result || result.error || !Array.isArray(result.wallets)) return NaN;
  const wallet = result.wallets.find((w) => w.id === walletId);
  return wallet ? Number(wallet.balance) : NaN;
}

// Compare une valeur calculée à la valeur attendue et renvoie un finding ou null.
function evaluateCalcCase(testCase, finance, context, financeSource) {
  let actual;
  try {
    actual = testCase.run(finance, context);
  } catch {
    actual = NaN;
  }

  const computed = Number(actual);
  const within = Number.isFinite(computed) && Math.abs(computed - testCase.expected) <= THRESHOLD;
  if (within) return null;

  const anchor = FINANCE_ANCHORS[testCase.fn];
  return {
    file: FINANCE_REL,
    line: anchor ? locateLine(financeSource, anchor) : undefined,
    severity: SEVERITY_BY_KIND[testCase.kind] || 'mineur',
    expected: String(testCase.expected),
    actual: Number.isFinite(computed) ? String(computed) : 'non calculé',
    description: `Écart de calcul (${testCase.kind}) sur ${testCase.fn} : ${testCase.description}`,
  };
}

// Recense les cas d'erreur financière non gérés dans la source fournie.
function evaluateErrorCases(errorCases, source, file, anchorLine) {
  if (typeof source !== 'string') {
    return [{
      file,
      severity: 'majeur',
      description: `Fichier source illisible (${file}) : recensement des erreurs financières interrompu.`,
    }];
  }

  return errorCases
    .filter((errorCase) => !errorCase.patterns.some((pattern) => pattern.test(source)))
    .map((errorCase) => ({
      file,
      line: anchorLine,
      severity: errorCase.severity,
      type: errorCase.type,
      description: `Cas d'erreur financière non géré : ${errorCase.label} (aucune prise en charge détectée dans ${file}).`,
    }));
}

/**
 * Audit d'intégrité des calculs.
 *
 * @param {object} [options]
 * @param {object} [options.finance]          Module financier injectable (défaut : src/utils/finance.js).
 * @param {string|null} [options.financeSource]    Texte de finance.js (défaut : lecture disque) — pour localiser les lignes.
 * @param {string|null} [options.appContextSource] Texte d'AppContext.jsx (défaut : lecture disque).
 * @param {Array}  [options.rates]            Table de taux injectable.
 * @param {Array}  [options.calcCases]        Cas de comparaison code/attendu.
 * @param {Array}  [options.errorCases]       Cas d'erreur financière à recenser.
 * @returns {Promise<{ axe: 'calculs', findings: Array }>}
 */
export async function auditCalculations(options = {}) {
  const finance = options.finance || defaultFinance;
  const rates = options.rates || DEFAULT_RATES;
  const calcCases = options.calcCases || DEFAULT_CALC_CASES;
  const errorCases = options.errorCases || DEFAULT_ERROR_CASES;

  const financeSource = options.financeSource !== undefined
    ? options.financeSource
    : await safeRead(FINANCE_PATH);

  const usedDefaultAppContext = options.appContextSource === undefined;
  const appContextSource = usedDefaultAppContext
    ? await safeRead(APP_CONTEXT_PATH)
    : options.appContextSource;

  const findings = [];

  // 1) Écarts de calcul (Ex. 1.12).
  const context = { rates };
  for (const testCase of calcCases) {
    const finding = evaluateCalcCase(testCase, finance, context, financeSource);
    if (finding) findings.push(finding);
  }

  // 2) Cas d'erreur financière non gérés (Ex. 4.7).
  // Lecture réelle : on scanne `finance.js` (fonctions pures de garde) et le
  // périmètre des mutations financières d'`AppContext.jsx`. Texte injecté
  // (tests) : on scanne `appContextSource` tel quel pour une prédictibilité totale.
  let scanText;
  if (usedDefaultAppContext) {
    const scope = extractFinancialScope(appContextSource);
    const parts = [financeSource, scope].filter((s) => typeof s === 'string');
    scanText = parts.length ? parts.join('\n') : null; // null si les deux sources illisibles
  } else {
    scanText = appContextSource;
  }
  const anchorLine = locateLine(appContextSource, /const addTransaction\s*=/);
  findings.push(...evaluateErrorCases(errorCases, scanText, APP_CONTEXT_REL, anchorLine));

  return { axe: 'calculs', findings };
}

export default auditCalculations;
