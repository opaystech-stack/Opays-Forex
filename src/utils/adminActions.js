// Actions d'administration des accès — fonctions pures (patchs + tri/pagination)
//
// Logique pure de la Console_Admin : construction des patchs d'activation et de
// revue de preuve (tracés par l'identifiant de l'Administrateur et un
// horodatage), tri/pagination de la liste des Utilisateurs, et détermination du
// Statut_Preuve le plus récent.
//
// Toutes les fonctions sont PURES : aucune mutation des arguments, aucun effet
// de bord, aucun appel réseau. Les horodatages sont produits au format ISO 8601
// en UTC. Une horloge peut être injectée (`nowIso`) pour des tests
// déterministes ; par défaut on utilise l'instant courant.
//
// Feature: paid-access-control

/** Taille de page par défaut de la Console_Admin (R6.1). */
export const DEFAULT_ADMIN_PAGE_SIZE = 50;

// Retourne un horodatage ISO 8601 UTC. Accepte une valeur déjà fournie (utile
// pour des tests déterministes), sinon génère l'instant courant.
const toIso = (nowIso) => {
  if (typeof nowIso === 'string' && nowIso.length > 0) return nowIso;
  if (nowIso instanceof Date && !Number.isNaN(nowIso.getTime())) return nowIso.toISOString();
  return new Date().toISOString();
};

/**
 * Construit le patch d'activation/désactivation d'un Utilisateur (R6.4, R6.5).
 *
 * Le patch porte toujours l'identité de l'Administrateur (`activated_by`) et un
 * horodatage non nul (`activated_at`), de sorte que, lorsque `actif` vaut
 * `true`, l'invariant de traçabilité d'activation (Property 4) est toujours
 * satisfait.
 *
 * Fonction pure : ne dépend que de ses arguments (+ horloge injectable).
 *
 * @param {boolean} actif - nouvelle valeur de `acces_autorise`.
 * @param {string} adminId - identifiant de l'Administrateur réalisant l'action.
 * @param {string|Date} [nowIso] - horodatage injectable (tests).
 * @returns {{ acces_autorise: boolean, activated_by: string, activated_at: string }}
 */
export const buildActivationPatch = (actif, adminId, nowIso) => ({
  acces_autorise: Boolean(actif),
  activated_by: adminId,
  activated_at: toIso(nowIso),
});

/**
 * Construit le patch de revue d'une Preuve_Paiement (R6.6, R6.7).
 *
 * Le patch porte le nouveau `statut` (`validee` ou `rejetee`), l'identité de
 * l'Administrateur réviseur (`reviewed_by`) et un horodatage non nul
 * (`reviewed_at`).
 *
 * Fonction pure : ne dépend que de ses arguments (+ horloge injectable).
 *
 * @param {('validee'|'rejetee')} statut - nouveau Statut_Preuve.
 * @param {string} adminId - identifiant de l'Administrateur réviseur.
 * @param {string|Date} [nowIso] - horodatage injectable (tests).
 * @returns {{ statut: string, reviewed_by: string, reviewed_at: string }}
 */
export const buildReviewPatch = (statut, adminId, nowIso) => ({
  statut,
  reviewed_by: adminId,
  reviewed_at: toIso(nowIso),
});

// Convertit un horodatage de preuve (ISO 8601, Date, ou nul) en valeur de tri
// numérique. Une entrée sans preuve (ou horodatage invalide) est repoussée en
// dernier en renvoyant -Infinity (tri décroissant : du plus récent au plus
// ancien).
const proofTimeValue = (value) => {
  if (value == null) return -Infinity;
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(t) ? -Infinity : t;
};

// Lit l'horodatage de preuve d'une entrée Utilisateur. Accepte plusieurs noms
// de champ usuels pour rester tolérant à la forme exacte des données fournies
// par la Console_Admin (`latestProofAt`, `submitted_at`, `latest_proof_at`).
const entryProofTime = (entry) => {
  if (!entry || typeof entry !== 'object') return -Infinity;
  const raw = entry.latestProofAt ?? entry.submitted_at ?? entry.latest_proof_at ?? null;
  return proofTimeValue(raw);
};

/**
 * Trie et pagine la liste des Utilisateurs de la Console_Admin (R6.1, R6.2).
 *
 * Les entrées sont triées par horodatage de Preuve_Paiement la plus récente en
 * premier ; les entrées sans preuve (horodatage nul/absent) viennent en
 * dernier. Le tri est stable (l'ordre relatif des entrées de même horodatage
 * est conservé). La page renvoyée contient au plus `pageSize` entrées.
 *
 * Garantie de partition : pour une même liste et un même `pageSize`, l'union
 * des pages successives (1, 2, 3, …) est une permutation exacte de la liste
 * d'entrée — sans perte ni doublon. Une page hors plage renvoie un tableau
 * vide. La pagination est indexée à partir de 1 (`page = 1` ⇒ première page).
 *
 * Fonction pure : la liste d'entrée n'est jamais mutée.
 *
 * @param {Array<Object>} entries - entrées Utilisateur (champ horodatage de preuve éventuellement nul).
 * @param {number} page - numéro de page indexé à partir de 1.
 * @param {number} [pageSize=DEFAULT_ADMIN_PAGE_SIZE] - taille de page (max 50 par défaut).
 * @returns {Array<Object>} sous-ensemble trié et paginé (au plus `pageSize` entrées).
 */
export const buildAdminPage = (entries, page, pageSize = DEFAULT_ADMIN_PAGE_SIZE) => {
  const list = Array.isArray(entries) ? entries : [];

  const sizeParsed = Number(pageSize);
  const size = Number.isFinite(sizeParsed) && sizeParsed > 0 ? Math.trunc(sizeParsed) : DEFAULT_ADMIN_PAGE_SIZE;

  const pageParsed = Number(page);
  const pageNum = Number.isFinite(pageParsed) && pageParsed >= 1 ? Math.trunc(pageParsed) : 1;

  // Tri décroissant par horodatage de preuve, stable (index de départ en cas d'égalité).
  const sorted = list
    .map((entry, index) => ({ entry, index, t: entryProofTime(entry) }))
    .sort((a, b) => (b.t - a.t) || (a.index - b.index))
    .map((wrapped) => wrapped.entry);

  const start = (pageNum - 1) * size;
  return sorted.slice(start, start + size);
};

// Convertit l'horodatage de soumission d'une preuve en valeur numérique de
// comparaison. Une valeur absente/invalide est traitée comme -Infinity.
const submittedTimeValue = (proof) => {
  if (!proof || typeof proof !== 'object') return -Infinity;
  return proofTimeValue(proof.submitted_at ?? proof.submittedAt ?? null);
};

/**
 * Retourne le Statut_Preuve le plus récent d'un Utilisateur (R3.4, R3.5).
 *
 * Parcourt les Preuves_Paiement et renvoie le `statut` de celle dont le
 * `submitted_at` est maximal. Si la liste est vide (ou non fournie), renvoie
 * `null`, signalant qu'aucune Preuve_Paiement n'a encore été soumise.
 *
 * En cas d'égalité d'horodatage, la dernière preuve rencontrée dans la liste
 * l'emporte (≥), ce qui reste déterministe pour une liste donnée.
 *
 * Fonction pure : la liste d'entrée n'est jamais mutée.
 *
 * @param {Array<{ statut: string, submitted_at?: string }>} proofs - preuves d'un Utilisateur.
 * @returns {string|null} le statut le plus récent, ou `null` si aucune preuve.
 */
export const latestProofStatus = (proofs) => {
  const list = Array.isArray(proofs) ? proofs : [];
  if (list.length === 0) return null;

  let latest = null;
  let latestTime = -Infinity;
  for (const proof of list) {
    const t = submittedTimeValue(proof);
    if (t >= latestTime) {
      latestTime = t;
      latest = proof;
    }
  }

  return latest ? latest.statut ?? null : null;
};
