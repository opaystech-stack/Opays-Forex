// Tests d'exemple — Canal WhatsApp UNIQUE (Service_Envoi partagé).
//
// Vérifie que toute communication WhatsApp sortante de l'Application — quelle
// que soit la fonctionnalité émettrice (publication d'offre, commande à
// distance, relance d'abonnement, rappel de vol, campagne marketing) — passe
// par l'unique fonction Edge `whatsapp-send` (Passerelle_WhatsApp) et consigne
// exactement une entrée dans l'Historique_Messages_WhatsApp partagé
// (`whatsapp_messages`).
//
// Feature: agency-operations-expansion
// Validates: Requirements 13.1, 13.3, 13.5

import { describe, it, expect, vi } from 'vitest';
import { sendWhatsApp, VALID_FEATURE_SOURCES } from './whatsappClient.js';

// Numéro destinataire valide au format international E.164.
const VALID_PHONE = '+243812345678';
const AGENCY_ID = 'agency-001';
const WHATSAPP_NUMBER_ID = 'wa-num-001';

/**
 * Construit un client Supabase factice traçant les appels :
 *  - `functions.invoke` : appel réseau vers la fonction Edge.
 *  - `from(...).insert` : écriture dans `whatsapp_messages`.
 *
 * @param {Object} [opts]
 * @param {Object} [opts.invokeResult] valeur résolue par functions.invoke
 * @param {Function} [opts.insertImpl] implémentation custom de insert (ex. rejet)
 */
const makeSupabase = ({ invokeResult, insertImpl } = {}) => {
  const invoke = vi
    .fn()
    .mockResolvedValue(
      invokeResult ?? { data: { success: true, messageId: 'msg-1' }, error: null }
    );
  const insert = vi.fn(insertImpl ?? (() => Promise.resolve({ error: null })));
  const from = vi.fn(() => ({ insert }));
  return {
    client: { functions: { invoke }, from },
    invoke,
    insert,
    from,
  };
};

describe('sendWhatsApp — canal unique whatsapp-send (Req 13.1, 13.3)', () => {
  it("expose exactement les cinq fonctionnalités émettrices autorisées", () => {
    expect([...VALID_FEATURE_SOURCES].sort()).toEqual(
      [
        'publication',
        'remote_order',
        'subscription_reminder',
        'flight_reminder',
        'marketing',
      ].sort()
    );
  });

  // Req 13.1 / 13.3 : chaque fonctionnalité passe par l'UNIQUE Service_Envoi
  // (`whatsapp-send`) et consigne EXACTEMENT une entrée bien formée.
  for (const featureSource of VALID_FEATURE_SOURCES) {
    it(`feature_source="${featureSource}" passe par whatsapp-send et consigne une entrée`, async () => {
      const sb = makeSupabase();

      const result = await sendWhatsApp({
        supabase: sb.client,
        to: VALID_PHONE,
        message: `message ${featureSource}`,
        featureSource,
        agencyId: AGENCY_ID,
        whatsappNumberId: WHATSAPP_NUMBER_ID,
      });

      // Succès normalisé.
      expect(result).toEqual({ success: true, messageId: 'msg-1' });

      // Canal UNIQUE : un seul appel réseau, vers la fonction Edge whatsapp-send.
      expect(sb.invoke).toHaveBeenCalledTimes(1);
      expect(sb.invoke).toHaveBeenCalledWith('whatsapp-send', {
        body: { to: VALID_PHONE, message: `message ${featureSource}` },
      });

      // Historique partagé : EXACTEMENT une écriture dans whatsapp_messages.
      expect(sb.from).toHaveBeenCalledWith('whatsapp_messages');
      expect(sb.insert).toHaveBeenCalledTimes(1);

      const entry = sb.insert.mock.calls[0][0];
      expect(entry).toMatchObject({
        agency_id: AGENCY_ID,
        whatsapp_number_id: WHATSAPP_NUMBER_ID,
        feature_source: featureSource,
        recipient: VALID_PHONE,
        content: `message ${featureSource}`,
        status: 'sent',
        provider_message_id: 'msg-1',
      });
    });
  }

  it("consigne l'échec (status=failed) quand la passerelle retourne une erreur, sans interrompre (Req 13.5)", async () => {
    const sb = makeSupabase({
      invokeResult: { data: { success: false, error: 'gateway_down' }, error: null },
    });

    const result = await sendWhatsApp({
      supabase: sb.client,
      to: VALID_PHONE,
      message: 'rappel de vol',
      featureSource: 'flight_reminder',
      agencyId: AGENCY_ID,
      whatsappNumberId: WHATSAPP_NUMBER_ID,
    });

    expect(result.success).toBe(false);
    expect(sb.invoke).toHaveBeenCalledTimes(1);
    expect(sb.insert).toHaveBeenCalledTimes(1);
    expect(sb.insert.mock.calls[0][0]).toMatchObject({
      feature_source: 'flight_reminder',
      agency_id: AGENCY_ID,
      status: 'failed',
      error_reason: 'gateway_down',
    });
  });
});

describe('sendWhatsApp — Limite_de_Debit (Req 13.4) : aucun appel réseau, entrée queued', () => {
  // Limiteur configuré pour REFUSER l'envoi à l'instant courant : un envoi
  // récent sature déjà la fenêtre (maxPerInterval=1).
  const makeBlockingRateLimiter = () => ({
    getState: () => ({ sends: [1000], lastSentAtMs: 1000 }),
    setState: vi.fn(),
    config: { maxPerInterval: 1, intervalMs: 60000, minSpacingMs: 5000 },
    now: () => 1000,
  });

  it('un envoi limité ne fait AUCUN appel réseau et consigne une entrée queued', async () => {
    const sb = makeSupabase();
    const rateLimiter = makeBlockingRateLimiter();

    const result = await sendWhatsApp({
      supabase: sb.client,
      to: VALID_PHONE,
      message: 'campagne marketing',
      featureSource: 'marketing',
      agencyId: AGENCY_ID,
      whatsappNumberId: WHATSAPP_NUMBER_ID,
      rateLimiter,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('rate_limited');
    expect(typeof result.nextAllowedAtMs).toBe('number');

    // Canal unique respecté : aucun appel réseau lorsque le débit est atteint.
    expect(sb.invoke).not.toHaveBeenCalled();
    // L'envoi différé est tout de même consigné (status=queued).
    expect(sb.insert).toHaveBeenCalledTimes(1);
    expect(sb.insert.mock.calls[0][0]).toMatchObject({
      feature_source: 'marketing',
      agency_id: AGENCY_ID,
      status: 'queued',
    });
    // L'état du limiteur n'est pas avancé puisque rien n'a été envoyé.
    expect(rateLimiter.setState).not.toHaveBeenCalled();
  });

  it("un envoi autorisé enregistre l'envoi dans le limiteur puis appelle whatsapp-send", async () => {
    const sb = makeSupabase();
    const setState = vi.fn();
    const rateLimiter = {
      getState: () => ({ sends: [], lastSentAtMs: null }),
      setState,
      config: { maxPerInterval: 5, intervalMs: 60000, minSpacingMs: 0 },
      now: () => 10000,
    };

    const result = await sendWhatsApp({
      supabase: sb.client,
      to: VALID_PHONE,
      message: 'publication offre',
      featureSource: 'publication',
      agencyId: AGENCY_ID,
      rateLimiter,
    });

    expect(result).toEqual({ success: true, messageId: 'msg-1' });
    expect(setState).toHaveBeenCalledTimes(1);
    expect(sb.invoke).toHaveBeenCalledTimes(1);
    expect(sb.insert).toHaveBeenCalledTimes(1);
    expect(sb.insert.mock.calls[0][0]).toMatchObject({ status: 'sent' });
  });
});

describe('sendWhatsApp — résilience de la journalisation (Req 13.5)', () => {
  it("un échec d'écriture dans whatsapp_messages ne fait jamais échouer l'envoi", async () => {
    const sb = makeSupabase({
      insertImpl: () => Promise.reject(new Error('db indisponible')),
    });

    // L'appel ne doit JAMAIS lever, malgré le rejet de l'insertion.
    const result = await sendWhatsApp({
      supabase: sb.client,
      to: VALID_PHONE,
      message: 'relance abonnement',
      featureSource: 'subscription_reminder',
      agencyId: AGENCY_ID,
      whatsappNumberId: WHATSAPP_NUMBER_ID,
    });

    // L'envoi a réussi côté passerelle même si la journalisation a échoué.
    expect(result).toEqual({ success: true, messageId: 'msg-1' });
    expect(sb.invoke).toHaveBeenCalledTimes(1);
    expect(sb.insert).toHaveBeenCalledTimes(1);
  });

  it("un échec de journalisation d'un envoi queued (rate-limited) ne lève pas non plus", async () => {
    const sb = makeSupabase({
      insertImpl: () => {
        throw new Error('écriture synchrone impossible');
      },
    });
    const rateLimiter = {
      getState: () => ({ sends: [1000], lastSentAtMs: 1000 }),
      setState: vi.fn(),
      config: { maxPerInterval: 1, intervalMs: 60000, minSpacingMs: 5000 },
      now: () => 1000,
    };

    const result = await sendWhatsApp({
      supabase: sb.client,
      to: VALID_PHONE,
      message: 'campagne',
      featureSource: 'marketing',
      agencyId: AGENCY_ID,
      rateLimiter,
    });

    expect(result.error).toBe('rate_limited');
    expect(sb.invoke).not.toHaveBeenCalled();
    expect(sb.insert).toHaveBeenCalledTimes(1);
  });
});
