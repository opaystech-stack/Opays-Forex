// Service_Envoi côté client — déclenche un envoi WhatsApp sortant
//
// Ce service valide le numéro destinataire avec la logique pure
// `phoneValidation`, puis délègue l'appel réseau à la fonction Edge Supabase
// `whatsapp-send` (où vivent le secret et l'URL de la passerelle OpenWA).
// Aucun secret n'est manipulé côté client : ce module ne fait qu'invoquer la
// fonction Edge et normaliser le résultat.
//
// Canal UNIQUE (Service_Envoi) : toute communication WhatsApp sortante de
// l'Application — Publication_Offre, Commande_Distante, relance d'abonnement,
// rappel de vol, Campagne_Marketing — passe par cette fonction et la
// Passerelle_WhatsApp `whatsapp-send`. Aucun autre canal n'est employé
// (agency-operations-expansion Req 13.1, 13.3).
//
// Feature: whatsapp-client-reminders (base) ; agency-operations-expansion (extension)
// Requirements: 3.1, 3.2, 3.3 (base) ; 13.1, 13.2, 13.3, 13.4, 13.6 (extension)

import {
  isValidInternationalPhone,
  normalizeForGateway,
} from '../utils/phoneValidation.js';
import { mapGatewayResponse } from '../utils/sendResult.js';
import { canSend, registerSend } from '../utils/rateLimiter.js';

/**
 * Ensemble fermé des fonctionnalités émettrices autorisées, aligné sur la
 * contrainte CHECK de `whatsapp_messages.feature_source`
 * (migration 0003, Req 13.2).
 *
 * @type {ReadonlySet<string>}
 */
export const VALID_FEATURE_SOURCES = new Set([
  'publication',
  'remote_order',
  'subscription_reminder',
  'flight_reminder',
  'marketing',
]);

/**
 * Consigne un message WhatsApp sortant dans l'Historique_Messages_WhatsApp
 * partagé (`whatsapp_messages`, Req 13.2) de manière RÉSILIENTE : un échec
 * d'écriture n'interrompt jamais l'envoi ni les autres fonctionnalités
 * (Req 13.5).
 *
 * La journalisation n'a lieu que pour les appelants de la nouvelle couche
 * agence (présence simultanée de `agencyId` et d'un `featureSource` valide),
 * car la table impose `agency_id NOT NULL` et un `feature_source` borné. Les
 * appelants historiques (whatsapp-client-reminders) qui ne fournissent pas ces
 * champs conservent leur comportement antérieur (aucune écriture ici, l'historique
 * `reminder_history` restant géré par `reminderService`).
 *
 * @param {Object} supabase client Supabase initialisé
 * @param {Object} entry ligne à insérer dans `whatsapp_messages`
 * @returns {Promise<void>}
 */
const logWhatsAppMessage = async (supabase, entry) => {
  if (!supabase || typeof supabase.from !== 'function') return;
  try {
    await supabase.from('whatsapp_messages').insert(entry);
  } catch (err) {
    // Résilience (Req 13.5) : l'échec de journalisation ne bloque pas l'envoi.
    console.error(
      'sendWhatsApp: échec de journalisation whatsapp_messages ignoré:',
      err?.message
    );
  }
};

/**
 * Envoie un message WhatsApp sortant à un Client via la fonction Edge
 * `whatsapp-send` (Service_Envoi unique).
 *
 * Comportement :
 *  1. Valide le numéro avec `isValidInternationalPhone`. Si le numéro est
 *     absent ou invalide → retourne `{ success:false, error:'invalid_phone' }`
 *     **sans aucun appel réseau** (Exigences 3.2, 3.3). Aucune entrée
 *     d'historique n'est créée (aucun message sortant n'a existé).
 *  2. Respect de la Limite_de_Debit (Req 13.4) : si un `rateLimiter` est fourni
 *     et que l'envoi n'est pas autorisé à l'instant courant, aucun appel réseau
 *     n'est fait ; l'envoi est consigné avec le statut `queued` et la fonction
 *     retourne `{ success:false, error:'rate_limited', nextAllowedAtMs }`.
 *     Sinon l'envoi est enregistré dans l'état du limiteur avant l'appel.
 *  3. Invoque `supabase.functions.invoke('whatsapp-send', …)` avec le numéro
 *     normalisé (`normalizeForGateway`) et le message (Exigence 3.1).
 *  4. Consigne l'issue (succès/échec) dans `whatsapp_messages` (Req 13.2) pour
 *     les appelants de la couche agence (cf. `logWhatsAppMessage`).
 *
 * Rétrocompatibilité : les nouveaux paramètres (`featureSource`, `agencyId`,
 * `whatsappNumberId`, `rateLimiter`) sont tous optionnels et par défaut
 * `undefined`. Les appelants existants `sendWhatsApp({ supabase, to, message })`
 * conservent exactement le comportement antérieur (aucune journalisation
 * `whatsapp_messages`, aucune limitation de débit additionnelle à cette couche).
 *
 * @param {object} params
 * @param {object} params.supabase - client Supabase initialisé
 * @param {string} params.to - numéro destinataire (format international)
 * @param {string} params.message - texte déjà composé/résolu
 * @param {('publication'|'remote_order'|'subscription_reminder'|'flight_reminder'|'marketing')} [params.featureSource]
 *   fonctionnalité émettrice consignée dans `whatsapp_messages` (Req 13.2)
 * @param {string} [params.agencyId] - Agence émettrice (Req 13.2)
 * @param {string} [params.whatsappNumberId] - Numero_WhatsApp_Agence émetteur (Req 13.6)
 * @param {object} [params.rateLimiter] - garde de Limite_de_Debit optionnelle (Req 13.4)
 * @param {() => import('../utils/rateLimiter.js').RateLimiterState} params.rateLimiter.getState
 * @param {(state: import('../utils/rateLimiter.js').RateLimiterState) => void} params.rateLimiter.setState
 * @param {import('../utils/rateLimiter.js').RateLimiterConfig} params.rateLimiter.config
 * @param {() => number} [params.rateLimiter.now] - horloge injectable (défaut `Date.now`)
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string, nextAllowedAtMs?: number }>}
 */
export const sendWhatsApp = async ({
  supabase,
  to,
  message,
  featureSource,
  agencyId,
  whatsappNumberId,
  rateLimiter,
}) => {
  // 1. Validation locale du numéro — aucun appel réseau si invalide.
  if (!isValidInternationalPhone(to)) {
    return { success: false, error: 'invalid_phone' };
  }

  // Garde-fou : client Supabase indisponible.
  if (!supabase) {
    return { success: false, error: 'supabase_unavailable' };
  }

  const normalizedTo = normalizeForGateway(to);

  // La journalisation `whatsapp_messages` n'a lieu que pour la couche agence
  // (agency_id NOT NULL + feature_source borné). On valide le featureSource
  // contre l'ensemble fermé pour ne jamais violer la contrainte CHECK.
  const shouldLog =
    !!agencyId && !!featureSource && VALID_FEATURE_SOURCES.has(featureSource);

  const baseLogEntry = shouldLog
    ? {
        agency_id: agencyId,
        whatsapp_number_id: whatsappNumberId ?? null,
        feature_source: featureSource,
        recipient: normalizedTo,
        content: message ?? '',
      }
    : null;

  // 2. Respect de la Limite_de_Debit (Req 13.4) — garde optionnelle réutilisant
  //    le limiteur pur `rateLimiter.js` (état immuable, horloge injectée).
  if (
    rateLimiter &&
    typeof rateLimiter.getState === 'function' &&
    rateLimiter.config
  ) {
    const nowMs =
      typeof rateLimiter.now === 'function' ? rateLimiter.now() : Date.now();
    const state = rateLimiter.getState();
    const decision = canSend(state, nowMs, rateLimiter.config);

    if (!decision.allowed) {
      // Débit atteint : aucun appel réseau, on consigne l'envoi différé.
      if (baseLogEntry) {
        await logWhatsAppMessage(supabase, {
          ...baseLogEntry,
          status: 'queued',
        });
      }
      return {
        success: false,
        error: 'rate_limited',
        nextAllowedAtMs: decision.nextAllowedAtMs,
      };
    }

    // Autorisé : on enregistre l'envoi dans l'état du limiteur avant l'appel.
    if (typeof rateLimiter.setState === 'function') {
      rateLimiter.setState(registerSend(state, nowMs, rateLimiter.config));
    }
  }

  // 3. Invocation de la fonction Edge `whatsapp-send` (canal unique).
  let result;
  try {
    const { data, error } = await supabase.functions.invoke('whatsapp-send', {
      body: {
        to: normalizedTo,
        message,
      },
    });

    // 3a. Erreur au niveau de l'invocation (réseau, fonction injoignable, etc.).
    if (error) {
      result = {
        success: false,
        error: error.message || 'invoke_error',
      };
    } else if (!data) {
      // 3b. Aucune donnée renvoyée par la fonction Edge.
      result = { success: false, error: 'no_response' };
    } else if (data.success === true) {
      // 3c. La fonction Edge renvoie déjà { success, messageId?, error? }.
      //     On s'appuie sur `mapGatewayResponse` pour garantir une forme
      //     normalisée cohérente (succès ssi messageId présent).
      result = mapGatewayResponse({
        httpOk: true,
        messageId: data.messageId,
        error: data.error,
      });
    } else {
      result = {
        success: false,
        error: data.error || 'gateway_error',
      };
    }
  } catch (e) {
    // Exception inattendue lors de l'invocation.
    result = {
      success: false,
      error: e?.message || 'invoke_exception',
    };
  }

  // 4. Journalisation de l'issue dans `whatsapp_messages` (Req 13.2, 13.5).
  if (baseLogEntry) {
    if (result.success) {
      await logWhatsAppMessage(supabase, {
        ...baseLogEntry,
        status: 'sent',
        provider_message_id: result.messageId ?? null,
      });
    } else {
      await logWhatsAppMessage(supabase, {
        ...baseLogEntry,
        status: 'failed',
        error_reason: result.error ?? null,
      });
    }
  }

  return result;
};
