// File d'attente des relances — fonctions pures (FIFO, ré-essais bornés)
//
// Orchestration de la file d'attente du Service_Relance : conserve l'ordre de
// soumission des relances (FIFO), ne perd jamais une relance différée par la
// limite de débit, et borne le nombre de ré-essais en cas d'échec transitoire.
//
// Toutes les fonctions sont PURES : aucune mutation des arguments, aucun effet
// de bord, horloge injectée (`nowMs`). La décision d'autoriser un envoi est
// déléguée à `rateLimiter.js` (`canSend`/`registerSend`), dont l'état est
// passé et renvoyé de façon immuable.
//
// Feature: whatsapp-client-reminders

import { canSend, registerSend } from './rateLimiter.js';

/**
 * @typedef {Object} QueueItem
 * @property {number} attempts - nombre de tentatives déjà effectuées (≥ 0).
 *   Les autres champs (customerId, phone, content, …) sont conservés tels quels.
 */

/**
 * Ajoute une relance en fin de file et renvoie une NOUVELLE file (FIFO).
 *
 * L'ordre de soumission est préservé : l'élément est appendé à la fin. Un
 * compteur `attempts` est initialisé à 0 s'il est absent (ou conservé tel quel
 * s'il est déjà présent, ce qui permet la ré-insertion lors d'un ré-essai).
 *
 * Aucune mutation : ni la file ni l'élément d'entrée ne sont modifiés.
 *
 * Règle (Exigences 4.2, 4.3) : ordre de soumission préservé, aucune perte.
 *
 * @param {QueueItem[]} queue - file actuelle (non mutée).
 * @param {Object} item - relance à enfiler.
 * @returns {QueueItem[]} nouvelle file avec l'élément ajouté en fin.
 */
export const enqueue = (queue, item) => {
  const base = Array.isArray(queue) ? queue : [];
  const queued = {
    ...item,
    attempts:
      item && Number.isFinite(item.attempts) && item.attempts >= 0
        ? item.attempts
        : 0,
  };
  return [...base, queued];
};

/**
 * Défile la tête de la file si — et seulement si — la limite de débit autorise
 * un envoi à l'instant `nowMs`.
 *
 * - File vide ou envoi non autorisé (`canSend` → `allowed:false`) : aucun
 *   élément n'est retiré ; `item` vaut `null` et `queue`/`limiterState` sont
 *   renvoyés inchangés. La relature différée reste donc en file (jamais perdue).
 * - Envoi autorisé : la tête est retirée (FIFO), `limiterState` est avancé via
 *   `registerSend`, et l'élément est renvoyé.
 *
 * Aucune mutation des arguments.
 *
 * Règles (Exigences 4.2, 4.3) : FIFO, un envoi différé reste en file.
 *
 * @param {QueueItem[]} queue
 * @param {number} nowMs - horloge injectée (ms).
 * @param {Object} limiterState - état du limiteur de débit.
 * @param {Object} config - configuration de débit/file.
 * @returns {{ item: QueueItem|null, queue: QueueItem[], limiterState: Object }}
 */
export const dequeueReady = (queue, nowMs, limiterState, config) => {
  const base = Array.isArray(queue) ? queue : [];

  if (base.length === 0) {
    return { item: null, queue: base, limiterState };
  }

  const { allowed } = canSend(limiterState, nowMs, config);
  if (!allowed) {
    return { item: null, queue: base, limiterState };
  }

  const [head, ...rest] = base;
  const nextLimiterState = registerSend(limiterState, nowMs, config);
  return { item: head, queue: rest, limiterState: nextLimiterState };
};

/**
 * Traite l'échec d'envoi d'une relance et décide d'un ré-essai borné.
 *
 * Si, après incrément, le nombre de tentatives reste strictement inférieur à
 * `config.maxAttempts`, la relance est ré-enfilée (en fin de file) avec son
 * compteur `attempts` incrémenté → `retried:true`. Sinon, la relance est
 * abandonnée (non ré-insérée) → `retried:false`.
 *
 * Aucune mutation des arguments.
 *
 * Règle (Exigence 4.5) : ré-essais bornés ; jamais de ré-essai indéfini.
 *
 * @param {QueueItem[]} queue
 * @param {QueueItem} item - relance ayant échoué.
 * @param {{ maxAttempts: number }} config
 * @returns {{ queue: QueueItem[], retried: boolean }}
 */
export const onFailure = (queue, item, config) => {
  const base = Array.isArray(queue) ? queue : [];
  const currentAttempts =
    item && Number.isFinite(item.attempts) && item.attempts >= 0
      ? item.attempts
      : 0;
  const nextAttempts = currentAttempts + 1;
  const maxAttempts = config && Number.isFinite(config.maxAttempts) ? config.maxAttempts : 1;

  if (nextAttempts < maxAttempts) {
    const retriedItem = { ...item, attempts: nextAttempts };
    return { queue: [...base, retriedItem], retried: true };
  }

  return { queue: base, retried: false };
};
