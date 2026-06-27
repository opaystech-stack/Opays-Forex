// Module d'audit : recensement des erreurs financières non gérées
// (axe « erreurs » du Rapport_Audit — Exigence 4.7).
//
// Contrairement à `calculationsAudit.js` (13.1) qui scanne `finance.js` + le
// périmètre financier d'`AppContext.jsx` pour décider si un cas d'erreur est
// pris en charge côté logique métier, ce module CIBLE la couverture UI/agents
// (`src/pages/Transactions.jsx`) et la COHÉRENCE GLOBALE entre la couche UI et
// la couche contexte. Il recense, pour chaque cas d'erreur financière (fonds
// insuffisants, montant invalide, portefeuilles identiques, doublon,
// dépassement de délai/timeout) :
//   - s'il est pris en charge dans `Transactions.jsx` (UI/agents) ;
//   - s'il est pris en charge dans `AppContext.jsx` (contexte) ;
//   - sa localisation (fichier + ligne approximative) et son type.
//
// Findings produits :
//   1. Cas non géré nulle part (UI ni contexte) → finding à la sévérité du cas.
//   2. Cas géré côté contexte mais NON couvert au niveau UI/agents alors qu'il
//      l'est attendu → finding « mineur » de cohérence (la remontée du message
//      à l'Opérateur doit être vérifiée).
//   3. Fichier source illisible → erreur consignée, recensement de ce fichier
//      interrompu sans produire de faux « non géré ».
//
// Toutes les entrées (textes sources, cas d'erreur) sont injectables pour la
// testabilité (tâche 13.7). Sans injection, le module lit les fichiers réels.
//
// Réutilise les helpers exportés par `calculationsAudit.js` (`locateLine`,
// `APP_CONTEXT_REL`) afin de ne pas dupliquer la logique de localisation.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { locateLine, APP_CONTEXT_REL } from './calculationsAudit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');

// Chemins relatifs (consignés dans les findings) et absolus (lecture par défaut).
export const TRANSACTIONS_REL = 'src/pages/Transactions.jsx';
export { APP_CONTEXT_REL };
const TRANSACTIONS_PATH = path.join(PROJECT_ROOT, TRANSACTIONS_REL);
const APP_CONTEXT_PATH = path.join(PROJECT_ROOT, APP_CONTEXT_REL);

// Ancres de localisation des points d'entrée par couche.
const UI_ENTRY_ANCHOR = /const handleSubmit\s*=/;
const UI_AGENT_ANCHOR = /const (processAudioWithGemini|processImageWithGemini)\s*=/;
const CONTEXT_ENTRY_ANCHOR = /const (prepareTransaction|addTransaction)\s*=/;

// Cas d'erreur financière recensés (Ex. 4.7). Pour chacun :
//  - `uiPatterns`      : motifs de prise en charge attendus dans Transactions.jsx ;
//  - `contextPatterns` : motifs de prise en charge attendus dans AppContext.jsx ;
//  - `uiExpected`      : la couche UI/agents est-elle censée couvrir ce cas ?
//  - `contextExpected` : la couche contexte est-elle censée couvrir ce cas ?
//  - `primaryLayer`    : couche de référence pour localiser un cas non géré ;
//  - `uiAnchor`        : ancre UI utilisée pour la localisation (défaut : handleSubmit).
export const DEFAULT_ERROR_CASES = [
  {
    type: 'fonds_insuffisants',
    severity: 'critique',
    label: 'Fonds insuffisants',
    uiExpected: true,
    contextExpected: true,
    primaryLayer: 'context',
    uiPatterns: [/fonds?\s+insuffisant/i, /solde\s+disponible/i, /insufficient/i],
    contextPatterns: [/fonds?\s+insuffisant/i, /solde\s+disponible/i, /applyBalances/, /insufficient/i],
  },
  {
    type: 'montant_invalide',
    severity: 'majeur',
    label: 'Montant invalide',
    uiExpected: true,
    contextExpected: true,
    primaryLayer: 'context',
    uiPatterns: [/validateAmount/, /montant\s+invalide/i, /\bisNaN\b/, /0[.,]01/, /999[\s ]?999[\s ]?999/],
    contextPatterns: [/validateAmount/, /montant\s+invalide/i],
  },
  {
    type: 'portefeuilles_identiques',
    severity: 'majeur',
    label: 'Portefeuilles source et destination identiques',
    uiExpected: true,
    contextExpected: true,
    primaryLayer: 'context',
    uiPatterns: [
      /sourceWalletId\s*===\s*destWalletId/,
      /portefeuille.*(différent|distinct)/i,
      /ensureDistinctWallets/,
    ],
    contextPatterns: [/ensureDistinctWallets/, /portefeuilles?\s+distinct/i, /source_wallet_id\s*===\s*dest_wallet_id/],
  },
  {
    type: 'doublon',
    severity: 'critique',
    label: 'Doublon par transaction_id réseau',
    uiExpected: true,
    contextExpected: true,
    primaryLayer: 'context',
    uiPatterns: [/detectDuplicate/, /doublon/i, /\bduplicate\b/i, /confirmDuplicate/],
    contextPatterns: [/detectDuplicate/, /doublon/i, /\bduplicate\b/i],
  },
  {
    type: 'delai',
    severity: 'majeur',
    label: 'Dépassement de délai (timeout) du Gemini_Proxy',
    // Le timeout est un sujet UI/agents : les appels au Gemini_Proxy sont
    // déclenchés depuis Transactions.jsx, pas depuis AppContext.jsx.
    uiExpected: true,
    contextExpected: false,
    primaryLayer: 'ui',
    uiAnchor: UI_AGENT_ANCHOR,
    uiPatterns: [/callGeminiWithTimeout/, /AbortController/, /Promise\.race/, /\btimeout\b/i, /délai/i],
    contextPatterns: [],
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

// Cherche, dans `source`, le premier motif pris en charge et sa ligne.
function locateHandling(patterns, source) {
  if (typeof source !== 'string' || !source || !Array.isArray(patterns)) {
    return { handled: false, line: undefined };
  }
  for (const pattern of patterns) {
    if (pattern.test(source)) {
      return { handled: true, line: locateLine(source, pattern) };
    }
  }
  return { handled: false, line: undefined };
}

/**
 * Audit de recensement des erreurs financières non gérées (axe « erreurs »).
 *
 * @param {object} [options]
 * @param {string|null} [options.transactionsSource] Texte de Transactions.jsx (défaut : lecture disque).
 * @param {string|null} [options.appContextSource]   Texte d'AppContext.jsx (défaut : lecture disque).
 * @param {Array}  [options.errorCases]              Cas d'erreur financière à recenser.
 * @returns {Promise<{ axe: 'erreurs', findings: Array, coverage: Array }>}
 */
export async function auditErrors(options = {}) {
  const errorCases = options.errorCases || DEFAULT_ERROR_CASES;

  const uiSource = options.transactionsSource !== undefined
    ? options.transactionsSource
    : await safeRead(TRANSACTIONS_PATH);
  const contextSource = options.appContextSource !== undefined
    ? options.appContextSource
    : await safeRead(APP_CONTEXT_PATH);

  const uiReadable = typeof uiSource === 'string';
  const contextReadable = typeof contextSource === 'string';

  const findings = [];
  const coverage = [];

  // Signalement des sources illisibles (n'interrompt pas les autres axes, R2.6/3.6).
  if (!uiReadable) {
    findings.push({
      file: TRANSACTIONS_REL,
      severity: 'majeur',
      description:
        'Fichier source illisible (src/pages/Transactions.jsx) : recensement de la couverture UI/agents interrompu.',
    });
  }
  if (!contextReadable) {
    findings.push({
      file: APP_CONTEXT_REL,
      severity: 'majeur',
      description:
        "Fichier source illisible (src/context/AppContext.jsx) : recensement de la prise en charge côté contexte interrompu.",
    });
  }

  // Localisation des points d'entrée (lignes approximatives) par couche.
  const contextEntryLine = locateLine(contextSource, CONTEXT_ENTRY_ANCHOR);

  for (const errorCase of errorCases) {
    const uiAnchor = errorCase.uiAnchor || UI_ENTRY_ANCHOR;
    const uiEntryLine = locateLine(uiSource, uiAnchor);

    const ui = locateHandling(errorCase.uiPatterns, uiSource);
    const ctx = locateHandling(errorCase.contextPatterns, contextSource);

    const uiExpected = errorCase.uiExpected !== false;
    const contextExpected = errorCase.contextExpected !== false;

    const locations = [];
    if (ui.handled) locations.push({ file: TRANSACTIONS_REL, line: ui.line, layer: 'ui' });
    if (ctx.handled) locations.push({ file: APP_CONTEXT_REL, line: ctx.line, layer: 'context' });

    // Couverture globale : pris en charge dans au moins une couche attendue.
    const handledGlobally =
      (uiExpected && ui.handled) || (contextExpected && ctx.handled);

    coverage.push({
      type: errorCase.type,
      label: errorCase.label,
      severity: errorCase.severity,
      uiExpected,
      contextExpected,
      handledInUi: ui.handled,
      handledInContext: ctx.handled,
      handledGlobally,
      locations,
    });

    // Lisibilité des couches attendues : si une couche attendue est illisible,
    // on ne peut pas conclure « non géré » sans risque de faux positif
    // (l'erreur de fichier illisible a déjà été consignée ci-dessus).
    const expectedLayersReadable =
      (!uiExpected || uiReadable) && (!contextExpected || contextReadable);

    // 1) Cas non géré nulle part (ni UI ni contexte attendu) — cœur de R4.7.
    if (expectedLayersReadable && !handledGlobally) {
      const primaryIsUi = errorCase.primaryLayer === 'ui';
      findings.push({
        file: primaryIsUi ? TRANSACTIONS_REL : APP_CONTEXT_REL,
        line: primaryIsUi ? uiEntryLine : contextEntryLine,
        severity: errorCase.severity,
        type: errorCase.type,
        description:
          `Cas d'erreur financière non géré : ${errorCase.label} ` +
          "(aucune prise en charge détectée ni au niveau UI/agents (Transactions.jsx) " +
          "ni au niveau contexte (AppContext.jsx)).",
      });
      continue;
    }

    // 2) Cohérence UI/agents : cas pris en charge ailleurs mais NON couvert au
    //    niveau UI/agents alors qu'il est attendu. Sévérité « mineur » car la
    //    cohérence globale reste assurée par la couche contexte.
    if (uiExpected && uiReadable && !ui.handled && handledGlobally) {
      findings.push({
        file: TRANSACTIONS_REL,
        line: uiEntryLine,
        severity: 'mineur',
        type: errorCase.type,
        description:
          `Cas d'erreur financière non couvert au niveau UI/agents (Transactions.jsx) : ${errorCase.label}. ` +
          "Pris en charge côté contexte (AppContext.jsx) ; vérifier la remontée explicite du message à l'Opérateur.",
      });
    }
  }

  return { axe: 'erreurs', findings, coverage };
}

export default auditErrors;
