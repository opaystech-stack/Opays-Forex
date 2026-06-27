// Module d'audit : navigation / contrôleurs / sécurité (RLS)
// Axe « securite » du Rapport_Audit (Exigence 2 : 2.1, 2.2, 2.4, 2.5, 2.6).
//
// Ce module est volontairement constitué de fonctions PURES (analyse de
// chaînes sources) orchestrées par `auditSecurity()`. Les sources peuvent être
// injectées (testabilité, tâche 13.7) ou lues depuis les fichiers par défaut.
//
// Sorties :
//   - routes    : inventaire route/écran -> table -> fonction(s) de contexte
//   - rlsStates : état RLS par table ∈ {Activée, Désactivée, Indéterminée}
//   - findings  : écarts avec sévérité ∈ {Critique, Élevée, Moyenne, Faible}

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

// Tables financières auditées (Exigence 2.1, 2.4).
export const FINANCIAL_TABLES = [
  'wallets',
  'transactions',
  'expenses',
  'loans',
  'customers',
  'debts',
];

// Sévérités autorisées pour l'axe sécurité (ensemble fini, Exigence 2.2).
export const SECURITY_SEVERITIES = ['Critique', 'Élevée', 'Moyenne', 'Faible'];

// États RLS autorisés (ensemble fini, Exigence 2.4).
export const RLS_STATES = ['Activée', 'Désactivée', 'Indéterminée'];

// Cartographie attendue : table -> écran/onglet + fonctions de contexte qui
// traitent ses actions. Sert de référence à l'inventaire (Exigence 2.1) et à la
// détection des actions sans fonction de traitement (Exigence 2.2).
export const TABLE_CONTROLLER_MAP = {
  wallets: {
    screen: 'wallets',
    functions: ['createWallet', 'updateWallet', 'deleteWallet'],
  },
  transactions: {
    screen: 'transactions',
    functions: ['addTransaction', 'confirmDraft', 'deleteDraft'],
  },
  expenses: {
    screen: 'expenses',
    functions: ['addExpense'],
  },
  loans: {
    screen: 'loans',
    functions: ['createLoan', 'updateLoanStatus'],
  },
  // Les clients sont gérés depuis l'écran Transactions (pas d'onglet dédié).
  customers: {
    screen: 'transactions',
    functions: ['createCustomer', 'updateCustomer', 'findOrCreateCustomer'],
  },
  debts: {
    screen: 'debts',
    functions: ['createDebt', 'updateDebtStatus'],
  },
};

// ---------------------------------------------------------------------------
// Fonctions pures d'analyse
// ---------------------------------------------------------------------------

/**
 * Détecte les écrans/onglets déclarés dans `App.jsx` via les `case '<tab>':`
 * du sélecteur `renderActiveTab`.
 * @param {string|null} appJsxSource
 * @returns {string[]} identifiants d'écran détectés
 */
export function detectScreens(appJsxSource) {
  if (typeof appJsxSource !== 'string' || appJsxSource.length === 0) return [];
  const screens = new Set();
  const re = /case\s+'([a-zA-Z0-9_-]+)'\s*:/g;
  let m;
  while ((m = re.exec(appJsxSource)) !== null) {
    screens.add(m[1]);
  }
  return [...screens];
}

/**
 * Détecte les fonctions de contexte définies dans `AppContext.jsx`
 * (`const <name> = ` / `const <name> = async`).
 * @param {string|null} appContextSource
 * @returns {Set<string>} noms de fonctions détectés
 */
export function detectContextFunctions(appContextSource) {
  const found = new Set();
  if (typeof appContextSource !== 'string' || appContextSource.length === 0) {
    return found;
  }
  const re = /const\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?\(/g;
  let m;
  while ((m = re.exec(appContextSource)) !== null) {
    found.add(m[1]);
  }
  return found;
}

/**
 * Détermine l'état RLS de chaque table à partir du SQL de schéma.
 * - `ENABLE ROW LEVEL SECURITY` présent -> Activée
 * - table créée mais sans activation RLS -> Désactivée
 * - schéma illisible ou table absente -> Indéterminée
 * @param {string|null} schemaSql
 * @param {string[]} [tables]
 * @returns {Record<string, 'Activée'|'Désactivée'|'Indéterminée'>}
 */
export function detectRlsStates(schemaSql, tables = FINANCIAL_TABLES) {
  const states = {};
  const readable = typeof schemaSql === 'string' && schemaSql.length > 0;

  for (const table of tables) {
    if (!readable) {
      states[table] = 'Indéterminée';
      continue;
    }
    const enableRe = new RegExp(
      `ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
      'i'
    );
    const createRe = new RegExp(
      `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${table}\\b`,
      'i'
    );

    if (enableRe.test(schemaSql)) {
      states[table] = 'Activée';
    } else if (createRe.test(schemaSql)) {
      states[table] = 'Désactivée';
    } else {
      states[table] = 'Indéterminée';
    }
  }
  return states;
}

/**
 * Construit l'inventaire route/écran -> table -> fonction(s) de contexte.
 * @param {string[]} screens écrans détectés dans App.jsx
 * @param {Set<string>} contextFns fonctions détectées dans AppContext.jsx
 * @param {string[]} [tables]
 * @returns {Array<object>} entrées d'inventaire
 */
export function buildRouteInventory(screens, contextFns, tables = FINANCIAL_TABLES) {
  const screenSet = new Set(screens || []);
  return tables.map((table) => {
    const spec = TABLE_CONTROLLER_MAP[table] || { screen: null, functions: [] };
    const functions = spec.functions.map((name) => ({
      name,
      present: contextFns.has(name),
    }));
    const handledCount = functions.filter((f) => f.present).length;
    return {
      table,
      screen: spec.screen,
      route: spec.screen ? `/app/${spec.screen}` : '/app',
      screenPresent: spec.screen ? screenSet.has(spec.screen) : true,
      contextFunctions: functions,
      handled: handledCount > 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

function safeRead(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Audit de navigation / contrôleurs / sécurité (axe « securite »).
 *
 * @param {object} [options]
 * @param {string|null} [options.appJsxSource]      source de src/App.jsx (injectable)
 * @param {string|null} [options.appContextSource]  source de src/context/AppContext.jsx (injectable)
 * @param {string|null} [options.schemaSql]         source de supabase_schema.sql (injectable)
 * @param {string[]}    [options.tables]            liste de tables à auditer
 * @returns {{ axe: 'securite', findings: object[], rlsStates: object, routes: object[] }}
 */
export function auditSecurity(options = {}) {
  const tables = options.tables || FINANCIAL_TABLES;

  const appJsxSource =
    options.appJsxSource !== undefined
      ? options.appJsxSource
      : safeRead(path.join(ROOT, 'src', 'App.jsx'));
  const appContextSource =
    options.appContextSource !== undefined
      ? options.appContextSource
      : safeRead(path.join(ROOT, 'src', 'context', 'AppContext.jsx'));
  const schemaSql =
    options.schemaSql !== undefined
      ? options.schemaSql
      : safeRead(path.join(ROOT, 'supabase_schema.sql'));

  const findings = [];

  // --- Inventaire navigation/contrôleurs (Exigence 2.1) ---
  const screens = detectScreens(appJsxSource);
  const contextFns = detectContextFunctions(appContextSource);
  const routes = buildRouteInventory(screens, contextFns, tables);

  // Signalement des sources illisibles (n'interrompt pas les autres axes, R2.6).
  if (appContextSource === null) {
    findings.push({
      file: 'src/context/AppContext.jsx',
      severity: 'Élevée',
      description:
        "Fichier de contexte illisible : impossible de vérifier les fonctions de traitement des routes.",
    });
  }
  if (appJsxSource === null) {
    findings.push({
      file: 'src/App.jsx',
      severity: 'Moyenne',
      description:
        "Fichier de navigation illisible : impossible de vérifier la présence des écrans d'opération financière.",
    });
  }

  // --- Routes sans fonction de traitement (Exigence 2.2) ---
  for (const entry of routes) {
    if (appContextSource === null) break; // déjà signalé, pas de faux positifs
    const missing = entry.contextFunctions.filter((f) => !f.present);
    if (missing.length > 0) {
      const totalActions = entry.contextFunctions.length;
      // Aucune fonction de traitement -> Critique ; sinon couverture partielle -> Élevée.
      const severity = missing.length === totalActions ? 'Critique' : 'Élevée';
      findings.push({
        file: 'src/context/AppContext.jsx',
        route: entry.route,
        severity,
        description:
          `Route « ${entry.route} » (table ${entry.table}) : action(s) sans fonction de traitement ` +
          `correspondante dans le contexte (${missing.map((f) => f.name).join(', ')}).`,
      });
    }
    // Écran d'opération financière introuvable dans la navigation.
    if (appJsxSource !== null && entry.screen && !entry.screenPresent) {
      findings.push({
        file: 'src/App.jsx',
        route: entry.route,
        severity: 'Moyenne',
        description:
          `Écran « ${entry.screen} » rattaché à la table ${entry.table} introuvable dans la navigation (renderActiveTab).`,
      });
    }
  }

  // --- État RLS par table (Exigence 2.4, 2.5, 2.6) ---
  const rlsStates = detectRlsStates(schemaSql, tables);
  for (const table of tables) {
    const state = rlsStates[table];
    if (state === 'Désactivée') {
      // Table financière dépourvue de RLS -> Critique (Exigence 2.5).
      findings.push({
        file: 'supabase_schema.sql',
        table,
        severity: 'Critique',
        expected: 'RLS Activée',
        actual: 'RLS Désactivée',
        description: `La table « ${table} » est dépourvue de politique de sécurité au niveau des lignes (RLS).`,
      });
    } else if (state === 'Indéterminée') {
      // Impossible de déterminer l'état RLS -> Indéterminée + échec de vérification (Exigence 2.6).
      findings.push({
        file: 'supabase_schema.sql',
        table,
        severity: 'Moyenne',
        actual: 'RLS Indéterminée',
        description:
          `Échec de vérification de l'état RLS de la table « ${table} » ` +
          `(schéma illisible ou définition de table absente).`,
      });
    }
  }

  return {
    axe: 'securite',
    findings,
    rlsStates,
    routes,
  };
}

export default auditSecurity;
