import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  isSubscriptionReminderDue,
  isFlightReminderDue,
  isValidRenewalThreshold,
  isValidFlightLeadTime,
  RENEWAL_THRESHOLD_MIN_DAYS,
  RENEWAL_THRESHOLD_MAX_DAYS,
  FLIGHT_LEAD_TIME_MIN_HOURS,
  FLIGHT_LEAD_TIME_MAX_HOURS,
} from './reminderSchedule';

// Oracles d'unités indépendants de l'implémentation.
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

describe('reminderSchedule — Property 23 : déclenchement temporel des relances et rappels', () => {
  // Feature: agency-operations-expansion, Property 23: Déclenchement temporel des relances et rappels
  // Pour tout instant courant : une relance d'abonnement est due si et seulement si
  // now >= dateRenouvellement - seuilJours ; un rappel de vol est dû si et seulement si
  // now >= instantVol - délaiHeures.
  // Validates: Requirements 10.4, 12.5

  // Instants epoch (ms) bornés à des valeurs réalistes mais larges (~ +/- des décennies).
  const instantMs = fc.integer({ min: -2_000_000_000_000, max: 4_000_000_000_000 });
  const validThreshold = fc.integer({
    min: RENEWAL_THRESHOLD_MIN_DAYS,
    max: RENEWAL_THRESHOLD_MAX_DAYS,
  });
  const validLeadTime = fc.integer({
    min: FLIGHT_LEAD_TIME_MIN_HOURS,
    max: FLIGHT_LEAD_TIME_MAX_HOURS,
  });

  it('relance abonnement due ssi now >= renouvellement - seuilJours', () => {
    fc.assert(
      fc.property(instantMs, instantMs, validThreshold, (nowMs, renewalDateMs, seuilJours) => {
        const reminderInstant = renewalDateMs - seuilJours * MS_PER_DAY;
        const expected = nowMs >= reminderInstant;
        expect(isSubscriptionReminderDue(nowMs, renewalDateMs, seuilJours)).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  it('rappel de vol dû ssi now >= instantVol - délaiHeures', () => {
    fc.assert(
      fc.property(instantMs, instantMs, validLeadTime, (nowMs, flightInstantMs, delaiHeures) => {
        const reminderInstant = flightInstantMs - delaiHeures * MS_PER_HOUR;
        const expected = nowMs >= reminderInstant;
        expect(isFlightReminderDue(nowMs, flightInstantMs, delaiHeures)).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  it('frontière exacte : à l\'instant de déclenchement la relance/le rappel est dû (>=)', () => {
    fc.assert(
      fc.property(instantMs, validThreshold, validLeadTime, (targetMs, seuilJours, delaiHeures) => {
        // Abonnement : now exactement à l'instant de déclenchement => dû.
        const subReminder = targetMs - seuilJours * MS_PER_DAY;
        expect(isSubscriptionReminderDue(subReminder, targetMs, seuilJours)).toBe(true);
        // Une milliseconde avant => non dû.
        expect(isSubscriptionReminderDue(subReminder - 1, targetMs, seuilJours)).toBe(false);

        // Vol : même logique de frontière.
        const flightReminder = targetMs - delaiHeures * MS_PER_HOUR;
        expect(isFlightReminderDue(flightReminder, targetMs, delaiHeures)).toBe(true);
        expect(isFlightReminderDue(flightReminder - 1, targetMs, delaiHeures)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('aucune relance/aucun rappel sur configuration invalide (seuil/délai hors bornes ou entrée non finie)', () => {
    const invalidThreshold = fc.oneof(
      fc.integer({ min: -50, max: 0 }),
      fc.integer({ min: 31, max: 200 }),
      fc.double({ min: 1, max: 30, noInteger: true }),
      fc.constantFrom(NaN, Infinity, -Infinity, null, undefined)
    );
    const invalidLeadTime = fc.oneof(
      fc.integer({ min: -50, max: 0 }),
      fc.integer({ min: 169, max: 1000 }),
      fc.double({ min: 1, max: 168, noInteger: true }),
      fc.constantFrom(NaN, Infinity, -Infinity, null, undefined)
    );
    fc.assert(
      fc.property(instantMs, instantMs, invalidThreshold, (nowMs, targetMs, badSeuil) => {
        expect(isSubscriptionReminderDue(nowMs, targetMs, badSeuil)).toBe(false);
      }),
      { numRuns: 100 }
    );
    fc.assert(
      fc.property(instantMs, instantMs, invalidLeadTime, (nowMs, targetMs, badDelai) => {
        expect(isFlightReminderDue(nowMs, targetMs, badDelai)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('entrée temporelle non finie (NaN/Infinity/null) ne déclenche jamais', () => {
    const nonFinite = fc.constantFrom(NaN, Infinity, -Infinity, null, undefined, '0', {});
    fc.assert(
      fc.property(nonFinite, instantMs, (badInstant, valid) => {
        expect(isSubscriptionReminderDue(badInstant, valid, 3)).toBe(false);
        expect(isSubscriptionReminderDue(valid, badInstant, 3)).toBe(false);
        expect(isFlightReminderDue(badInstant, valid, 48)).toBe(false);
        expect(isFlightReminderDue(valid, badInstant, 48)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });
});

describe('reminderSchedule — Property 24 : validation des bornes de seuil et de délai', () => {
  // Feature: agency-operations-expansion, Property 24: Validation des bornes de seuil et de délai
  // Pour toute valeur entière, isValidRenewalThreshold accepte ssi elle est dans [1, 30] (défaut 3),
  // et isValidFlightLeadTime accepte ssi elle est dans [1, 168] (défaut 48) ; toute valeur hors
  // borne est rejetée.
  // Validates: Requirements 10.5, 10.6, 12.6, 12.7

  it('isValidRenewalThreshold accepte ssi entier dans [1, 30]', () => {
    fc.assert(
      fc.property(fc.integer({ min: -100, max: 200 }), (jours) => {
        const expected = jours >= 1 && jours <= 30;
        expect(isValidRenewalThreshold(jours)).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  it('isValidFlightLeadTime accepte ssi entier dans [1, 168]', () => {
    fc.assert(
      fc.property(fc.integer({ min: -100, max: 400 }), (heures) => {
        const expected = heures >= 1 && heures <= 168;
        expect(isValidFlightLeadTime(heures)).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  it('rejette toute valeur non entière ou non numérique (décimale, NaN, Infinity, null, chaîne)', () => {
    const nonInteger = fc.oneof(
      fc.double({ min: -10, max: 200, noInteger: true }),
      fc.constantFrom(NaN, Infinity, -Infinity, null, undefined, '3', '48', {}, [])
    );
    fc.assert(
      fc.property(nonInteger, (value) => {
        expect(isValidRenewalThreshold(value)).toBe(false);
        expect(isValidFlightLeadTime(value)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('bornes exactes acceptées, juste hors borne rejetées', () => {
    // Seuil de relance : 1 et 30 acceptés ; 0 et 31 rejetés.
    expect(isValidRenewalThreshold(1)).toBe(true);
    expect(isValidRenewalThreshold(30)).toBe(true);
    expect(isValidRenewalThreshold(0)).toBe(false);
    expect(isValidRenewalThreshold(31)).toBe(false);
    // Délai de rappel : 1 et 168 acceptés ; 0 et 169 rejetés.
    expect(isValidFlightLeadTime(1)).toBe(true);
    expect(isValidFlightLeadTime(168)).toBe(true);
    expect(isValidFlightLeadTime(0)).toBe(false);
    expect(isValidFlightLeadTime(169)).toBe(false);
    // Les valeurs par défaut documentées (3 et 48) sont valides.
    expect(isValidRenewalThreshold(3)).toBe(true);
    expect(isValidFlightLeadTime(48)).toBe(true);
  });
});
