// Calcul du verdict d'accès — logique PURE, sans dépendance externe.
//
// auth-access-mobile-fixes (Z4) : l'autorité de l'essai 30 jours et de l'accès
// payant est portée par le SERVEUR (API Fastify / foxdb), de sorte que la
// décision n'est pas falsifiable côté client. Le front ne fait que refléter le
// verdict renvoyé par `GET /api/auth/me`.
//
// Règle d'accès (Property 4) :
//   accessGranted = paidAccess_effectif  OU  (now - created_at < 30 jours)
//   - trialActive : vrai tant que `now - created_at < 30 jours` ;
//   - trialEndsAt : created_at + 30 jours (ISO) ;
//   - paidAccess  : accès payant effectif (true si paid_access ET, si une
//                   échéance `paid_access_until` est fournie, qu'elle est encore
//                   dans le futur).
//
// Extrait afin d'être testable isolément (cf. api/lib/tenant.js).

export const TRIAL_DURATION_DAYS = 30;
export const TRIAL_DURATION_MS = TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000;

// Détermine si l'accès payant est effectif à l'instant `now`.
// `paidAccessUntil` (optionnel) borne l'accès payant dans le temps : si fourni
// et dépassé, l'accès payant n'est plus effectif. Absent/NULL ⇒ illimité.
export function isPaidAccessEffective(paidAccess, paidAccessUntil, now = Date.now()) {
  if (paidAccess !== true) return false;
  if (paidAccessUntil === null || paidAccessUntil === undefined || paidAccessUntil === '') {
    return true;
  }
  const until = new Date(paidAccessUntil).getTime();
  if (Number.isNaN(until)) return true; // valeur illisible ⇒ on ne révoque pas
  return now < until;
}

// Calcule le verdict d'accès complet à partir des champs d'autorité serveur.
// Retourne un objet additif et stable :
//   { accessGranted, trialActive, trialEndsAt, paidAccess }
export function computeAccessVerdict({
  createdAt,
  paidAccess = false,
  paidAccessUntil = null,
  now = Date.now(),
} = {}) {
  const paid = isPaidAccessEffective(paidAccess, paidAccessUntil, now);

  let trialActive = false;
  let trialEndsAt = null;

  const createdTime = createdAt != null ? new Date(createdAt).getTime() : NaN;
  if (!Number.isNaN(createdTime)) {
    trialActive = now - createdTime < TRIAL_DURATION_MS;
    trialEndsAt = new Date(createdTime + TRIAL_DURATION_MS).toISOString();
  } else {
    // Date de création inconnue : on considère prudemment l'essai actif (un
    // compte fraîchement créé sans `created_at` peuplé ne doit pas être bloqué).
    trialActive = true;
  }

  return {
    accessGranted: paid || trialActive,
    trialActive,
    trialEndsAt,
    paidAccess: paid,
  };
}
