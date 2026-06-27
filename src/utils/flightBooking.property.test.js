import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { roundHalfUp } from './finance';
import { computeFlightProfit, validateFlightBooking } from './flightBooking';

const RUNS = { numRuns: 100 };

// Date de référence fixe pour rendre les générateurs de dates déterministes.
const TODAY = new Date('2024-06-15T10:30:00');
const DAY_MS = 24 * 60 * 60 * 1000;

// Formate une Date en chaîne `YYYY-MM-DD` (jour local).
const toYMD = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

describe('flightBooking.js — bénéfice et validation de réservation (P22)', () => {
  // Feature: agency-operations-expansion, Property 22: Calcul du bénéfice de réservation de billet et validation — pour tout prix client et prix agence, computeFlightProfit === roundHalfUp(prixClient − prixAgence, 2) ; et pour toute saisie de Reservation_Billet, la validation rejette une date de vol antérieure à la date du jour, un numéro de billet vide, ou un prix (client ou agence) négatif.
  // Validates: Requirements 12.3, 12.4

  it('P22a — computeFlightProfit égale roundHalfUp(prixClient − prixAgence, 2)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1e7, noNaN: true }),
        fc.double({ min: 0, max: 1e7, noNaN: true }),
        (prixClient, prixAgence) => {
          expect(computeFlightProfit(prixClient, prixAgence)).toBe(
            roundHalfUp(prixClient - prixAgence, 2)
          );
        }
      ),
      RUNS
    );
  });

  it('P22b — une saisie valide (date >= aujourd’hui, billet non vide, prix >= 0) est acceptée', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 365 }), // jours dans le futur (0 = aujourd'hui, accepté)
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim() !== ''),
        fc.double({ min: 0, max: 1e7, noNaN: true }),
        fc.double({ min: 0, max: 1e7, noNaN: true }),
        (daysAhead, ticketNumber, agencyPrice, customerPrice) => {
          const flightDate = toYMD(new Date(TODAY.getTime() + daysAhead * DAY_MS));
          const result = validateFlightBooking(
            { ticketNumber, flightDate, agencyPrice, customerPrice },
            TODAY
          );
          expect(result.ok).toBe(true);
        }
      ),
      RUNS
    );
  });

  it('P22c — date de vol antérieure à la date du jour est rejetée (champ flightDate)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 365 }), // jours dans le passé
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim() !== ''),
        fc.double({ min: 0, max: 1e7, noNaN: true }),
        fc.double({ min: 0, max: 1e7, noNaN: true }),
        (daysBack, ticketNumber, agencyPrice, customerPrice) => {
          const flightDate = toYMD(new Date(TODAY.getTime() - daysBack * DAY_MS));
          const result = validateFlightBooking(
            { ticketNumber, flightDate, agencyPrice, customerPrice },
            TODAY
          );
          expect(result.ok).toBe(false);
          expect(result.field).toBe('flightDate');
        }
      ),
      RUNS
    );
  });

  it('P22d — numéro de billet vide (ou espaces) est rejeté (champ ticketNumber)', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(''),
          fc.constant('   '),
          fc.constant(null),
          fc.constant(undefined),
          fc.stringMatching(/^\s+$/)
        ),
        fc.integer({ min: 0, max: 365 }),
        fc.double({ min: 0, max: 1e7, noNaN: true }),
        fc.double({ min: 0, max: 1e7, noNaN: true }),
        (ticketNumber, daysAhead, agencyPrice, customerPrice) => {
          const flightDate = toYMD(new Date(TODAY.getTime() + daysAhead * DAY_MS));
          const result = validateFlightBooking(
            { ticketNumber, flightDate, agencyPrice, customerPrice },
            TODAY
          );
          expect(result.ok).toBe(false);
          expect(result.field).toBe('ticketNumber');
        }
      ),
      RUNS
    );
  });

  it('P22e — un prix (client ou agence) négatif est rejeté', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim() !== ''),
        fc.integer({ min: 0, max: 365 }),
        fc.double({ min: -1e7, max: -0.01, noNaN: true }), // prix négatif
        fc.double({ min: 0, max: 1e7, noNaN: true }),
        fc.boolean(), // applique le prix négatif à l'agence ou au client
        (ticketNumber, daysAhead, negative, nonNegative, onAgency) => {
          const flightDate = toYMD(new Date(TODAY.getTime() + daysAhead * DAY_MS));
          const input = onAgency
            ? { ticketNumber, flightDate, agencyPrice: negative, customerPrice: nonNegative }
            : { ticketNumber, flightDate, agencyPrice: nonNegative, customerPrice: negative };
          const result = validateFlightBooking(input, TODAY);
          expect(result.ok).toBe(false);
          expect(result.field).toBe(onAgency ? 'agencyPrice' : 'customerPrice');
        }
      ),
      RUNS
    );
  });
});
