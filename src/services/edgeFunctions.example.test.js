import { describe, it, expect } from 'vitest';
import {
  isValidInvitationEmail,
  isValidRole,
  isDuplicateInvitationEmail,
  isInvitationExpired,
  INVITATION_EXPIRY_HOURS,
} from '../utils/authorization.js';
import {
  isSubscriptionReminderDue,
  isFlightReminderDue,
  RENEWAL_THRESHOLD_DEFAULT_DAYS,
  FLIGHT_LEAD_TIME_DEFAULT_HOURS,
} from '../utils/reminderSchedule.js';

// Tests d'exemple des Edge Functions (Tâche 14.3).
//
// Les fonctions edge `agency-invite` et `scheduled-reminders` sont des modules
// Deno autonomes qui RÉIMPLÉMENTENT inline la logique pure de `src/utils/`
// (elles ne partagent pas le bundle `src/`). Ces tests valident donc la LOGIQUE
// PURE INJECTÉE — exactement celle reproduite par les edge functions — au moyen
// d'assertions par l'exemple :
//   - agency-invite      → validation/création d'invitation (Req 1.2, 1.6)
//   - scheduled-reminders → sélection des relances/rappels dus (Req 10.4, 12.5)

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// agency-invite — validation et création d'invitation (Req 1.2, 1.6, 1.7)
// ---------------------------------------------------------------------------
describe('Edge agency-invite — validation/création d\'invitation (logique pure)', () => {
  // Req 1.2 / 1.4 : l'edge function rejette tout e-mail malformé via
  // isValidInvitationEmail avant de créer l'agency_invitation `en_attente`.
  describe('validation de l\'e-mail d\'invitation (isValidInvitationEmail)', () => {
    it('accepte un e-mail bien formé', () => {
      expect(isValidInvitationEmail('caissier@agence.cm')).toBe(true);
      expect(isValidInvitationEmail('a@b')).toBe(true);
    });

    it('rejette un e-mail vide, sans @, ou avec espaces', () => {
      expect(isValidInvitationEmail('')).toBe(false);
      expect(isValidInvitationEmail('agence.cm')).toBe(false);
      expect(isValidInvitationEmail('a b@agence.cm')).toBe(false);
      expect(isValidInvitationEmail('deux@@arobases.cm')).toBe(false);
    });

    it('rejette une valeur non chaîne', () => {
      expect(isValidInvitationEmail(null)).toBe(false);
      expect(isValidInvitationEmail(undefined)).toBe(false);
      expect(isValidInvitationEmail(42)).toBe(false);
    });

    it('rejette un e-mail de plus de 254 caractères', () => {
      const local = 'x'.repeat(250);
      const tooLong = `${local}@a.cm`; // 250 + 5 = 255 > 254
      expect(tooLong.length).toBeGreaterThan(254);
      expect(isValidInvitationEmail(tooLong)).toBe(false);
    });
  });

  // Req 1.5 / 2.1 : l'edge function rejette tout rôle hors de l'ensemble fermé.
  describe('validation du rôle (isValidRole)', () => {
    it('accepte les rôles de l\'ensemble fermé', () => {
      for (const role of ['proprietaire', 'gerant', 'caissier', 'observateur']) {
        expect(isValidRole(role)).toBe(true);
      }
    });

    it('rejette un rôle inconnu ou non chaîne', () => {
      expect(isValidRole('admin')).toBe(false);
      expect(isValidRole('')).toBe(false);
      expect(isValidRole(null)).toBe(false);
    });
  });

  // Req 1.6 : un e-mail déjà rattaché à une invitation `en_attente` ou à un
  // membre actif de la même agence est refusé comme doublon (409).
  describe('rejet des doublons (isDuplicateInvitationEmail)', () => {
    const existing = ['proprio@agence.cm', 'Gerant@Agence.cm'];

    it('détecte un doublon insensible à la casse et aux espaces', () => {
      expect(isDuplicateInvitationEmail('proprio@agence.cm', existing)).toBe(true);
      expect(isDuplicateInvitationEmail('  GERANT@AGENCE.CM  ', existing)).toBe(true);
    });

    it('autorise un e-mail nouveau', () => {
      expect(isDuplicateInvitationEmail('nouveau@agence.cm', existing)).toBe(false);
    });

    it('n\'est pas un doublon quand la liste est vide', () => {
      expect(isDuplicateInvitationEmail('proprio@agence.cm', [])).toBe(false);
    });
  });

  // Req 1.7 : à l'acceptation, l'edge function refuse de créer un Compte_Employé
  // au-delà de 168 h via isInvitationExpired.
  describe('expiration à 168 heures (isInvitationExpired)', () => {
    it('confirme le seuil de validité à 168 heures', () => {
      expect(INVITATION_EXPIRY_HOURS).toBe(168);
    });

    const createdAt = Date.parse('2024-06-01T00:00:00Z');

    it('n\'est pas expirée juste avant 168 h', () => {
      const acceptedAt = createdAt + 168 * HOUR_MS - 1;
      expect(isInvitationExpired(createdAt, acceptedAt)).toBe(false);
    });

    it('n\'est pas expirée exactement à 168 h (borne incluse)', () => {
      const acceptedAt = createdAt + 168 * HOUR_MS;
      expect(isInvitationExpired(createdAt, acceptedAt)).toBe(false);
    });

    it('est expirée au-delà de 168 h', () => {
      const acceptedAt = createdAt + 168 * HOUR_MS + 1;
      expect(isInvitationExpired(createdAt, acceptedAt)).toBe(true);
    });

    it('traite un horodatage invalide comme expiré (refus par défaut)', () => {
      expect(isInvitationExpired(NaN, createdAt)).toBe(true);
      expect(isInvitationExpired(createdAt, NaN)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// scheduled-reminders — sélection des relances/rappels dus (Req 10.4, 12.5)
// ---------------------------------------------------------------------------
describe('Edge scheduled-reminders — sélection des relances dues (logique pure)', () => {
  // Req 10.4 : une relance d'abonnement est DUE quand now >= renewal - seuil.
  describe('relance d\'abonnement (isSubscriptionReminderDue)', () => {
    const renewal = Date.parse('2024-07-01T00:00:00Z');
    const seuil = RENEWAL_THRESHOLD_DEFAULT_DAYS; // 3 jours

    it('confirme le seuil par défaut', () => {
      expect(RENEWAL_THRESHOLD_DEFAULT_DAYS).toBe(3);
    });

    it('n\'est pas due avant l\'instant de relance (renewal - seuil)', () => {
      const now = renewal - seuil * DAY_MS - 1;
      expect(isSubscriptionReminderDue(now, renewal, seuil)).toBe(false);
    });

    it('est due exactement à l\'instant de relance (borne incluse)', () => {
      const now = renewal - seuil * DAY_MS;
      expect(isSubscriptionReminderDue(now, renewal, seuil)).toBe(true);
    });

    it('reste due après l\'instant de relance', () => {
      const now = renewal - DAY_MS; // 1 jour avant le renouvellement
      expect(isSubscriptionReminderDue(now, renewal, seuil)).toBe(true);
    });

    it('n\'est pas due pour un seuil hors bornes (config invalide)', () => {
      const now = renewal; // serait due si le seuil était valide
      expect(isSubscriptionReminderDue(now, renewal, 0)).toBe(false);
      expect(isSubscriptionReminderDue(now, renewal, 31)).toBe(false);
    });

    it('n\'est pas due pour des horodatages non finis', () => {
      expect(isSubscriptionReminderDue(NaN, renewal, seuil)).toBe(false);
      expect(isSubscriptionReminderDue(renewal, NaN, seuil)).toBe(false);
    });
  });

  // Req 12.5 : un rappel de vol est DÛ quand now >= flight - délai.
  describe('rappel de vol (isFlightReminderDue)', () => {
    const flight = Date.parse('2024-07-10T12:00:00Z');
    const delai = FLIGHT_LEAD_TIME_DEFAULT_HOURS; // 48 heures

    it('confirme le délai par défaut', () => {
      expect(FLIGHT_LEAD_TIME_DEFAULT_HOURS).toBe(48);
    });

    it('n\'est pas dû avant l\'instant de rappel (flight - délai)', () => {
      const now = flight - delai * HOUR_MS - 1;
      expect(isFlightReminderDue(now, flight, delai)).toBe(false);
    });

    it('est dû exactement à l\'instant de rappel (borne incluse)', () => {
      const now = flight - delai * HOUR_MS;
      expect(isFlightReminderDue(now, flight, delai)).toBe(true);
    });

    it('reste dû après l\'instant de rappel', () => {
      const now = flight - HOUR_MS; // 1 heure avant le vol
      expect(isFlightReminderDue(now, flight, delai)).toBe(true);
    });

    it('n\'est pas dû pour un délai hors bornes (config invalide)', () => {
      const now = flight;
      expect(isFlightReminderDue(now, flight, 0)).toBe(false);
      expect(isFlightReminderDue(now, flight, 169)).toBe(false);
    });

    it('n\'est pas dû pour des horodatages non finis', () => {
      expect(isFlightReminderDue(NaN, flight, delai)).toBe(false);
      expect(isFlightReminderDue(flight, NaN, delai)).toBe(false);
    });
  });

  // Simulation de la SÉLECTION effectuée par l'edge function : filtrer les
  // entités candidates en ne conservant que celles dont la relance est due.
  describe('sélection d\'un lot mixte (filtrage des dues)', () => {
    const now = Date.parse('2024-07-01T00:00:00Z');

    it('ne sélectionne que les abonnements dont la relance est due', () => {
      const subs = [
        { id: 'due', renewal_date: now + 2 * DAY_MS, seuil: 3 }, // due (2j <= 3j)
        { id: 'pas-due', renewal_date: now + 10 * DAY_MS, seuil: 3 }, // pas due
        { id: 'invalide', renewal_date: now + 2 * DAY_MS, seuil: 99 }, // config invalide
      ];
      const dues = subs
        .filter((s) => isSubscriptionReminderDue(now, s.renewal_date, s.seuil))
        .map((s) => s.id);
      expect(dues).toEqual(['due']);
    });

    it('ne sélectionne que les vols dont le rappel est dû', () => {
      const flights = [
        { id: 'du', flight_at: now + 24 * HOUR_MS, delai: 48 }, // dû (24h <= 48h)
        { id: 'pas-du', flight_at: now + 100 * HOUR_MS, delai: 48 }, // pas dû
        { id: 'invalide', flight_at: now + 24 * HOUR_MS, delai: 0 }, // config invalide
      ];
      const dus = flights
        .filter((f) => isFlightReminderDue(now, f.flight_at, f.delai))
        .map((f) => f.id);
      expect(dus).toEqual(['du']);
    });
  });
});
