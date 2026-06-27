// Service_Relance — orchestration des relances clients WhatsApp
//
// Ce module expose la construction des relances (buildReminders), une fonction
// PURE et sans effet de bord : aucune écriture réseau, aucune journalisation,
// aucune horloge. Elle transforme une demande de relance (scénario + données
// clients/créances + modèle/texte libre) en une liste de ReminderRequest prêtes
// à être envoyées, ainsi qu'une liste des clients bloqués (variable obligatoire
// non résolue).
//
// L'exécution effective du lot (débit, file d'attente, ré-essais, envoi via
// whatsapp-send et journalisation dans reminder_history) relève de
// runReminderBatch (cf. bas de fichier), qui pilote les modules purs de débit
// et de file et délègue l'envoi à whatsappClient et la journalisation à
// l'action logReminder injectée depuis AppContext.
//
// Réutilise les fonctions pures de composition (messageComposer.js) :
//   - resolveTemplate : résolution des variables `{{nom}}` d'un modèle
//   - composeFreeText : texte libre verbatim (préserve `{{...}}` littéralement)
// et les modules purs d'orchestration :
//   - rateLimiter.js   : createInitialState / canSend / registerSend
//   - reminderQueue.js : enqueue / dequeueReady / onFailure
//   - whatsappClient.js: sendWhatsApp (Service_Envoi, injectable pour les tests)
//
// Formes de données (cf. src/context/AppContext.jsx) :
//   - customers : { id, name, phone }
//   - loans     : { id, customer_id, amount, currency, due_date, status }
//
// Feature: whatsapp-client-reminders

import { resolveTemplate, composeFreeText } from '../utils/messageComposer.js';
import {
  createInitialState,
  canSend,
  registerSend,
} from '../utils/rateLimiter.js';
import { enqueue, dequeueReady, onFailure } from '../utils/reminderQueue.js';
import {
  isSubscriptionReminderDue,
  isFlightReminderDue,
  RENEWAL_THRESHOLD_DEFAULT_DAYS,
  FLIGHT_LEAD_TIME_DEFAULT_HOURS,
} from '../utils/reminderSchedule.js';
import {
  REMINDER_TYPE_RENEWAL,
  buildReminderHistoryEntry,
  appendReminderHistoryEntry,
} from '../utils/subscriptionValidation.js';
import { sendWhatsApp } from './whatsappClient.js';

/**
 * @typedef {Object} ReminderRequest
 * @property {string} customerId
 * @property {string} phone
 * @property {'recovery'|'announcement'|'personalized'|'custom'} scenario
 * @property {'manual'|'voice'} triggerSource
 * @property {string} [templateId]
 * @property {string} content
 * @property {string} [loanId]
 */

/** Statuts de créance considérés comme « en cours » (Exigence 7). */
const OUTSTANDING_LOAN_STATUSES = new Set(['pending', 'overdue']);

/**
 * Indique si une valeur est exploitable (non nulle, non chaîne vide).
 *
 * @param {*} value
 * @returns {boolean}
 */
const hasValue = (value) => {
  if (value === null || value === undefined) return false;
  return String(value) !== '';
};

/**
 * Retourne la première créance « en cours » (pending/overdue) rattachée au
 * Client, ou undefined si aucune.
 *
 * @param {Array<Object>} loans
 * @param {string} customerId
 * @returns {Object|undefined}
 */
const findOutstandingLoan = (loans, customerId) => {
  if (!Array.isArray(loans)) return undefined;
  return loans.find(
    (loan) =>
      loan &&
      loan.customer_id === customerId &&
      OUTSTANDING_LOAN_STATUSES.has(loan.status)
  );
};

/**
 * Construit l'ensemble des variables résolvables pour un Client, à partir de
 * ses données propres et, le cas échéant, d'une créance rattachée.
 *
 * Les variables absentes ne sont pas posées (undefined) afin que la résolution
 * de modèle applique son repli défini plutôt qu'un montant inventé (Ex. 7.3,
 * 9.3). Le nom du Client (customer_name) est obligatoire (Ex. 9.1).
 *
 * @param {Object} customer
 * @param {Object} [loan]
 * @returns {Object<string, *>}
 */
const buildVariables = (customer, loan) => {
  const variables = {
    customer_name: customer ? customer.name : undefined,
  };
  if (loan) {
    if (hasValue(loan.amount)) variables.amount_due = loan.amount;
    if (hasValue(loan.currency)) variables.currency = loan.currency;
    if (hasValue(loan.due_date)) variables.due_date = loan.due_date;
  }
  return variables;
};

/**
 * Compose le contenu d'une relance pour un Client donné.
 *
 * Trois modes (Ex. 5.2, 5.3, 5.4, 9.2, 10.3, 10.4) :
 *   - Texte libre (aucun modèle, freeText fourni) : composeFreeText renvoie le
 *     texte tel quel ; toute syntaxe `{{...}}` est préservée littéralement.
 *   - Modèle fourni : resolveTemplate remplace les variables ; si une variable
 *     obligatoire manque → { ok:false, missing } (le Client sera bloqué).
 *   - Ni modèle ni texte libre : repli sur texte libre vide (verbatim).
 *
 * @param {{ template?: Object|string, freeText?: string, variables: Object }} args
 * @returns {{ ok: boolean, content?: string, missing?: string[] }}
 */
const composeContent = ({ template, freeText, variables }) => {
  // Mode texte libre : prioritaire dès qu'aucun modèle n'est fourni et qu'un
  // texte libre est présent.
  if (!template && freeText !== undefined && freeText !== null) {
    return { ok: true, content: composeFreeText(freeText) };
  }

  if (template) {
    const body =
      typeof template === 'string' ? template : (template.body ?? '');
    const result = resolveTemplate(body, variables);
    if (!result.ok) {
      return { ok: false, missing: result.missing };
    }
    return { ok: true, content: result.text };
  }

  // Ni modèle ni texte libre : rien à résoudre, contenu vide verbatim.
  return { ok: true, content: composeFreeText(freeText ?? '') };
};

/**
 * Construit les relances pour un scénario donné (fonction PURE).
 *
 * Scénarios :
 *   - recovery : pour chaque Client ayant une créance en cours (pending/overdue),
 *     résout customer_name + amount_due + currency + due_date depuis la créance
 *     et rattache loanId. Aucun montant disponible → aucune référence à un
 *     montant (repli du composeur), Ex. 7.3. Les Clients sans créance en cours
 *     sont ignorés.
 *   - announcement : crée exactement une relance par Client sélectionné
 *     (cardinalité N), Ex. 8.1.
 *   - personalized : résolution complète des variables via resolveTemplate.
 *
 * Lorsqu'une variable obligatoire d'un modèle n'a pas de valeur, aucun message
 * n'est créé pour ce Client ; il est ajouté à `blocked` (Ex. 10.4).
 *
 * @param {Object} args
 * @param {'recovery'|'announcement'|'personalized'|'custom'} args.scenario
 * @param {Array<Object>} args.customers   Clients sélectionnés {id, name, phone}
 * @param {Array<Object>} [args.loans]     Créances {id, customer_id, amount, currency, due_date, status}
 * @param {Object|string} [args.template]  Modele_Message ({id, body} ou body brut)
 * @param {string} [args.freeText]         Texte libre (préservé verbatim)
 * @param {string} [args.lang]             Langue (fr/en) — réservé
 * @param {'manual'|'voice'} [args.triggerSource='manual'] Source de déclenchement
 * @returns {{ reminders: ReminderRequest[], blocked: {customerId: string, missing: string[]}[] }}
 */
export const buildReminders = ({
  scenario,
  customers,
  loans = [],
  template,
  freeText,
  lang, // eslint-disable-line no-unused-vars -- réservé pour sélection future de modèle par langue
  triggerSource = 'manual',
} = {}) => {
  const reminders = [];
  const blocked = [];

  const selectedCustomers = Array.isArray(customers) ? customers : [];
  const templateId =
    template && typeof template === 'object' ? template.id : undefined;

  for (const customer of selectedCustomers) {
    if (!customer || !hasValue(customer.id)) continue;

    // Pour le recouvrement, on ne relance que les Clients ayant une créance
    // en cours, et l'on rattache cette créance.
    let loan;
    if (scenario === 'recovery') {
      loan = findOutstandingLoan(loans, customer.id);
      if (!loan) {
        // Aucun montant dû en cours : pas de relance de recouvrement.
        continue;
      }
    }

    const variables = buildVariables(customer, loan);
    const composed = composeContent({ template, freeText, variables });

    if (!composed.ok) {
      blocked.push({ customerId: customer.id, missing: composed.missing || [] });
      continue;
    }

    /** @type {ReminderRequest} */
    const reminder = {
      customerId: customer.id,
      phone: customer.phone,
      scenario,
      triggerSource,
      content: composed.content,
    };
    if (templateId !== undefined) reminder.templateId = templateId;
    if (loan && hasValue(loan.id)) reminder.loanId = loan.id;

    reminders.push(reminder);
  }

  return { reminders, blocked };
};

// ---------------------------------------------------------------------------
// runReminderBatch — exécution effective d'un lot de relances (effets de bord)
// ---------------------------------------------------------------------------
//
// Pilote les modules purs de débit (rateLimiter) et de file (reminderQueue),
// délègue l'envoi à whatsappClient (Service_Envoi) et la journalisation à
// l'action `logReminder` injectée depuis AppContext. Toutes les dépendances à
// effet de bord (envoi réseau, journalisation, horloge) sont INJECTABLES afin
// de rendre l'orchestration testable sans réseau ni horloge réelle.
//
// Exigences couvertes : 4.2, 4.3, 4.4, 4.5, 6.4, 6.5, 8.2, 8.3, 8.4,
//                       11.1, 11.2, 11.3, 11.4

/** Configuration par défaut de la Limite_de_Debit et des ré-essais. */
const DEFAULT_BATCH_CONFIG = {
  maxPerInterval: 10, // au plus 10 envois par fenêtre glissante
  intervalMs: 60_000, // fenêtre glissante d'une minute
  minSpacingMs: 1000, // au moins 1 s entre deux envois consécutifs
  maxAttempts: 3, // ré-essais bornés (Ex. 4.5)
};

/**
 * Normalise l'horloge injectée en une interface `{ now, sleepUntil }`.
 *
 * On NE LIT JAMAIS `Date.now()` directement dans l'orchestration : l'horloge
 * est toujours passée par cette abstraction, ce qui permet aux tests d'injecter
 * une horloge virtuelle avançable (déterministe). Formes acceptées :
 *   - objet `{ now(): number, sleepUntil?(targetMs): Promise }` ;
 *   - fonction `() => number` (lecture seule) ;
 *   - rien : repli sur l'horloge système (`Date.now` + `setTimeout` réel).
 *
 * @param {Function|{now:Function, sleepUntil?:Function}} [clock]
 * @returns {{ now: () => number, sleepUntil: (targetMs:number) => Promise<void> }}
 */
const normalizeClock = (clock) => {
  // Repli par défaut : horloge système + attente réelle.
  const realSleepUntil = (readNow) => async (targetMs) => {
    const delay = targetMs - readNow();
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  };

  if (clock && typeof clock.now === 'function') {
    const now = () => clock.now();
    return {
      now,
      sleepUntil:
        typeof clock.sleepUntil === 'function'
          ? (targetMs) => clock.sleepUntil(targetMs)
          : realSleepUntil(now),
    };
  }

  if (typeof clock === 'function') {
    return { now: clock, sleepUntil: realSleepUntil(clock) };
  }

  const now = () => Date.now();
  return { now, sleepUntil: realSleepUntil(now) };
};

/**
 * Projette une ReminderRequest (+ statut/issue) sur l'entrée attendue par
 * l'action `logReminder` (forme alignée sur la table `reminder_history`).
 *
 * @param {ReminderRequest} item
 * @param {'sent'|'failed'} status
 * @param {{ providerMessageId?: string, errorReason?: string }} [extra]
 * @returns {Object}
 */
const toHistoryEntry = (item, status, extra = {}) => ({
  customer_id: item.customerId,
  loan_id: item.loanId ?? null,
  template_id: item.templateId ?? null,
  scenario: item.scenario,
  content: item.content,
  trigger_source: item.triggerSource ?? 'manual',
  status,
  provider_message_id: extra.providerMessageId ?? null,
  error_reason: extra.errorReason ?? null,
});

/**
 * Journalise une entrée d'historique sans jamais bloquer l'envoi (Ex. 11.4).
 *
 * `logReminder` (cf. AppContext) est lui-même résilient et renvoie
 * `{ success:false }` au lieu de lever ; on se prémunit néanmoins ici contre
 * toute exception ou rejet pour garantir que l'orchestration se poursuit.
 *
 * @param {Function} [logReminder]
 * @param {Object} entry
 * @returns {Promise<void>}
 */
const safeLogReminder = async (logReminder, entry) => {
  if (typeof logReminder !== 'function') return;
  try {
    await logReminder(entry);
  } catch (err) {
    // Résilience (Ex. 11.4) : l'échec de journalisation n'interrompt pas le lot.
    console.error('runReminderBatch: échec de journalisation ignoré:', err?.message);
  }
};

/**
 * @typedef {Object} ReminderResult
 * @property {string} customerId
 * @property {'sent'|'failed'} status
 * @property {string} [messageId]   identifiant passerelle si succès (Ex. 11.2)
 * @property {string} [error]       cause si échec (Ex. 11.3)
 * @property {number} attempts      nombre de tentatives effectuées
 */

/**
 * @typedef {Object} ResultSummary
 * @property {number} sent     nombre de relances envoyées avec succès
 * @property {number} failed   nombre de relances en échec définitif
 * @property {number} blocked  tentatives vocales ambiguës comptabilisées dans le
 *                             débit mais NON envoyées (Ex. 6.5)
 * @property {ReminderResult[]} results  un résultat terminal par relance traitée
 */

/**
 * Exécute un lot de relances : enfile dans l'ordre de soumission (FIFO), pilote
 * la Limite_de_Debit et l'espacement minimal, ré-essaie les échecs transitoires
 * de façon bornée, envoie via `sendFn` (par défaut `sendWhatsApp`) et journalise
 * chaque issue dans l'historique via `logReminder`.
 *
 * Garanties :
 *   - Ordre FIFO préservé ; une relance différée par le débit reste en file et
 *     l'horloge est avancée jusqu'au prochain instant autorisé (Ex. 4.2, 4.3).
 *   - Au plus `maxPerInterval` envois par `intervalMs`, espacés d'au moins
 *     `minSpacingMs` (Ex. 4.4, 8.2, 6.4) — délégué à `rateLimiter`.
 *   - Ré-essais ≤ `maxAttempts` ; au-delà, issue `failed` (Ex. 4.5).
 *   - Un échec individuel n'interrompt pas le reste du lot (Ex. 8.4).
 *   - Chaque envoi (succès/échec) produit exactement une entrée d'historique
 *     rattachée au bon Client (Ex. 8.3, 11.1, 11.2, 11.3).
 *   - L'échec de journalisation n'empêche jamais l'envoi (Ex. 11.4).
 *   - Les tentatives vocales ambiguës occupent un créneau de débit sans envoi
 *     ni entrée d'historique « sent » (Ex. 6.5) ; le signalement de l'ambiguïté
 *     relève de l'appelant/UI.
 *
 * @param {Object} params
 * @param {Object} [params.supabase]            client Supabase (passé à `sendFn`/`logReminder`)
 * @param {Function} [params.sendFn=sendWhatsApp] envoi d'un message : ({supabase,to,message}) => {success,messageId?,error?}
 * @param {Function} [params.logReminder]       journalisation d'une entrée d'historique (résiliente)
 * @param {ReminderRequest[]} [params.reminders] relances à traiter (ordre de soumission)
 * @param {Object} [params.config]              { maxPerInterval, intervalMs, minSpacingMs, maxAttempts }
 * @param {Function|Object} [params.clock]      horloge injectable (cf. normalizeClock)
 * @param {Function} [params.onResult]          rappel invoqué pour chaque relance traitée (issue terminale)
 * @param {Array} [params.ambiguousAttempts]    tentatives vocales ambiguës à comptabiliser dans le débit (Ex. 6.5)
 * @returns {Promise<ResultSummary>}
 */
export const runReminderBatch = async ({
  supabase,
  sendFn = sendWhatsApp,
  logReminder,
  reminders = [],
  config = {},
  clock,
  onResult,
  ambiguousAttempts = [],
} = {}) => {
  const cfg = { ...DEFAULT_BATCH_CONFIG, ...config };
  const tick = normalizeClock(clock);

  let limiterState = createInitialState();

  // 1) Tentatives vocales ambiguës (Ex. 6.5) : on comptabilise un créneau de
  //    débit (registerSend) SANS appeler `sendFn` ni écrire d'entrée « sent ».
  //    Le signalement de l'ambiguïté à l'opérateur est une préoccupation de
  //    l'appelant/UI ; ici on garantit seulement que la tentative pèse sur la
  //    Limite_de_Debit.
  const ambiguousList = Array.isArray(ambiguousAttempts) ? ambiguousAttempts : [];
  let blocked = 0;
  for (let i = 0; i < ambiguousList.length; i += 1) {
    limiterState = registerSend(limiterState, tick.now(), cfg);
    blocked += 1;
  }

  // 2) Enfilement FIFO de toutes les relances (ordre de soumission préservé).
  let queue = [];
  const submitted = Array.isArray(reminders) ? reminders : [];
  for (const reminder of submitted) {
    queue = enqueue(queue, reminder);
  }

  /** @type {ReminderResult[]} */
  const results = [];
  let sent = 0;
  let failed = 0;

  // Garde-fou anti-boucle infinie : borne large couvrant tentatives + attentes
  // de débit. Protège contre une horloge injectée qui n'avancerait pas.
  const maxIterations =
    (submitted.length * Math.max(1, cfg.maxAttempts) + submitted.length + 10) * 4;
  let iterations = 0;

  const emitResult = (result) => {
    results.push(result);
    if (typeof onResult === 'function') {
      try {
        onResult(result);
      } catch (err) {
        console.error('runReminderBatch: onResult a levé une exception ignorée:', err?.message);
      }
    }
  };

  while (queue.length > 0) {
    if (++iterations > maxIterations) {
      console.error('runReminderBatch: arrêt de sécurité (boucle non convergente).');
      break;
    }

    // Défile la tête si le débit l'autorise ; sinon l'élément reste en file.
    const dq = dequeueReady(queue, tick.now(), limiterState, cfg);
    if (!dq.item) {
      // Rate-limité : on conserve la file et on avance l'horloge jusqu'au
      // prochain instant autorisé (Ex. 4.2, 4.3), puis on réessaie.
      const { nextAllowedAtMs } = canSend(limiterState, tick.now(), cfg);
      await tick.sleepUntil(nextAllowedAtMs);
      continue;
    }

    queue = dq.queue;
    limiterState = dq.limiterState;
    const item = dq.item;
    const attempts = (Number.isFinite(item.attempts) ? item.attempts : 0) + 1;

    // Traitement résilient : une exception sur un Client ne doit jamais
    // interrompre le traitement des autres (Ex. 8.4).
    let sendResult;
    try {
      // Transmission via le Service_Envoi unique. Les champs `featureSource`,
      // `agencyId` et `whatsappNumberId` sont propagés tels quels (additif,
      // non bloquant) : les relances historiques de whatsapp-client-reminders
      // ne les portent pas (→ undefined, ignorés), tandis que les rappels
      // d'abonnement/vol les renseignent pour la traçabilité dans
      // l'Historique_Messages_WhatsApp partagé (Req 13.2, 13.6).
      sendResult = await sendFn({
        supabase,
        to: item.phone,
        message: item.content,
        featureSource: item.featureSource,
        agencyId: item.agencyId,
        whatsappNumberId: item.whatsappNumberId,
      });
    } catch (err) {
      sendResult = { success: false, error: err?.message || 'send_exception' };
    }

    if (sendResult && sendResult.success) {
      // Succès → entrée d'historique « sent » avec provider_message_id (Ex. 11.1, 11.2).
      await safeLogReminder(
        logReminder,
        toHistoryEntry(item, 'sent', { providerMessageId: sendResult.messageId })
      );
      sent += 1;
      emitResult({
        customerId: item.customerId,
        status: 'sent',
        messageId: sendResult.messageId,
        attempts,
        // Champs de corrélation optionnels (additifs) : permettent à un appelant
        // d'ordre supérieur (cf. runScheduledReminders) de rattacher l'issue à
        // l'entité d'origine (Abonnement / Reservation_Billet) et à la
        // fonctionnalité émettrice, sans impacter les flux existants.
        correlationId: item.correlationId,
        featureSource: item.featureSource,
      });
      continue;
    }

    // Échec → ré-essai borné (Ex. 4.5). On réenfile tant que des tentatives
    // restent disponibles ; sinon, issue « failed » journalisée (Ex. 11.3).
    // `onFailure` reçoit l'élément AVEC son compteur d'origine (`item.attempts`,
    // soit le nombre de tentatives déjà effectuées avant celle-ci) : il
    // l'incrémente lui-même pour comptabiliser la tentative qui vient d'échouer.
    const errorReason = (sendResult && sendResult.error) || 'send_failed';
    const failure = onFailure(queue, item, cfg);
    queue = failure.queue;

    if (!failure.retried) {
      await safeLogReminder(
        logReminder,
        toHistoryEntry(item, 'failed', { errorReason })
      );
      failed += 1;
      emitResult({
        customerId: item.customerId,
        status: 'failed',
        error: errorReason,
        attempts,
        correlationId: item.correlationId,
        featureSource: item.featureSource,
      });
    }
    // Si `retried`, l'élément est de retour en file : pas d'issue terminale ni
    // d'entrée d'historique pour l'instant.
  }

  return { sent, failed, blocked, results };
};

// ---------------------------------------------------------------------------
// runScheduledReminders — relances d'abonnement & rappels de vol (effets de bord)
// ---------------------------------------------------------------------------
//
// Orchestration des relances de renouvellement d'Abonnement (Req 10.4, 10.8) et
// des rappels de Reservation_Billet (Req 12.5, 12.8). Réutilise SANS DUPLIQUER :
//   - les prédicats PURS de planification (reminderSchedule.js) pour sélectionner
//     les entités dont la relance/le rappel est dû à l'instant courant injecté ;
//   - l'orchestration de débit/file/ré-essai existante (runReminderBatch →
//     rateLimiter + reminderQueue) pour respecter la Limite_de_Debit et borner
//     les ré-essais sans interrompre le lot (Req 13.4, 13.5) ;
//   - le Service_Envoi unique (whatsappClient.sendWhatsApp) comme seul canal
//     d'envoi (Req 13.1, 13.3), enrichi de `featureSource`/`agencyId`/
//     `whatsappNumberId` consignés dans l'Historique_Messages_WhatsApp (Req 13.2) ;
//   - les fonctions pures d'Historique_Rappels (subscriptionValidation.js :
//     buildReminderHistoryEntry / appendReminderHistoryEntry) pour journaliser
//     exactement une entrée horodatée par tentative (Req 10.8, 12.8).
//
// La persistance de l'Historique_Rappels (colonne JSONB de l'Abonnement /
// Reservation_Billet) et la programmation d'un ré-essai différé sont INJECTÉES
// (`persistReminderHistory`, `scheduleRetry`) afin de garder l'orchestration
// testable sans réseau ni horloge réelle. Un échec de persistance ou d'envoi
// n'interrompt jamais les autres relances (Req 13.5).
//
// Exigences couvertes : 10.4, 10.8, 12.5, 12.8, 13.5.

/** Type d'entrée d'Historique_Rappels pour un rappel de vol (Req 12.8). */
export const REMINDER_TYPE_FLIGHT = 'rappel_vol';

/** Fonctionnalités émettrices consignées dans l'Historique_Messages_WhatsApp. */
export const FEATURE_SOURCE_SUBSCRIPTION = 'subscription_reminder';
export const FEATURE_SOURCE_FLIGHT = 'flight_reminder';

/** Genres d'entité portant un Historique_Rappels. */
export const REMINDER_ENTITY_SUBSCRIPTION = 'subscription';
export const REMINDER_ENTITY_FLIGHT = 'flight_booking';

/**
 * Lit la première valeur définie parmi une liste de clés candidates d'un objet
 * (tolère les formes camelCase et snake_case provenant de la base).
 *
 * @param {Object} source
 * @param {string[]} keys
 * @returns {*}
 */
const pick = (source, keys) => {
  if (!source || typeof source !== 'object') return undefined;
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
};

/**
 * Convertit une date (ms epoch, Date ou chaîne ISO) en millisecondes epoch UTC,
 * ou `undefined` si non interprétable.
 *
 * @param {number|Date|string} value
 * @returns {number|undefined}
 */
const toEpochMs = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? undefined : ms;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? undefined : ms;
  }
  return undefined;
};

/**
 * Construit la liste des relances/rappels DUS à l'instant `nowMs` (fonction
 * PURE). Sélectionne, parmi les Abonnements et Reservation_Billet candidats,
 * ceux dont la relance/le rappel est dû via les prédicats purs de
 * `reminderSchedule.js`, et projette chacun en un item prêt pour
 * `runReminderBatch`, porteur des métadonnées de corrélation et d'historique.
 *
 * Aucun effet de bord, horloge injectée (`nowMs`).
 *
 * @param {Object} params
 * @param {number} params.nowMs                       instant courant (ms epoch UTC)
 * @param {Array<Object>} [params.subscriptions]      Abonnements candidats
 * @param {Array<Object>} [params.flightBookings]     Reservation_Billet candidates
 * @returns {{ reminders: Object[], dueSubscriptions: Object[], dueFlights: Object[] }}
 */
export const buildScheduledReminders = ({
  nowMs,
  subscriptions = [],
  flightBookings = [],
} = {}) => {
  const reminders = [];
  const dueSubscriptions = [];
  const dueFlights = [];

  const subs = Array.isArray(subscriptions) ? subscriptions : [];
  for (const sub of subs) {
    if (!sub || typeof sub !== 'object') continue;
    const renewalMs = toEpochMs(pick(sub, ['renewalDateMs', 'renewal_date', 'renewalDate']));
    const thresholdDays =
      pick(sub, ['reminderThresholdDays', 'renewal_threshold_days']) ??
      RENEWAL_THRESHOLD_DEFAULT_DAYS;
    if (renewalMs === undefined) continue;
    if (!isSubscriptionReminderDue(nowMs, renewalMs, thresholdDays)) continue;

    dueSubscriptions.push(sub);
    const id = pick(sub, ['id', 'subscriptionId', 'subscription_id']);
    reminders.push({
      customerId: pick(sub, ['customerId', 'customer_id']),
      phone: pick(sub, ['phone', 'customerPhone', 'customer_phone', 'whatsapp']),
      content: pick(sub, ['content', 'message']) ?? '',
      scenario: FEATURE_SOURCE_SUBSCRIPTION,
      triggerSource: 'scheduled',
      featureSource: FEATURE_SOURCE_SUBSCRIPTION,
      agencyId: pick(sub, ['agencyId', 'agency_id']),
      whatsappNumberId: pick(sub, ['whatsappNumberId', 'whatsapp_number_id']),
      reminderType: REMINDER_TYPE_RENEWAL,
      entityKind: REMINDER_ENTITY_SUBSCRIPTION,
      entityId: id,
      reminderHistory: pick(sub, ['reminderHistory', 'reminder_history']) ?? [],
      correlationId: `${REMINDER_ENTITY_SUBSCRIPTION}:${id}`,
    });
  }

  const flights = Array.isArray(flightBookings) ? flightBookings : [];
  for (const flight of flights) {
    if (!flight || typeof flight !== 'object') continue;
    const flightMs = toEpochMs(
      pick(flight, ['flightInstantMs', 'flightDateMs', 'flight_date', 'flightDate'])
    );
    const leadHours =
      pick(flight, ['flightLeadTimeHours', 'flight_lead_time_hours']) ??
      FLIGHT_LEAD_TIME_DEFAULT_HOURS;
    if (flightMs === undefined) continue;
    if (!isFlightReminderDue(nowMs, flightMs, leadHours)) continue;

    dueFlights.push(flight);
    const id = pick(flight, ['id', 'flightBookingId', 'flight_booking_id']);
    reminders.push({
      customerId: pick(flight, ['customerId', 'customer_id']),
      phone: pick(flight, [
        'phone',
        'customerWhatsapp',
        'customer_whatsapp',
        'whatsapp',
      ]),
      content: pick(flight, ['content', 'message']) ?? '',
      scenario: FEATURE_SOURCE_FLIGHT,
      triggerSource: 'scheduled',
      featureSource: FEATURE_SOURCE_FLIGHT,
      agencyId: pick(flight, ['agencyId', 'agency_id']),
      whatsappNumberId: pick(flight, ['whatsappNumberId', 'whatsapp_number_id']),
      reminderType: REMINDER_TYPE_FLIGHT,
      entityKind: REMINDER_ENTITY_FLIGHT,
      entityId: id,
      reminderHistory: pick(flight, ['reminderHistory', 'reminder_history']) ?? [],
      correlationId: `${REMINDER_ENTITY_FLIGHT}:${id}`,
    });
  }

  return { reminders, dueSubscriptions, dueFlights };
};

/**
 * @typedef {Object} ScheduledReminderResult
 * @property {'subscription'|'flight_booking'} entityKind  genre d'entité concernée
 * @property {string} entityId                             identifiant de l'entité
 * @property {'sent'|'failed'} status                      issue terminale de l'envoi
 * @property {string} [messageId]                          identifiant passerelle si succès
 * @property {string} [error]                              cause si échec
 * @property {Object} historyEntry                         entrée ajoutée à l'Historique_Rappels
 * @property {Array} history                               Historique_Rappels après ajout
 * @property {boolean} retryScheduled                      un ré-essai différé a-t-il été programmé
 */

/**
 * Exécute les relances de renouvellement d'Abonnement et les rappels de vol dus
 * à l'instant courant injecté.
 *
 * Déroulé :
 *   1. Sélectionne les entités dues via `buildScheduledReminders` (prédicats
 *      purs de planification).
 *   2. Délègue l'envoi effectif à `runReminderBatch`, qui pilote la
 *      Limite_de_Debit, l'espacement minimal et les ré-essais bornés, et envoie
 *      via le Service_Envoi unique (Req 13.1, 13.3, 13.4). Chaque envoi est
 *      consigné dans l'Historique_Messages_WhatsApp par le Service_Envoi
 *      (featureSource/agencyId/whatsappNumberId, Req 13.2).
 *   3. Pour chaque issue terminale (succès/échec), construit exactement une
 *      entrée d'Historique_Rappels horodatée (type + résultat) et la persiste
 *      via `persistReminderHistory` (injectée, résiliente) — Req 10.8, 12.8.
 *   4. En cas d'échec définitif, programme un ré-essai non bloquant via
 *      `scheduleRetry` (injectée) sans interrompre les autres relances ; à
 *      défaut, l'entité restant due sera de toute façon re-sélectionnée au
 *      prochain passage planifié (Req 13.5).
 *
 * Toutes les dépendances à effet de bord sont injectables (envoi, persistance,
 * ré-essai, horloge), ce qui rend l'orchestration testable sans réseau.
 *
 * @param {Object} params
 * @param {Object} [params.supabase]                    client Supabase (transmis à `sendFn`/persistance)
 * @param {Function} [params.sendFn=sendWhatsApp]       Service_Envoi unique
 * @param {number} [params.nowMs]                       instant courant (ms epoch UTC) ; défaut : horloge injectée/système
 * @param {Array<Object>} [params.subscriptions]        Abonnements candidats
 * @param {Array<Object>} [params.flightBookings]       Reservation_Billet candidates
 * @param {Object} [params.config]                      configuration de débit/ré-essai (cf. runReminderBatch)
 * @param {Function|Object} [params.clock]              horloge injectable (cf. normalizeClock)
 * @param {Function} [params.persistReminderHistory]    ({kind, entityId, entry, history, supabase}) => void|Promise (résiliente)
 * @param {Function} [params.scheduleRetry]             ({entityKind, entityId, reminder, error, supabase}) => void|Promise (résiliente)
 * @param {Function} [params.onResult]                  rappel par issue terminale (ScheduledReminderResult)
 * @returns {Promise<{ sent: number, failed: number, results: ScheduledReminderResult[] }>}
 */
export const runScheduledReminders = async ({
  supabase,
  sendFn = sendWhatsApp,
  nowMs,
  subscriptions = [],
  flightBookings = [],
  config = {},
  clock,
  persistReminderHistory,
  scheduleRetry,
  onResult,
} = {}) => {
  // Horloge : on privilégie `nowMs` explicite ; sinon l'horloge injectée ;
  // sinon l'horloge système (via normalizeClock). La même horloge sert à la
  // sélection des dus et à l'horodatage des entrées d'historique.
  const tick = normalizeClock(
    clock ?? (typeof nowMs === 'number' ? () => nowMs : undefined)
  );
  const referenceNow = typeof nowMs === 'number' ? nowMs : tick.now();

  const { reminders } = buildScheduledReminders({
    nowMs: referenceNow,
    subscriptions,
    flightBookings,
  });

  // Index des items par identifiant de corrélation pour rattacher chaque issue
  // terminale à son entité d'origine (Abonnement / Reservation_Billet).
  const itemByCorrelation = new Map();
  for (const reminder of reminders) {
    itemByCorrelation.set(reminder.correlationId, reminder);
  }

  // Délègue l'envoi/le débit/les ré-essais bornés à l'orchestration existante.
  const batch = await runReminderBatch({
    supabase,
    sendFn,
    reminders,
    config,
    clock: tick,
  });

  /** @type {ScheduledReminderResult[]} */
  const results = [];
  let sent = 0;
  let failed = 0;

  for (const outcome of batch.results) {
    const item = itemByCorrelation.get(outcome.correlationId);
    if (!item) continue; // sécurité : issue non corrélée (ne devrait pas arriver)

    const success = outcome.status === 'sent';

    // Une entrée d'Historique_Rappels par tentative (Req 10.8, 12.8).
    const historyEntry = buildReminderHistoryEntry({
      type: item.reminderType,
      success,
      timestamp: tick.now(),
      error: success ? undefined : outcome.error,
    });
    const history = appendReminderHistoryEntry(item.reminderHistory, historyEntry);

    // Persistance résiliente de l'Historique_Rappels (Req 10.8, 12.8) : un échec
    // de persistance n'interrompt jamais le traitement des autres relances.
    if (typeof persistReminderHistory === 'function') {
      try {
        await persistReminderHistory({
          kind: item.entityKind,
          entityId: item.entityId,
          entry: historyEntry,
          history,
          supabase,
        });
      } catch (err) {
        console.error(
          'runScheduledReminders: persistance Historique_Rappels ignorée:',
          err?.message
        );
      }
    }

    // Échec définitif → programmation d'un ré-essai non bloquant (Req 13.5).
    let retryScheduled = false;
    if (!success && typeof scheduleRetry === 'function') {
      try {
        await scheduleRetry({
          entityKind: item.entityKind,
          entityId: item.entityId,
          reminder: item,
          error: outcome.error,
          supabase,
        });
        retryScheduled = true;
      } catch (err) {
        console.error(
          'runScheduledReminders: programmation du ré-essai ignorée:',
          err?.message
        );
      }
    }

    if (success) sent += 1;
    else failed += 1;

    const result = {
      entityKind: item.entityKind,
      entityId: item.entityId,
      status: outcome.status,
      messageId: outcome.messageId,
      error: outcome.error,
      historyEntry,
      history,
      retryScheduled,
    };
    results.push(result);

    if (typeof onResult === 'function') {
      try {
        onResult(result);
      } catch (err) {
        console.error(
          'runScheduledReminders: onResult a levé une exception ignorée:',
          err?.message
        );
      }
    }
  }

  return { sent, failed, results };
};
