// Tests d'exemple des modules d'audit (tâche 13.7).
//
// Stratégie : tests PAR EXEMPLES sur des ENTRÉES CONSTRUITES injectées dans
// chaque module d'audit (toutes les sources / le module financier sont
// injectables). On vérifie les findings attendus (sévérité, fichier, type,
// états RLS, verdict de schéma) ainsi que la robustesse face à un fichier
// source illisible (l'audit concerné est interrompu et l'erreur consignée,
// les autres axes se poursuivent).
//
// Requirements : 1.12, 2.2, 2.6, 3.1, 3.2, 3.6, 4.7

import { afterAll, describe, expect, it } from 'vitest';
import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  auditCalculations,
  SEVERITY_BY_KIND,
  FINANCE_REL,
  APP_CONTEXT_REL,
} from './calculationsAudit.js';
import { auditSecurity } from './securityAudit.js';
import {
  auditSchema,
  APP_CONTEXT_REL as SCHEMA_APP_CONTEXT_REL,
  SCHEMA_SQL_REL,
} from './schemaAudit.js';
import { auditErrors, TRANSACTIONS_REL } from './errorsAudit.js';
import { runAllAudits, generateAuditReport } from './runAudit.js';

// ---------------------------------------------------------------------------
// Axe « calculs » — auditCalculations (Ex. 1.12, 4.7)
// ---------------------------------------------------------------------------
describe('auditCalculations', () => {
  // Source finance.js minimale permettant la localisation des lignes (anchors).
  const financeSource = [
    'export const computeExchangeRate = () => {};', // ligne 1
    'export const applyBalances = () => {};', // ligne 2
  ].join('\n');

  it('produit des findings de calcul avec les sévérités attendues pour un finance bogué', async () => {
    const calcCases = [
      {
        id: 'solde-bogue',
        kind: 'solde',
        fn: 'applyBalances',
        description: 'solde attendu non respecté',
        expected: 1100,
        run: () => 999, // valeur fausse (écart > 0,01)
      },
      {
        id: 'taux-bogue',
        kind: 'taux',
        fn: 'computeExchangeRate',
        description: 'taux attendu non respecté',
        expected: 3650,
        run: () => 3000, // valeur fausse
      },
    ];

    const { axe, findings } = await auditCalculations({
      financeSource,
      appContextSource: 'source applicative neutre', // chaîne lisible -> pas de finding "illisible"
      calcCases,
      errorCases: [], // on isole les écarts de calcul
    });

    expect(axe).toBe('calculs');
    expect(findings).toHaveLength(2);

    const solde = findings.find((f) => /solde/.test(f.description));
    const taux = findings.find((f) => /taux/.test(f.description));

    expect(solde.severity).toBe(SEVERITY_BY_KIND.solde); // 'critique'
    expect(solde.file).toBe(FINANCE_REL);
    expect(solde.line).toBe(2);
    expect(solde.expected).toBe('1100');
    expect(solde.actual).toBe('999');

    expect(taux.severity).toBe(SEVERITY_BY_KIND.taux); // 'majeur'
    expect(taux.line).toBe(1);
  });

  it("ne produit aucun finding de calcul lorsque le module financier est correct", async () => {
    // finance correct = module réel (non injecté) confronté aux cas par défaut.
    const { findings } = await auditCalculations({
      appContextSource: 'source applicative neutre', // lisible
      errorCases: [], // on isole l'axe calculs
    });

    expect(findings).toHaveLength(0);
  });

  it('consigne le cas du fichier illisible (source null) sans planter (Ex. 2.6/3.6)', async () => {
    const { findings } = await auditCalculations({
      financeSource: null,
      appContextSource: null, // illisible -> recensement des erreurs interrompu + consigné
      calcCases: [], // pas d'écart de calcul -> seul le finding "illisible" subsiste
    });

    expect(findings).toHaveLength(1);
    expect(findings[0].file).toBe(APP_CONTEXT_REL);
    expect(findings[0].severity).toBe('majeur');
    expect(findings[0].description).toMatch(/illisible/i);
  });
});

// ---------------------------------------------------------------------------
// Axe « securite » — auditSecurity (Ex. 2.2, 2.4, 2.5, 2.6)
// ---------------------------------------------------------------------------
describe('auditSecurity', () => {
  // Contexte/navigation complets pour la table wallets : évite tout bruit de
  // route afin d'isoler la vérification RLS.
  const appContextSource = [
    'const createWallet = (data) => {};',
    'const updateWallet = (data) => {};',
    'const deleteWallet = (id) => {};',
  ].join('\n');
  const appJsxSource = "case 'wallets': return <Wallets/>;";

  it('classe Critique une table financière sans RLS', () => {
    const schemaSql = 'CREATE TABLE wallets ( id uuid PRIMARY KEY );';

    const { axe, findings, rlsStates } = auditSecurity({
      appJsxSource,
      appContextSource,
      schemaSql,
      tables: ['wallets'],
    });

    expect(axe).toBe('securite');
    expect(rlsStates.wallets).toBe('Désactivée');
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('Critique');
    expect(findings[0].table).toBe('wallets');
    expect(findings[0].file).toBe('supabase_schema.sql');
  });

  it("ne produit aucun finding lorsque la RLS est activée", () => {
    const schemaSql = [
      'CREATE TABLE wallets ( id uuid PRIMARY KEY );',
      'ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;',
    ].join('\n');

    const { findings, rlsStates } = auditSecurity({
      appJsxSource,
      appContextSource,
      schemaSql,
      tables: ['wallets'],
    });

    expect(rlsStates.wallets).toBe('Activée');
    expect(findings).toHaveLength(0);
  });

  it('renvoie un état Indéterminée lorsque le schéma est illisible (null)', () => {
    const { findings, rlsStates } = auditSecurity({
      appJsxSource,
      appContextSource,
      schemaSql: null, // illisible
      tables: ['wallets'],
    });

    expect(rlsStates.wallets).toBe('Indéterminée');
    const indetermine = findings.find((f) => f.actual === 'RLS Indéterminée');
    expect(indetermine).toBeDefined();
    expect(indetermine.severity).toBe('Moyenne');
  });
});

// ---------------------------------------------------------------------------
// Axe « schema » — auditSchema (Ex. 3.1, 3.2, 3.3, 3.5, 3.6, 3.7)
// ---------------------------------------------------------------------------
describe('auditSchema', () => {
  // Schéma cohérent : transactions complète, FK vers tables existantes, et
  // toutes les contraintes attendues présentes dans les deux sources.
  const coherentSchema = [
    'CREATE TABLE wallets ( id uuid PRIMARY KEY );',
    'CREATE TABLE customers ( id uuid PRIMARY KEY );',
    'CREATE TABLE transactions (',
    '  id uuid PRIMARY KEY,',
    '  type text,',
    '  source_wallet_id uuid REFERENCES wallets,',
    '  customer_id uuid REFERENCES customers,',
    '  source_amount numeric CHECK (source_amount > 0),',
    '  dest_amount numeric CHECK (dest_amount > 0),',
    '  amount numeric CHECK (amount > 0),',
    '  fee numeric CHECK (fee >= 0),',
    "  status text CHECK (status IN ('completed', 'draft')),",
    '  UNIQUE (currency, date)',
    ');',
  ].join('\n');

  it("signale un écart lorsqu'un champ manipulé est absent d'une source", () => {
    // Schéma sans la colonne « note », alors que le code la manipule.
    const schemaSql = [
      'CREATE TABLE transactions (',
      '  id uuid PRIMARY KEY,',
      '  type text',
      ');',
    ].join('\n');
    const appContextSource = 'const h = (id, type, note) => ({ id, type, note });';

    const { findings } = auditSchema({
      appContextSource,
      schemaSql,
      dbSchemaDoc: schemaSql, // doc identique au SQL
    });

    const noteEcart = findings.find(
      (f) => f.field === 'note' && f.reference === SCHEMA_SQL_REL
    );
    expect(noteEcart).toBeDefined();
    expect(noteEcart.severity).toBe('majeur');
    expect(noteEcart.file).toBe(SCHEMA_APP_CONTEXT_REL);
  });

  it('classe critique une clé étrangère orpheline (table cible inexistante)', () => {
    const schemaSql = [
      'CREATE TABLE transactions (',
      '  id uuid PRIMARY KEY,',
      '  source_wallet_id uuid REFERENCES ghost_wallets',
      ');',
    ].join('\n');

    const { findings } = auditSchema({
      appContextSource: 'const h = (id) => id;',
      schemaSql,
      dbSchemaDoc: schemaSql,
    });

    const fkOrpheline = findings.find(
      (f) => f.field === 'source_wallet_id' && f.severity === 'critique'
    );
    expect(fkOrpheline).toBeDefined();
    expect(fkOrpheline.actual).toMatch(/ghost_wallets/);
  });

  it("rend le verdict 'cohérent' lorsque les sources concordent", () => {
    const { findings, summary } = auditSchema({
      appContextSource: 'const h = (id, type) => ({ id, type });',
      schemaSql: coherentSchema,
      dbSchemaDoc: coherentSchema,
    });

    expect(findings).toHaveLength(0);
    expect(summary.totalEcarts).toBe(0);
    expect(summary.verdict).toBe('cohérent');
  });

  it('consigne le fichier illisible et poursuit les autres vérifications (Ex. 3.6)', () => {
    const { findings, summary } = auditSchema({
      appContextSource: null, // illisible
      schemaSql: coherentSchema,
      dbSchemaDoc: coherentSchema,
    });

    const illisible = findings.find(
      (f) => f.file === SCHEMA_APP_CONTEXT_REL && /illisible/i.test(f.description)
    );
    expect(illisible).toBeDefined();
    expect(illisible.severity).toBe('majeur');
    expect(summary.verdict).toBe('incohérent');
  });
});

// ---------------------------------------------------------------------------
// Axe « erreurs » — auditErrors (Ex. 4.7, 2.6/3.6)
// ---------------------------------------------------------------------------
describe('auditErrors', () => {
  it('produit un finding pour un cas non géré (sources stub)', async () => {
    const errorCases = [
      {
        type: 'fonds_insuffisants',
        severity: 'critique',
        label: 'Fonds insuffisants',
        uiExpected: true,
        contextExpected: true,
        primaryLayer: 'context',
        uiPatterns: [/insufficient/i],
        contextPatterns: [/insufficient/i],
      },
    ];

    const { axe, findings, coverage } = await auditErrors({
      transactionsSource: '// stub UI sans prise en charge',
      appContextSource: '// stub contexte sans prise en charge',
      errorCases,
    });

    expect(axe).toBe('erreurs');
    const nonGere = findings.find((f) => f.type === 'fonds_insuffisants');
    expect(nonGere).toBeDefined();
    expect(nonGere.severity).toBe('critique');
    expect(nonGere.file).toBe(APP_CONTEXT_REL);
    expect(coverage[0].handledGlobally).toBe(false);
  });

  it("consigne une source illisible sans produire de faux 'non géré'", async () => {
    const { findings } = await auditErrors({
      transactionsSource: null, // illisible
      appContextSource: '// contexte lisible',
      errorCases: [], // on isole le signalement du fichier illisible
    });

    expect(findings).toHaveLength(1);
    expect(findings[0].file).toBe(TRANSACTIONS_REL);
    expect(findings[0].severity).toBe('majeur');
    expect(findings[0].description).toMatch(/illisible/i);
  });
});

// ---------------------------------------------------------------------------
// Runner — runAllAudits / generateAuditReport (agrégation des 4 axes)
// ---------------------------------------------------------------------------
describe('runAudit (agrégation)', () => {
  const tmpReport = path.join(os.tmpdir(), `rapport-audit-test-${process.pid}.md`);

  afterAll(async () => {
    await rm(tmpReport, { force: true });
  });

  it('agrège sans planter et renvoie les 5 axes', async () => {
    const results = await runAllAudits();
    expect(results).toHaveLength(5);
    expect(results.map((r) => r.axe)).toEqual([
      'calculs',
      'securite',
      'schema',
      'erreurs',
      'agentshield',
    ]);
    for (const result of results) {
      expect(Array.isArray(result.findings)).toBe(true);
    }
  });

  it('génère un rapport agrégé (4 axes) vers un chemin de sortie', async () => {
    const { outputPath, totalFindings, results } = await generateAuditReport({
      outputPath: tmpReport,
    });

    expect(outputPath).toBe(tmpReport);
    expect(typeof totalFindings).toBe('number');
    expect(results).toHaveLength(5);
  });
});
