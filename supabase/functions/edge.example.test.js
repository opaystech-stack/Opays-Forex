import { describe, it, expect } from 'vitest';
import {
  isValidInvitationEmail,
  isValidRole,
  isDuplicateInvitationEmail,
  isInvitationExpired,
  INVITATION_EXPIRY_MS,
} from '../../src/utils/authorization.js';
import {
  isSubscriptionReminderDue,
  isFlightReminderDue,
  RENEWAL_THRESHOLD_DEFAULT_DAYS,
  FLIGHT_LEAD_TIME_DEFAULT_HOURS,
} from '../../src/utils/reminderSchedule.js';

// Tests d'exemple des Edge Functions — Feature: agency-operations-expansion.
//
// Les Edge Functions Deno (`supabase/functions/agency-invite/index.ts` et
// `supabase/functions/scheduled-reminders/index.ts`) ne sont pas exécutables
// directement sous vitest (imports distants Deno, appel `serve`, accès réseau
// Supabase). Conformément au design, leur cœur décisionnel est une LOGIQUE PURE
// (réimplémentée inline côté edge, source de vérité dans `src/utils/`). Ces
// tests d'exemple valident cette logique pure injectée :
//   - `agency-invite` : validation/unicité de l'e-mail d'invitation (Req 1.2, 1.6) ;
//   - `scheduled-reminders` : sélection des relances/rappels dus (Req 10.4, 12.5).

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// agency-invite : création/validation d'une Invitation_Collaborateur
// ---------------------------------------------------------------------------

describe('agency-invite (logique pure d\'invitation)', () => {
  // Reproduit la garde d'acceptation de la création d'invitation côté edge :
  // une invitation n'est créée que si l'e-mail est valide, le rôle valide et
  // l'e-mail non déjà utilisé (invitations en_attente + membres actifs).
  const canCreateInvitation = (email, role, existingEmails) =>
    isValidInvitationEmail(email) &&
    isValidRole(role) &&
    !isDuplicateInvitationEmail(email, existingEmails);

  it('accepte la création pour un e-mail valide non déjà vu (Req 1.2)', () => {
    const existing = ['alice@agence.com', 'bob@agence.com'];
    expect(canCreateInvitation('carol@agence.com', 'caissier', existing)).toBe(true);
  });

  it('accepte plusieurs rôles valides de l\'ensemble fermé (Req 1.2)', () => {
    for (const role of ['proprietaire', 'gerant', 'caissier', 'observateur']) {
      expect(canCreateInvitation('nouveau@agence.com', role, [])).toBe(true);
    }
  });

  it('refuse un e-mail déjà rattaché à une invitation en_attente / membre actif (Req 1.6)', () => {
    const existing = ['alice@agence.com', 'bob@agence.com'];
    expect(canCreateInvitation('alice@agence.com', 'caissier', existing)).toBe(false);
  });

  it('détecte le doublon insensible à la casse et aux espaces de bord (Req 1.6)', () => {
    const existing = ['Alice@Agence.com'];
    expect(isDuplicateInvitationEmail('  alice@agence.COM  ', existing)).toBe(true);
    expect(canCreateInvitation(' Alice@AGENCE.com ', 'gerant', existing)).toBe(false);
  });

  it('refuse une adresse e-mail vide, malformée ou trop longue (Req 1.2)', () => {
    expect(canCreateInvitation('', 'caissier', [])).toBe(false);
    expect(canCreateInvitation('pas-un-email', 'caissier', [])).toBe(false);
    expect(canCreateInvitation('a@b@c', 'caissier', [])).toBe(false);
    const tooLong = `${'a'.repeat(250)}@b.com`; // > 254 caractères
    expect(canCreateInvitation(tooLong, 'caissier', [])).toBe(false);
  });

  it('refuse un rôle absent de l\'ensemble fermé même si l\'e-mail est valide (Req 1.2)', () => {
    expect(canCreateInvitation('dave@agence.com', 'admin', [])).toBe(false);
    expect(canCreateInvitation('dave@agence.com', '', [])).toBe(false);
  });

  it('expire une invitation acceptée plus de 168 h après sa création (Req 1.7)', () => {
    const created = Date.UTC(2025, 0, 1, 12, 0, 0);
    // Acceptation à 167 h : encore valide.
    expect(isInvitationExpired(created, created + 167 * MS_PER_HOUR)).toBe(false);
    // Acceptation à 169 h : expirée.
    expect(isInvitationExpired(created, created + 169 * MS_PER_HOUR)).toBe(true);
    // Pile à la limite (168 h) : non expirée (écart non strictement supérieur).
    expect(isInvitationExpired(created, created + INVITATION_EXPIRY_MS)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// scheduled-reminders : sélection des relances/rappels dus
// ---------------------------------------------------------------------------

describe('scheduled-reminders (sélection des relances dues)', () => {
  // Reproduit l'itération de l'edge : ne retient que les abonnements dont la
  // relance de renouvellement est due à l'instant `nowMs`.
  const selectDueSubscriptions = (nowMs, subscriptions) =>
    subscriptions.filter((s) =>
      isSubscriptionReminderDue(
        nowMs,
        s.renewalDateMs,
        s.thresholdDays ?? RENEWAL_THRESHOLD_DEFAULT_DAYS
      )
    );

  // Idem pour les rappels de vol dus.
  const selectDueFlights = (nowMs, flights) =>
    flights.filter((f) =>
      isFlightReminderDue(
        nowMs,
        f.flightInstantMs,
        f.leadTimeHours ?? FLIGHT_LEAD_TIME_DEFAULT_HOURS
      )
    );

  it('sélectionne les abonnements dont la relance est due (Req 10.4)', () => {
    const now = Date.UTC(2025, 5, 10, 9, 0, 0);
    const subs = [
      // Renouvellement dans 2 jours, seuil 3 j → due.
      { id: 'due', renewalDateMs: now + 2 * MS_PER_DAY, thresholdDays: 3 },
      // Renouvellement dans 10 jours, seuil 3 j → pas encore due.
      { id: 'future', renewalDateMs: now + 10 * MS_PER_DAY, thresholdDays: 3 },
      // Renouvellement déjà passé → due.
      { id: 'overdue', renewalDateMs: now - 1 * MS_PER_DAY, thresholdDays: 3 },
    ];
    const due = selectDueSubscriptions(now, subs).map((s) => s.id);
    expect(due).toContain('due');
    expect(due).toContain('overdue');
    expect(due).not.toContain('future');
  });

  it('utilise le seuil par défaut (3 j) quand il n\'est pas fourni (Req 10.4)', () => {
    const now = Date.UTC(2025, 5, 10, 9, 0, 0);
    const subs = [
      { id: 'j3', renewalDateMs: now + 3 * MS_PER_DAY }, // exactement au seuil → due
      { id: 'j4', renewalDateMs: now + 4 * MS_PER_DAY }, // au-delà du seuil → pas due
    ];
    const due = selectDueSubscriptions(now, subs).map((s) => s.id);
    expect(due).toEqual(['j3']);
  });

  it('sélectionne les vols dont le rappel est dû (Req 12.5)', () => {
    const now = Date.UTC(2025, 5, 10, 9, 0, 0);
    const flights = [
      // Vol dans 24 h, délai 48 h → dû.
      { id: 'due', flightInstantMs: now + 24 * MS_PER_HOUR, leadTimeHours: 48 },
      // Vol dans 100 h, délai 48 h → pas encore dû.
      { id: 'future', flightInstantMs: now + 100 * MS_PER_HOUR, leadTimeHours: 48 },
    ];
    const due = selectDueFlights(now, flights).map((f) => f.id);
    expect(due).toEqual(['due']);
  });

  it('utilise le délai par défaut (48 h) quand il n\'est pas fourni (Req 12.5)', () => {
    const now = Date.UTC(2025, 5, 10, 9, 0, 0);
    const flights = [
      { id: 'h48', flightInstantMs: now + 48 * MS_PER_HOUR }, // pile au délai → dû
      { id: 'h49', flightInstantMs: now + 49 * MS_PER_HOUR }, // au-delà → pas dû
    ];
    const due = selectDueFlights(now, flights).map((f) => f.id);
    expect(due).toEqual(['h48']);
  });

  it('ne sélectionne rien sur une configuration de bornes invalide (Req 10.4, 12.5)', () => {
    const now = Date.UTC(2025, 5, 10, 9, 0, 0);
    // Seuil hors bornes (0 et 31) et délai hors bornes (0 et 169) → jamais dus.
    expect(
      selectDueSubscriptions(now, [
        { id: 'z', renewalDateMs: now, thresholdDays: 0 },
        { id: 'x', renewalDateMs: now, thresholdDays: 31 },
      ])
    ).toEqual([]);
    expect(
      selectDueFlights(now, [
        { id: 'z', flightInstantMs: now, leadTimeHours: 0 },
        { id: 'x', flightInstantMs: now, leadTimeHours: 169 },
      ])
    ).toEqual([]);
  });
});
