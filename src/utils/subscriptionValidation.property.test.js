import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  validateSubscription,
  canSendMarketingCampaign,
  buildReminderHistoryEntry,
  appendReminderHistoryEntry,
  REMINDER_TYPE_RENEWAL,
  REMINDER_RESULT_SUCCESS,
  REMINDER_RESULT_FAILURE,
} from './subscriptionValidation';

const RUNS = { numRuns: 100 };
const DAY_MS = 86_400_000;

describe('subscriptionValidation.js — Property 21: Validation d’un abonnement', () => {
  // Feature: agency-operations-expansion, Property 21: Validation d'un abonnement — validateSubscription accepte SSI le Fournisseur_Abonnement est actif ET une formule est fournie ET le montant payé est strictement positif ET la date de renouvellement est strictement postérieure à la date du jour ; tout autre cas est rejeté en identifiant le champ invalide.
  // Validates: Requirements 10.2, 10.3
  it('accepte une saisie SSI fournisseur actif, formule fournie, montant > 0 et renouvellement futur', () => {
    const providerArb = fc.oneof(
      fc.constant(true),
      fc.constant(false),
      fc.constant(undefined)
    );
    const planArb = fc.oneof(
      fc.string({ minLength: 1, maxLength: 30 }).map((s) => `F${s}`),
      fc.constant(''),
      fc.constant('   '),
      fc.constant(null),
      fc.constant(123)
    );
    const amountArb = fc.oneof(
      fc.double({ min: 0.0001, max: 1e7, noNaN: true }), // > 0
      fc.double({ min: -1e6, max: 0, noNaN: true }), // <= 0
      fc.constant(0),
      fc.constant(null),
      fc.constant('50') // non numérique (chaîne)
    );
    // Jours calendaires (en ms alignés sur minuit UTC) pour today et renewal.
    const todayDayArb = fc.integer({ min: 18000, max: 20000 });
    const offsetArb = fc.integer({ min: -5, max: 5 });

    fc.assert(
      fc.property(
        providerArb,
        planArb,
        amountArb,
        todayDayArb,
        offsetArb,
        (providerActive, plan, amount, todayDay, offset) => {
          const today = todayDay * DAY_MS;
          const renewalDate = (todayDay + offset) * DAY_MS;

          const providerOk = providerActive === true;
          const planOk = typeof plan === 'string' && plan.trim().length > 0;
          const amountOk =
            typeof amount === 'number' && Number.isFinite(amount) && amount > 0;
          const dateOk = offset > 0;
          const expected = providerOk && planOk && amountOk && dateOk;

          const result = validateSubscription({
            providerActive,
            plan,
            amount,
            renewalDate,
            today,
          });

          expect(result.ok).toBe(expected);
          if (!result.ok) {
            expect(['provider', 'plan', 'amount', 'renewalDate']).toContain(
              result.field
            );
            expect(typeof result.error).toBe('string');
          }
        }
      ),
      RUNS
    );
  });
});

describe('subscriptionValidation.js — Property 25: Consentement marketing requis', () => {
  // Feature: agency-operations-expansion, Property 25: Consentement marketing requis — l'envoi d'une Campagne_Marketing est autorisé SSI le Client a consenti (marketing_consent = true).
  // Validates: Requirements 10.7
  it('autorise l’envoi SSI le consentement est explicitement vrai', () => {
    const consentArb = fc.oneof(
      fc.constant(true),
      fc.constant(false),
      fc.constant(undefined),
      fc.constant(null),
      fc.constant('true'),
      fc.constant(1),
      fc.constant(0)
    );

    fc.assert(
      fc.property(consentArb, (consent) => {
        // Forme booléenne directe.
        expect(canSendMarketingCampaign(consent)).toBe(consent === true);

        // Forme objet Client (camelCase et snake_case).
        const camel = canSendMarketingCampaign({ marketingConsent: consent });
        const snake = canSendMarketingCampaign({ marketing_consent: consent });
        expect(camel).toBe(consent === true);
        expect(snake).toBe(consent === true);
      }),
      RUNS
    );
  });
});

describe('subscriptionValidation.js — Property 26: Entrée d’historique par tentative', () => {
  // Feature: agency-operations-expansion, Property 26: Entrée d'historique par tentative de relance/rappel — pour toute tentative transmise ou échouée, exactement une entrée est ajoutée à l'Historique_Rappels, portant un horodatage, le type et le résultat.
  // Validates: Requirements 10.8, 12.8, 13.2
  it('produit exactement une entrée bien formée et l’ajoute de façon immuable', () => {
    const typeArb = fc.constantFrom(REMINDER_TYPE_RENEWAL, 'rappel_vol', 'marketing');
    const tsArb = fc.integer({ min: 0, max: 4_102_444_800_000 }); // 1970..2100

    fc.assert(
      fc.property(
        fc.array(fc.anything(), { maxLength: 5 }),
        typeArb,
        fc.boolean(),
        tsArb,
        (history, type, success, timestamp) => {
          const entry = buildReminderHistoryEntry({ type, success, timestamp });

          // L'entrée porte un horodatage ISO, le type et le résultat.
          expect(entry.type).toBe(type);
          expect(entry.result).toBe(
            success ? REMINDER_RESULT_SUCCESS : REMINDER_RESULT_FAILURE
          );
          expect(typeof entry.timestamp).toBe('string');
          expect(Number.isNaN(Date.parse(entry.timestamp))).toBe(false);
          expect(entry.timestamp).toBe(new Date(timestamp).toISOString());

          // Ajout immuable : exactement une entrée de plus, sans mutation.
          const before = Array.isArray(history) ? history.length : 0;
          const next = appendReminderHistoryEntry(history, entry);
          expect(next.length).toBe(before + 1);
          expect(next[next.length - 1]).toBe(entry);
          if (Array.isArray(history)) {
            expect(history.length).toBe(before); // historique d'origine non muté
            expect(next).not.toBe(history);
          }
        }
      ),
      RUNS
    );
  });
});
