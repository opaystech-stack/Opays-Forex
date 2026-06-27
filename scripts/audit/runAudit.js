// Script runner d'audit financier — génère `docs/Rapport_Audit.md`.
//
// Tâche 13.6 de la spec financial-ops-audit-voice-agent.
//
// Ce module Node ESM exécutable agrège les quatre axes d'audit :
//   - calculs  (scripts/audit/calculationsAudit.js → auditCalculations)
//   - securite (scripts/audit/securityAudit.js     → auditSecurity)
//   - schema   (scripts/audit/schemaAudit.js        → auditSchema)
//   - erreurs  (scripts/audit/errorsAudit.js        → auditErrors)
//
// Il écrit un livrable Markdown structuré (`docs/Rapport_Audit.md`) :
//   - un sommaire global (nombre de findings par axe, sévérité, verdict schéma) ;
//   - une section par axe listant chaque finding (fichier, ligne, sévérité,
//     valeur attendue vs constatée, description) ;
//   - le récapitulatif de l'axe schéma (totalEcarts + verdict).
//
// Robustesse (Ex. 2.6 / 3.6) : un fichier source illisible est déjà géré dans
// les modules (l'audit concerné consigne une erreur et se poursuit). Le runner
// encapsule en plus chaque axe dans un try/catch afin qu'une défaillance
// inattendue d'un axe n'empêche pas la production des autres ni la génération
// du rapport.
//
// Usage : `node scripts/audit/runAudit.js`  (ou `npm run audit`).

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditCalculations } from './calculationsAudit.js';
import { auditSecurity } from './securityAudit.js';
import { auditSchema } from './schemaAudit.js';
import { auditErrors } from './errorsAudit.js';
import { auditAgentShield } from './agentshieldAudit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const REPORT_REL = 'docs/Rapport_Audit.md';
const REPORT_PATH = path.join(PROJECT_ROOT, REPORT_REL);

// Libellés lisibles et ordre d'affichage des axes dans le rapport.
const AXIS_LABELS = {
  calculs: "Intégrité des calculs",
  securite: 'Navigation, contrôleurs et sécurité (RLS)',
  schema: 'Cohérence du schéma de données',
  erreurs: 'Recensement des erreurs financières non gérées',
  agentshield: 'Sécurité et intégrité opérationnelle (AgentShield)',
};
const AXIS_ORDER = ['calculs', 'securite', 'schema', 'erreurs', 'agentshield'];

// Exécute un axe d'audit en isolant ses éventuelles défaillances : si l'axe
// jette, on renvoie un résultat dégradé porteur d'un finding décrivant l'échec,
// sans interrompre les autres axes (Ex. 2.6 / 3.6).
async function runAxis(axe, runner) {
  try {
    const result = await runner();
    return { axe, ...result };
  } catch (error) {
    return {
      axe,
      findings: [
        {
          file: '(runner)',
          severity: 'majeur',
          description:
            `Échec inattendu de l'axe « ${axe} » : ${error && error.message ? error.message : String(error)}. ` +
            'Les autres axes ont été audités malgré cette défaillance.',
        },
      ],
    };
  }
}

// Échappe les caractères Markdown sensibles dans les cellules de tableau.
function escapeCell(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .trim();
}

// Construit le tableau Markdown des findings d'un axe.
function renderFindingsTable(findings) {
  if (!Array.isArray(findings) || findings.length === 0) {
    return '_Aucun écart détecté pour cet axe._\n';
  }

  const header =
    '| # | Fichier | Ligne | Sévérité | Attendu | Constaté | Description |\n' +
    '|---|---------|-------|----------|---------|----------|-------------|\n';

  const rows = findings
    .map((f, index) => {
      const cells = [
        String(index + 1),
        escapeCell(f.file),
        f.line !== undefined && f.line !== null ? String(f.line) : '—',
        escapeCell(f.severity),
        f.expected !== undefined ? escapeCell(f.expected) : '—',
        f.actual !== undefined ? escapeCell(f.actual) : '—',
        escapeCell(f.description),
      ];
      return `| ${cells.join(' | ')} |`;
    })
    .join('\n');

  return `${header}${rows}\n`;
}

// Construit la section Markdown complète d'un axe.
function renderAxisSection(result) {
  const label = AXIS_LABELS[result.axe] || result.axe;
  const findings = Array.isArray(result.findings) ? result.findings : [];

  let section = `## Axe « ${result.axe} » — ${label}\n\n`;
  section += `Nombre d'écarts : **${findings.length}**\n\n`;

  // Récapitulatif spécifique à l'axe schéma (Ex. 3.7).
  if (result.summary && typeof result.summary === 'object') {
    section += `**Récapitulatif schéma** : ${result.summary.totalEcarts} écart(s) — ` +
      `verdict **${result.summary.verdict}**.\n\n`;
  }

  section += renderFindingsTable(findings);
  section += '\n';
  return section;
}

// Agrège le décompte des sévérités tous axes confondus.
function countSeverities(results) {
  const counts = {};
  for (const result of results) {
    for (const finding of result.findings || []) {
      const sev = finding.severity || 'non spécifiée';
      counts[sev] = (counts[sev] || 0) + 1;
    }
  }
  return counts;
}

// Construit le sommaire global du rapport.
function renderSummary(results) {
  const totalFindings = results.reduce(
    (sum, r) => sum + (Array.isArray(r.findings) ? r.findings.length : 0),
    0
  );

  let summary = '## Sommaire global\n\n';
  summary += '| Axe | Écarts | Détail |\n';
  summary += '|-----|--------|--------|\n';

  for (const result of results) {
    const count = Array.isArray(result.findings) ? result.findings.length : 0;
    let detail = AXIS_LABELS[result.axe] || result.axe;
    if (result.summary && typeof result.summary === 'object') {
      detail += ` (verdict : ${result.summary.verdict})`;
    }
    summary += `| ${result.axe} | ${count} | ${escapeCell(detail)} |\n`;
  }

  summary += `| **Total** | **${totalFindings}** | Tous axes confondus |\n\n`;

  const severities = countSeverities(results);
  const severityKeys = Object.keys(severities);
  if (severityKeys.length > 0) {
    summary += 'Répartition par sévérité : ';
    summary += severityKeys
      .map((sev) => `${sev} : **${severities[sev]}**`)
      .join(' · ');
    summary += '\n\n';
  }

  return summary;
}

// Assemble le contenu Markdown complet du Rapport_Audit.
function buildReport(results) {
  const generatedAt = new Date().toISOString();

  let md = '# Rapport_Audit — Audit d\'intégrité financière\n\n';
  md += '> Livrable généré automatiquement par `scripts/audit/runAudit.js` ' +
    '(spec financial-ops-audit-voice-agent, tâche 13.6).\n\n';
  md += `_Généré le : ${generatedAt}_\n\n`;
  md += "Ce rapport agrège les quatre axes d'audit (calculs, sécurité, schéma, " +
    "erreurs). Chaque écart précise le fichier, la ligne, la sévérité, la valeur " +
    'attendue vs constatée et une description. Un fichier source illisible ' +
    "interrompt uniquement l'audit concerné : son erreur est consignée et les " +
    'autres axes se poursuivent.\n\n';

  md += renderSummary(results);
  md += '---\n\n';

  for (const result of results) {
    md += renderAxisSection(result);
  }

  return md;
}

/**
 * Exécute les quatre axes d'audit et renvoie leurs résultats agrégés (dans
 * l'ordre d'affichage). Chaque axe est isolé contre les défaillances.
 * @returns {Promise<Array>} résultats d'audit par axe
 */
export async function runAllAudits() {
  const byAxis = {
    calculs: await runAxis('calculs', () => auditCalculations()),
    securite: await runAxis('securite', async () => auditSecurity()),
    schema: await runAxis('schema', async () => auditSchema()),
    erreurs: await runAxis('erreurs', () => auditErrors()),
    agentshield: await runAxis('agentshield', async () => auditAgentShield()),
  };
  return AXIS_ORDER.map((axe) => byAxis[axe]);
}

/**
 * Génère le Rapport_Audit Markdown et l'écrit dans `docs/Rapport_Audit.md`.
 * @param {object} [options]
 * @param {string} [options.outputPath] chemin de sortie (défaut : docs/Rapport_Audit.md)
 * @returns {Promise<{ outputPath: string, totalFindings: number, results: Array }>}
 */
export async function generateAuditReport(options = {}) {
  const outputPath = options.outputPath || REPORT_PATH;
  const results = await runAllAudits();
  const markdown = buildReport(results);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, 'utf8');

  const totalFindings = results.reduce(
    (sum, r) => sum + (Array.isArray(r.findings) ? r.findings.length : 0),
    0
  );

  return { outputPath, totalFindings, results };
}

// Exécution directe en CLI : `node scripts/audit/runAudit.js`.
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  generateAuditReport()
    .then(({ outputPath, totalFindings, results }) => {
      const relPath = path.relative(PROJECT_ROOT, outputPath);
      console.log(`Rapport_Audit généré : ${relPath}`);
      for (const result of results) {
        const count = Array.isArray(result.findings) ? result.findings.length : 0;
        const extra = result.summary ? ` (verdict ${result.summary.verdict})` : '';
        console.log(`  - ${result.axe} : ${count} écart(s)${extra}`);
      }
      console.log(`Total : ${totalFindings} écart(s).`);
    })
    .catch((error) => {
      console.error('Échec de la génération du Rapport_Audit :', error);
      process.exitCode = 1;
    });
}

export default generateAuditReport;
