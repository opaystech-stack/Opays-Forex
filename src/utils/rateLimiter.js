// Limitation de débit et espacement minimal des envois WhatsApp — fonctions pures.
//
// La Limite_de_Debit protège le numéro WhatsApp contre un bannissement en
// bornant le nombre d'envois sur une fenêtre glissante et en imposant un délai
// minimal entre deux envois consécutifs (Exigences 4.1, 4.4).
//
// Toute la logique est PURE et DÉTERMINISTE : l'horloge est INJECTÉE
// (`nowMs` passé en paramètre, jamais `Date.now()` à l'intérieur) et l'état est
// IMMUABLE (`registerSend` retourne un nouvel état sans muter l'entrée). La même
// entrée produit donc toujours la même sortie, ce qui rend ces fonctions
// vérifiables par tests de propriété sans réseau ni horloge réelle.
//
// Feature: whatsapp-client-reminders

/**
 * @typedef {Object} RateLimiterConfig
 * @property {number} maxPerInterval Nombre maximal d'envois autorisés par fenêtre glissante.
 * @property {number} intervalMs Largeur de la fenêtre glissante, en millisecondes.
 * @property {number} minSpacingMs Délai minimal, en millisecondes, entre deux envois consécutifs.
 */

/**
 * @typedef {Object} RateLimiterState
 * @property {number[]} sends Horodatages (ms) des envois récents, triés par ordre croissant
 *   et élagués à la fenêtre glissante courante.
 * @property {number|null} lastSentAtMs Horodatage (ms) du dernier envoi enregistré,
 *   conservé indépendamment de l'élagage pour le calcul de l'espacement minimal.
 */

/**
 * État initial d'un limiteur de débit : aucun envoi enregistré.
 *
 * @returns {RateLimiterState}
 */
export const createInitialState = () => ({ sends: [], lastSentAtMs: null });

/**
 * Conserve uniquement les horodatages strictement à l'intérieur de la fenêtre
 * glissante de largeur `intervalMs` se terminant à `nowMs` (c.-à-d. `ts > nowMs - intervalMs`).
 *
 * @param {number[]} sends
 * @param {number} nowMs
 * @param {number} intervalMs
 * @returns {number[]} un NOUVEAU tableau trié croissant des envois dans la fenêtre
 */
const pruneToWindow = (sends, nowMs, intervalMs) => {
  const windowStart = nowMs - intervalMs;
  return sends.filter((ts) => ts > windowStart).sort((a, b) => a - b);
};

/**
 * Détermine si un envoi est autorisé à l'instant `nowMs` et, sinon, à partir de
 * quand il le sera.
 *
 * Règles (Exigences 4.1, 4.4) :
 *   - (a) au plus `config.maxPerInterval` envois sur toute fenêtre glissante de
 *     `config.intervalMs` se terminant à `nowMs` ;
 *   - (b) au moins `config.minSpacingMs` écoulés depuis le dernier envoi.
 *
 * Un envoi est autorisé si et seulement si (a) ET (b) sont satisfaites.
 *
 * `nextAllowedAtMs` est le premier instant ≥ `nowMs` auquel un envoi
 * respecterait les deux contraintes. Lorsque l'envoi est autorisé maintenant,
 * `nextAllowedAtMs` vaut `nowMs`.
 *
 * Fonction pure : ne mute pas `state`, ne lit pas l'horloge système.
 *
 * @param {RateLimiterState} state
 * @param {number} nowMs
 * @param {RateLimiterConfig} config
 * @returns {{ allowed: boolean, nextAllowedAtMs: number }}
 */
export const canSend = (state, nowMs, config) => {
  const { maxPerInterval, intervalMs, minSpacingMs } = config;
  const recent = pruneToWindow(state.sends, nowMs, intervalMs);

  // (b) Espacement minimal depuis le dernier envoi.
  const lastSentAtMs = state.lastSentAtMs;
  const spacingReadyMs =
    lastSentAtMs === null || lastSentAtMs === undefined
      ? nowMs
      : lastSentAtMs + minSpacingMs;

  // (a) Débit sur la fenêtre glissante.
  let rateReadyMs;
  if (recent.length < maxPerInterval) {
    rateReadyMs = nowMs;
  } else {
    // Il faut attendre que suffisamment d'envois anciens sortent de la fenêtre
    // pour que le compte retombe à `maxPerInterval - 1`. Le dernier envoi devant
    // expirer est `recent[recent.length - maxPerInterval]` ; il quitte la
    // fenêtre à `ts + intervalMs`.
    const expiringTs = recent[recent.length - maxPerInterval];
    rateReadyMs = expiringTs + intervalMs;
  }

  const nextAllowedAtMs = Math.max(nowMs, spacingReadyMs, rateReadyMs);
  const allowed = nextAllowedAtMs <= nowMs;

  return { allowed, nextAllowedAtMs };
};

/**
 * Enregistre un envoi à l'instant `nowMs` et retourne un NOUVEL état.
 *
 * L'état d'entrée n'est jamais muté. La liste des envois récents est élaguée à
 * la fenêtre glissante puis complétée par `nowMs`, et `lastSentAtMs` est mis à
 * jour. Conserver `lastSentAtMs` séparément garantit un espacement correct même
 * si `minSpacingMs` dépasse `intervalMs`.
 *
 * Fonction pure : ne mute pas `state`, ne lit pas l'horloge système.
 *
 * @param {RateLimiterState} state
 * @param {number} nowMs
 * @param {RateLimiterConfig} config
 * @returns {RateLimiterState} un nouvel état incluant l'envoi enregistré
 */
export const registerSend = (state, nowMs, config) => {
  const { intervalMs } = config;
  const pruned = pruneToWindow(state.sends, nowMs, intervalMs);
  return {
    sends: [...pruned, nowMs],
    lastSentAtMs: nowMs,
  };
};
