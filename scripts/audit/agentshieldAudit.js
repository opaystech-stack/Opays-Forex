// Module d'audit AgentShield : secrets, configurations, injections et vulnérabilités.
// Inspiré d'AgentShield de la suite ECC.
//
// Ce module scanne statiquement la base de code pour identifier les risques
// de sécurité majeures et produit des findings avec des sévérités adaptées.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

// Chemins et répertoires à ignorer lors de l'analyse récursive
const IGNORE_DIRS = [
  '.git',
  'node_modules',
  'dist',
  '.kiro',
  '.obsidian',
  '.vercel',
  '.vscode',
  'logo',
];

const IGNORE_FILES = [
  'package-lock.json',
  '.env', // Le fichier d'environnement local contient des secrets légitimes, on vérifie juste sa présence dans .gitignore
  'Rapport_Audit.md', // Ignorer le rapport d'audit pour éviter de détecter d'anciennes alertes
];

// Sévérités alignées avec celles de l'axe securite existant
const SEVERITIES = {
  CRITICAL: 'Critique',
  HIGH: 'Élevée',
  MEDIUM: 'Moyenne',
  LOW: 'Faible',
};

/**
 * Lit de manière récursive les fichiers d'un répertoire.
 * @param {string} dir Répertoire à parcourir.
 * @param {string[]} fileList Accumulateur de fichiers.
 * @returns {string[]} Liste des chemins de fichiers absolus.
 */
function walkFiles(dir, fileList = []) {
  const files = readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = statSync(filePath);

    if (stat.isDirectory()) {
      if (!IGNORE_DIRS.includes(file)) {
        walkFiles(filePath, fileList);
      }
    } else {
      if (!IGNORE_FILES.includes(file)) {
        fileList.push(filePath);
      }
    }
  }
  return fileList;
}

/**
 * Analyse un fichier ligne par ligne pour détecter des secrets.
 * @param {string} content Contenu du fichier.
 * @param {string} relativePath Chemin relatif du fichier.
 * @param {object[]} findings Liste des findings à enrichir.
 */
function scanForSecrets(content, relativePath, findings) {
  const lines = content.split(/\r?\n/);
  
  // Patterns de secrets courants
  const secretPatterns = [
    { name: 'Clé d\'API OpenAI/OpenRouter', regex: /sk-[a-zA-Z0-9_-]{20,}/i },
    { name: 'Clé d\'API Google/Gemini', regex: /AIzaSy[a-zA-Z0-9_-]{35}/i },
    { name: 'Clé d\'API Supabase (sbp)', regex: /sbp_[a-zA-Z0-9_-]{40}/i },
    { name: 'Token GitHub (ghp)', regex: /ghp_[a-zA-Z0-9_-]{36}/i },
    { name: 'Jeton JWT Secret / Clé Secrète', regex: /jwt_secret\s*=\s*['"][a-zA-Z0-9_-]{15,}['"]/i },
  ];

  lines.forEach((line, index) => {
    // Ignorer les commentaires évidents contenant des explications ou des exemples
    if (line.trim().startsWith('//') || line.trim().startsWith('*') || line.trim().startsWith('#')) {
      return;
    }

    for (const pattern of secretPatterns) {
      const match = line.match(pattern.regex);
      if (match) {
        // Double vérification pour exclure les placeholders évidents ou exemples
        const matchedStr = match[0].toLowerCase();
        if (
          matchedStr.includes('placeholder') ||
          matchedStr.includes('your-') ||
          matchedStr.includes('your_') ||
          matchedStr.includes('example') ||
          matchedStr.includes('key_here')
        ) {
          continue;
        }

        findings.push({
          file: relativePath,
          line: index + 1,
          severity: SEVERITIES.CRITICAL,
          expected: 'Aucun secret en dur',
          actual: `Présence suspecte de : ${pattern.name}`,
          description: `Détection d'un secret potentiel ou d'une clé API codée en dur dans le code source à la ligne ${index + 1}.`,
        });
      }
    }
  });
}

/**
 * Analyse la configuration du projet (.gitignore, etc.)
 * @param {object[]} findings Liste des findings à enrichir.
 */
function scanConfigurations(findings) {
  // 1. Vérifier si .env est listé dans .gitignore
  try {
    const gitignoreContent = readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
    const lines = gitignoreContent.split(/\r?\n/);
    const envIgnored = lines.some((line) => {
      const trimmed = line.trim();
      return trimmed === '.env' || trimmed.startsWith('.env*') || (trimmed.startsWith('*') && trimmed.endsWith('.env'));
    });

    if (!envIgnored) {
      findings.push({
        file: '.gitignore',
        severity: SEVERITIES.CRITICAL,
        expected: '.env ignoré par Git',
        actual: '.env non présent dans .gitignore',
        description: 'Le fichier de configuration d\'environnement local .env n\'est pas ignoré par Git, ce qui risque d\'exposer les secrets lors d\'un commit.',
      });
    }
  } catch {
    findings.push({
      file: '.gitignore',
      severity: SEVERITIES.HIGH,
      description: 'Le fichier .gitignore est introuvable ou illisible.',
    });
  }

  // 2. Vérifier les politiques Supabase permissives RLS dans le schéma SQL
  try {
    const schemaSql = readFileSync(path.join(ROOT, 'supabase_schema.sql'), 'utf8');
    const lines = schemaSql.split(/\r?\n/);
    
    lines.forEach((line, index) => {
      if (/FOR\s+ALL\s+TO\s+anon\s+USING\s*\(\s*true\s*\)/i.test(line)) {
        findings.push({
          file: 'supabase_schema.sql',
          line: index + 1,
          severity: SEVERITIES.HIGH,
          expected: 'Politique RLS Supabase restrictive pour le rôle anonyme',
          actual: 'Accès total (FOR ALL) autorisé pour le rôle anonyme',
          description: `Politique de sécurité permissive détectée à la ligne ${index + 1} : les utilisateurs anonymes ont un accès complet (lecture/écriture/suppression) sans restriction d'identité. Recommandé uniquement pour le prototypage V1 privée.`,
        });
      }
    });
  } catch {
    // Échec de lecture géré par l'audit de schéma standard, pas besoin de doublon.
  }
}

/**
 * Vérifie que les agents possèdent bien des défenses contre les injections de prompts.
 * @param {string} content Contenu du fichier.
 * @param {string} relativePath Chemin relatif du fichier.
 * @param {object[]} findings Liste des findings à enrichir.
 */
function scanPromptInjections(content, relativePath, findings) {
  // Uniquement pour les fichiers Markdown d'agents dans docs/05_Agents/
  if (!relativePath.startsWith('docs/05_Agents/')) {
    return;
  }

  const lowerContent = content.toLowerCase();
  const hasDefense = 
    lowerContent.includes('injection') || 
    lowerContent.includes('securite') || 
    lowerContent.includes('sécurité') || 
    lowerContent.includes('defense') ||
    lowerContent.includes('shield');

  if (!hasDefense) {
    findings.push({
      file: relativePath,
      severity: SEVERITIES.MEDIUM,
      expected: 'Présence de consignes de défense contre l\'injection de prompts',
      actual: 'Aucune mention de protection contre l\'injection de prompts dans l\'instruction de l\'agent',
      description: `L'instruction d'agent définie dans ${path.basename(relativePath)} ne comporte pas de clause de protection contre les attaques d'injections de prompts ou la fuite de son prompt système.`,
    });
  }
}

/**
 * Analyse le code JavaScript/React pour détecter des vulnérabilités logicielles.
 * @param {string} content Contenu du fichier.
 * @param {string} relativePath Chemin relatif du fichier.
 * @param {object[]} findings Liste des findings à enrichir.
 */
function scanVulnerabilities(content, relativePath, findings) {
  // Uniquement pour les fichiers de code JS/JSX
  if (!relativePath.endsWith('.js') && !relativePath.endsWith('.jsx')) {
    return;
  }

  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    // 1. Détection de dangerouslySetInnerHTML sans assainisseur visible
    if (line.includes('dangerouslySetInnerHTML') && !line.includes('DOMPurify') && !line.includes('sanitize')) {
      findings.push({
        file: relativePath,
        line: index + 1,
        severity: SEVERITIES.HIGH,
        expected: 'Rendu HTML assaini (DOMPurify/sanitize)',
        actual: 'dangerouslySetInnerHTML utilisé sans filtre d\'assainissement',
        description: `Utilisation potentiellement vulnérable à l'injection de scripts (XSS) de 'dangerouslySetInnerHTML' à la ligne ${index + 1}.`,
      });
    }

    // 2. Détection de requêtes SQL construites par interpolation ou concaténation de chaînes
    // (Risque d'injection SQL si des entrées utilisateur y sont injectées directement)
    if (
      (line.includes('select(') || line.includes('query(') || line.includes('sql`')) &&
      (line.includes('${') || line.includes(' + ')) &&
      !line.includes('PROJECT_ROOT') &&
      !line.includes('ROOT')
    ) {
      // Ignorer les imports ou variables système évidents
      if (line.includes('import') || line.includes('require')) {
        return;
      }
      findings.push({
        file: relativePath,
        line: index + 1,
        severity: SEVERITIES.HIGH,
        expected: 'Requêtes SQL paramétrées ou méthodes de filtrage Supabase natives',
        actual: 'Requête SQL dynamique contenant des interpolations ou des concaténations',
        description: `Risque potentiel d'injection SQL à la ligne ${index + 1} dû à l'utilisation de concaténation de chaînes dans une requête. Privilégier les méthodes de filtrage de l'API client Supabase (ex: .eq(), .filter()).`,
      });
    }
  });
}

/**
 * Audit de sécurité statique de l'intelligence opérationnelle (axe AgentShield).
 * @returns {Promise<{ axe: 'agentshield', findings: object[] }>}
 */
export async function auditAgentShield() {
  const findings = [];

  // Scanners de configuration globale
  scanConfigurations(findings);

  // Scanne tous les fichiers du projet récursivement
  const allFiles = walkFiles(ROOT);

  for (const filePath of allFiles) {
    const relativePath = path.relative(ROOT, filePath).replace(/\\/g, '/');
    
    // Ignorer l'outil d'audit lui-même pour ne pas s'auto-analyser
    if (relativePath === 'scripts/audit/agentshieldAudit.js') {
      continue;
    }

    try {
      const content = readFileSync(filePath, 'utf8');
      
      // Analyses par fichier
      scanForSecrets(content, relativePath, findings);
      scanPromptInjections(content, relativePath, findings);
      scanVulnerabilities(content, relativePath, findings);
    } catch {
      // Ignorer silencieusement les fichiers illisibles (déjà couverts par d'autres axes d'audit)
    }
  }

  return {
    axe: 'agentshield',
    findings,
  };
}

export default auditAgentShield;
