// Module d'audit : cohérence du schéma de données
// Axe « schema » du Rapport_Audit (Exigence 3 : 3.1, 3.2, 3.3, 3.4, 3.5, 3.7
// ainsi que la gestion de fichier illisible 3.6).
//
// Ce module est volontairement constitué de fonctions PURES (analyse de chaînes
// sources) orchestrées par `auditSchema()`. Les trois sources comparées peuvent
// être injectées (testabilité, tâches 13.4 et 13.7) ou lues depuis les fichiers
// par défaut.
//
// Sources comparées pour la table `transactions` (Operation_Financiere) :
//   - src/context/AppContext.jsx        : champs d'opération manipulés par le code
//   - supabase_schema.sql               : schéma de référence (source de vérité)
//   - docs/03_Architecture/db_schema.md : documentation de schéma
//
// Sorties :
//   - findings         : écarts détectés (champ absent, FK orpheline, contrainte divergente, source illisible)
//   - fieldComparisons : résultat de correspondance explicite champ par champ (Ex. 3.1)
//   - summary          : { totalEcarts, verdict } (Ex. 3.7, Property 8)

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

// Chemins relatifs (au dépôt) consignés dans les findings.
export const APP_CONTEXT_REL = 'src/context/AppContext.jsx';
export const SCHEMA_SQL_REL = 'supabase_schema.sql';
export const DB_SCHEMA_DOC_REL = 'docs/03_Architecture/db_schema.md';

// Table d'opération auditée.
export const OPERATION_TABLE = 'transactions';

// Colonnes de référence de la table `transactions` (source de vérité :
// supabase_schema.sql). Sert d'univers de candidats lorsqu'une source de schéma
// est illisible et complète la détection des champs manipulés par le code.
export const REFERENCE_OPERATION_FIELDS = [
  'id',
  'type',
  'source_wallet_id',
  'dest_wallet_id',
  'customer_id',
  'source_amount',
  'dest_amount',
  'exchange_rate',
  'fee',
  'fee_wallet_id',
  'profit_usd',
  'status',
  'transaction_id',
  'receipt_text',
  'image_url',
  'note',
  'timestamp',
  'created_at',
];

// Clés étrangères d'opération à vérifier et table cible attendue (Ex. 3.3, 3.5).
export const FOREIGN_KEYS = [
  { field: 'source_wallet_id', expectedTable: 'wallets' },
  { field: 'dest_wallet_id', expectedTable: 'wallets' },
  { field: 'fee_wallet_id', expectedTable: 'wallets' },
  { field: 'customer_id', expectedTable: 'customers' },
];

// Contraintes de schéma attendues à comparer entre les deux sources (Ex. 3.4).
// `detect(source)` renvoie true si la contrainte est présente dans la source.
export const EXPECTED_CONSTRAINTS = [
  {
    id: 'source_amount_positif',
    expected: 'CHECK (source_amount > 0)',
    detect: (src) => /CHECK\s*\(\s*source_amount\s*>\s*0\s*\)/i.test(src),
  },
  {
    id: 'dest_amount_positif',
    expected: 'CHECK (dest_amount > 0)',
    detect: (src) => /CHECK\s*\(\s*dest_amount\s*>\s*0\s*\)/i.test(src),
  },
  {
    id: 'amount_positif',
    expected: 'CHECK (amount > 0)',
    detect: (src) => /CHECK\s*\(\s*amount\s*>\s*0\s*\)/i.test(src),
  },
  {
    id: 'fee_non_negatif',
    expected: 'CHECK (fee >= 0)',
    detect: (src) => /CHECK\s*\(\s*fee\s*>=\s*0\s*\)/i.test(src),
  },
  {
    id: 'status_completed_draft',
    expected: "CHECK (status IN ('completed', 'draft'))",
    // Présente si la contrainte autorise exactement l'ensemble {completed, draft}
    // (l'ordre des valeurs n'a pas d'importance).
    detect: (src) => {
      const m = src.match(/status\s+IN\s*\(([^)]*)\)/i);
      if (!m) return false;
      const values = (m[1].match(/'([^']+)'/g) || []).map((v) => v.replace(/'/g, ''));
      const set = new Set(values);
      return set.size === 2 && set.has('completed') && set.has('draft');
    },
  },
  {
    id: 'unique_currency_date',
    expected: 'UNIQUE (currency, date)',
    detect: (src) => /UNIQUE\s*\(\s*currency\s*,\s*date\s*\)/i.test(src),
  },
];

// ---------------------------------------------------------------------------
// Fonctions pures d'analyse
// ---------------------------------------------------------------------------

/**
 * Extrait le corps (entre parenthèses) du `CREATE TABLE <table>` d'une source
 * SQL, en équilibrant les parenthèses. `db_schema.md` embarquant des blocs SQL,
 * la même fonction s'applique au SQL et à la documentation.
 * @param {string|null} sql
 * @param {string} table
 * @returns {string|null} corps de la définition, ou null si absent / illisible
 */
export function extractCreateTableBlock(sql, table) {
  if (typeof sql !== 'string' || sql.length === 0) return null;
  const headRe = new RegExp(`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${table}\\b`, 'i');
  const head = headRe.exec(sql);
  if (!head) return null;

  const open = sql.indexOf('(', head.index);
  if (open === -1) return null;

  let depth = 0;
  for (let i = open; i < sql.length; i += 1) {
    const ch = sql[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return sql.slice(open + 1, i);
    }
  }
  return null;
}

/**
 * Liste les noms de colonnes déclarés dans un corps de `CREATE TABLE`.
 * Ignore les lignes de contrainte (CONSTRAINT/PRIMARY/FOREIGN/UNIQUE/CHECK) et
 * les commentaires SQL en ligne (`--`).
 * @param {string|null} block
 * @returns {Set<string>}
 */
export function parseTableColumns(block) {
  const columns = new Set();
  if (typeof block !== 'string' || block.length === 0) return columns;

  const SKIP = /^(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK)\b/i;
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.split('--')[0].trim().replace(/,$/, '');
    if (!line || SKIP.test(line)) continue;
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (m) columns.add(m[1]);
  }
  return columns;
}

/**
 * Détecte les champs d'opération réellement manipulés dans le code du contexte
 * applicatif : un champ candidat est « manipulé » s'il apparaît comme
 * identifiant dans la source.
 * @param {string|null} appContextSource
 * @param {string[]} candidateFields
 * @returns {string[]}
 */
export function detectManipulatedFields(appContextSource, candidateFields) {
  if (typeof appContextSource !== 'string' || appContextSource.length === 0) return [];
  return candidateFields.filter((field) => {
    const re = new RegExp(`\\b${field}\\b`);
    return re.test(appContextSource);
  });
}

/**
 * Indique si une table est définie (CREATE TABLE) dans la source SQL.
 * @param {string|null} sql
 * @param {string} table
 * @returns {boolean}
 */
export function tableExists(sql, table) {
  if (typeof sql !== 'string' || sql.length === 0) return false;
  const re = new RegExp(`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${table}\\b`, 'i');
  return re.test(sql);
}

/**
 * Construit la table champ -> table référencée pour les clés étrangères d'un
 * corps de `CREATE TABLE` (clause `REFERENCES <table>`).
 * @param {string|null} block
 * @returns {Record<string, string>}
 */
export function parseForeignKeyTargets(block) {
  const targets = {};
  if (typeof block !== 'string' || block.length === 0) return targets;

  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.split('--')[0].trim();
    const col = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
    const ref = line.match(/REFERENCES\s+([a-zA-Z_][a-zA-Z0-9_]*)/i);
    if (col && ref) targets[col[1]] = ref[1];
  }
  return targets;
}

/**
 * Calcule le récapitulatif de l'audit de schéma (Ex. 3.7, Property 8).
 * Le total d'écarts est égal au cardinal de l'ensemble des findings ; le verdict
 * est `cohérent` si et seulement si ce total vaut 0.
 * @param {Array} findings
 * @returns {{ totalEcarts: number, verdict: 'cohérent'|'incohérent' }}
 */
export function summarizeFindings(findings) {
  const totalEcarts = Array.isArray(findings) ? findings.length : 0;
  return {
    totalEcarts,
    verdict: totalEcarts === 0 ? 'cohérent' : 'incohérent',
  };
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
 * Audit de cohérence du schéma (axe « schema »).
 *
 * Toute source illisible (introuvable / erreur de lecture) interrompt uniquement
 * la comparaison qui en dépend, consigne une erreur dans les findings et laisse
 * les autres vérifications se poursuivre (Ex. 3.6).
 *
 * @param {object} [options]
 * @param {string|null} [options.appContextSource] source de src/context/AppContext.jsx (injectable)
 * @param {string|null} [options.schemaSql]        source de supabase_schema.sql (injectable)
 * @param {string|null} [options.dbSchemaDoc]      source de docs/03_Architecture/db_schema.md (injectable)
 * @returns {{ axe: 'schema', findings: object[], fieldComparisons: object[], summary: object }}
 */
export function auditSchema(options = {}) {
  const appContextSource =
    options.appContextSource !== undefined
      ? options.appContextSource
      : safeRead(path.join(ROOT, 'src', 'context', 'AppContext.jsx'));
  const schemaSql =
    options.schemaSql !== undefined
      ? options.schemaSql
      : safeRead(path.join(ROOT, 'supabase_schema.sql'));
  const dbSchemaDoc =
    options.dbSchemaDoc !== undefined
      ? options.dbSchemaDoc
      : safeRead(path.join(ROOT, 'docs', '03_Architecture', 'db_schema.md'));

  const findings = [];
  const fieldComparisons = [];

  // Signalement des sources illisibles (Ex. 3.6) : l'audit dépendant est
  // interrompu, mais les autres se poursuivent.
  if (appContextSource === null) {
    findings.push({
      file: APP_CONTEXT_REL,
      severity: 'majeur',
      description:
        "Fichier source illisible : impossible de déterminer les champs d'opération manipulés ; comparaison des champs interrompue.",
    });
  }
  if (schemaSql === null) {
    findings.push({
      file: SCHEMA_SQL_REL,
      severity: 'majeur',
      description:
        "Schéma de référence illisible : comparaison des champs, vérification des clés étrangères et des contraintes côté SQL interrompues.",
    });
  }
  if (dbSchemaDoc === null) {
    findings.push({
      file: DB_SCHEMA_DOC_REL,
      severity: 'majeur',
      description:
        "Documentation de schéma illisible : comparaison des champs et des contraintes côté documentation interrompue.",
    });
  }

  // Colonnes définies dans chaque source de schéma.
  const sqlBlock = extractCreateTableBlock(schemaSql, OPERATION_TABLE);
  const docBlock = extractCreateTableBlock(dbSchemaDoc, OPERATION_TABLE);
  const sqlColumns = parseTableColumns(sqlBlock);
  const docColumns = parseTableColumns(docBlock);

  // --- Correspondance champ par champ (Ex. 3.1, 3.2) ---
  // Univers de candidats : colonnes des deux schémas + colonnes de référence.
  const candidateFields = [
    ...new Set([...sqlColumns, ...docColumns, ...REFERENCE_OPERATION_FIELDS]),
  ];
  const manipulatedFields = detectManipulatedFields(appContextSource, candidateFields);

  for (const field of manipulatedFields) {
    const inSql = schemaSql === null ? null : sqlColumns.has(field);
    const inDoc = dbSchemaDoc === null ? null : docColumns.has(field);

    // Statut de correspondance explicite (Ex. 3.1).
    const known = [inSql, inDoc].filter((v) => v !== null);
    const presentEverywhere = known.length > 0 && known.every((v) => v === true);
    fieldComparisons.push({
      field,
      inAppContext: true,
      inSchemaSql: inSql,
      inDbSchemaDoc: inDoc,
      status: presentEverywhere
        ? 'présent dans les deux sources'
        : "absent d'au moins une source",
    });

    // Écart : champ manipulé absent d'une source de schéma lisible (Ex. 3.2).
    if (inSql === false) {
      findings.push({
        file: APP_CONTEXT_REL,
        reference: SCHEMA_SQL_REL,
        field,
        severity: 'majeur',
        description:
          `Le champ d'opération « ${field} » est manipulé dans ${APP_CONTEXT_REL} ` +
          `mais absent des colonnes définies dans ${SCHEMA_SQL_REL}.`,
      });
    }
    if (inDoc === false) {
      findings.push({
        file: APP_CONTEXT_REL,
        reference: DB_SCHEMA_DOC_REL,
        field,
        severity: 'majeur',
        description:
          `Le champ d'opération « ${field} » est manipulé dans ${APP_CONTEXT_REL} ` +
          `mais absent des colonnes définies dans ${DB_SCHEMA_DOC_REL}.`,
      });
    }
  }

  // --- Vérification des clés étrangères (Ex. 3.3, 3.5) ---
  if (schemaSql !== null) {
    const fkTargets = parseForeignKeyTargets(sqlBlock);
    for (const { field, expectedTable } of FOREIGN_KEYS) {
      const target = fkTargets[field];
      if (target === undefined) continue; // FK non déclarée dans le schéma : hors périmètre 3.5
      if (!tableExists(schemaSql, target)) {
        findings.push({
          file: SCHEMA_SQL_REL,
          field,
          severity: 'critique',
          expected: `référence vers la table « ${expectedTable} »`,
          actual: `référence vers la table « ${target} » (inexistante)`,
          description:
            `La clé étrangère d'opération « ${field} » référence la table « ${target} » ` +
            `qui n'est définie dans aucun CREATE TABLE de ${SCHEMA_SQL_REL}.`,
        });
      }
    }
  }

  // --- Comparaison des contraintes entre les deux sources de schéma (Ex. 3.4) ---
  if (schemaSql !== null && dbSchemaDoc !== null) {
    for (const constraint of EXPECTED_CONSTRAINTS) {
      const inSql = constraint.detect(schemaSql);
      const inDoc = constraint.detect(dbSchemaDoc);
      if (inSql && inDoc) continue; // présente et cohérente dans les deux sources

      let divergentSource;
      if (!inSql && !inDoc) divergentSource = `${SCHEMA_SQL_REL} et ${DB_SCHEMA_DOC_REL}`;
      else if (!inSql) divergentSource = SCHEMA_SQL_REL;
      else divergentSource = DB_SCHEMA_DOC_REL;

      findings.push({
        file: divergentSource,
        constraint: constraint.id,
        severity: 'majeur',
        expected: constraint.expected,
        description:
          `Contrainte de schéma « ${constraint.expected} » absente ou divergente ` +
          `(manquante dans : ${divergentSource}).`,
      });
    }
  }

  return {
    axe: 'schema',
    findings,
    fieldComparisons,
    summary: summarizeFindings(findings),
  };
}

export default auditSchema;
