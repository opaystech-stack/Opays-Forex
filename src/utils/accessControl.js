// Module de contrôle d'accès — logique PURE (sans effet de bord ni appel réseau).
//
// Ces fonctions évaluent l'état d'accès d'un Utilisateur à partir d'un Profil_Accès
// chargé et du résultat de ce chargement. Elles sont entièrement testables par
// propriétés (fast-check) et alimentent le gating React dans AppContext / App.jsx.
//
// PRINCIPE DIRECTEUR : toute incertitude ⇒ accès refusé (safe-by-default).
// Le gating visuel n'est qu'une commodité UX ; l'autorité finale reste la RLS.

// Plafond de chargement du Profil_Accès, en millisecondes (Exigence 2.4).
export const LOAD_TIMEOUT_MS = 10000;

export const isAccessGranted = (profile) => {
  if (!profile || typeof profile !== 'object') {
    return false;
  }

  // auth-access-mobile-fixes (Z4) : lorsqu'un verdict d'accès EXPLICITE est
  // présent (calculé côté serveur et exposé via /api/auth/me), le client le
  // reflète tel quel — sans recalculer l'essai à partir de `created_at` (qui
  // serait falsifiable côté client). Ainsi, un compte hors essai non payé
  // (ex. daysAgo=30, paid=false ⇒ accessGranted=false) est bien bloqué.
  if (typeof profile.accessGranted === 'boolean') {
    return profile.accessGranted;
  }

  // 30 days free trial check based on profile creation date
  const createdDate = profile.created_at || profile.createdAt || profile.date_creation;
  if (createdDate) {
    const createdTime = new Date(createdDate).getTime();
    if (!isNaN(createdTime)) {
      const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
      if (Date.now() - createdTime < thirtyDaysInMs) {
        return true; // Trial active: grant access
      }
    }
  }

  return profile.acces_autorise === true;
};

// Vrai si et seulement si le rôle du profil correspond exactement à la chaîne
// `'admin'`. Toute autre valeur (`'user'`, valeur hors ensemble, nulle, absente)
// retourne faux, ce qui refuse l'accès à la Console_Admin (Exigences 1.4, 6.9).
//
// Retourne un booléen.
export const isAdmin = (profile) => {
  if (!profile || typeof profile !== 'object') {
    return false;
  }
  return profile.role === 'admin';
};

// Indique si la durée de chargement écoulée dépasse le plafond autorisé
// (Exigence 2.4). Le dépassement est strict : `elapsedMs` doit être supérieur
// au plafond pour être considéré comme expiré. Une valeur non numérique ou
// négative est traitée prudemment comme un dépassement (incertitude ⇒ refus).
//
// Retourne un booléen.
export const isLoadTimedOut = (elapsedMs, capMs = LOAD_TIMEOUT_MS) => {
  const cap = Number.isFinite(capMs) ? capMs : LOAD_TIMEOUT_MS;
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    return true;
  }
  return elapsedMs > cap;
};

// Évalue l'état d'accès à partir du statut de chargement et du profil chargé.
//
//   status ∈ 'loading' | 'ready' | 'error'
//
// Règles (Exigences 1.9, 2.1, 2.2, 2.3, 2.4) :
//   - status === 'loading'                       ⇒ { allowed: false, view: 'loading' }
//   - status === 'ready' ET acces_autorise=true  ⇒ { allowed: true,  view: 'app' }
//   - tous les autres cas (ready non autorisé,
//     error, profil nul, statut inconnu)         ⇒ { allowed: false, view: 'restricted' }
//
// Retourne { allowed: boolean, view: 'loading'|'app'|'restricted' }.
export const evaluateAccess = ({ status, profile } = {}) => {
  if (status === 'loading') {
    return { allowed: false, view: 'loading' };
  }
  if (status === 'ready' && isAccessGranted(profile)) {
    return { allowed: true, view: 'app' };
  }
  // status === 'error', 'ready' sans autorisation, statut inconnu, profil nul...
  return { allowed: false, view: 'restricted' };
};

// Détecte un refus d'accès imposé par la sécurité au niveau ligne (RLS) de
// PostgreSQL/Supabase à partir d'un objet d'erreur PostgREST (Exigences 2.6,
// 2.7, 2.8). Un tel refus DOIT être distingué d'une simple erreur de
// connectivité : sur un refus RLS, l'application affiche un message de
// restriction et NE bascule PAS vers les données de démonstration.
//
// Signaux reconnus (insensibles à la casse pour les chaînes) :
//   - statut HTTP 401 (non authentifié) ou 403 (interdit) — error.status / error.statusCode ;
//   - code Postgres `42501` (insufficient_privilege) — error.code ;
//   - codes PostgREST de refus de politique : `PGRST301` (JWT/permission),
//     `PGRST116` non inclus (absence de ligne, pas un refus) ;
//   - message mentionnant explicitement une violation de politique RLS
//     (« row-level security », « violates row-level security policy »).
//
// Une erreur nulle/absente n'est pas un refus. Retourne un booléen.
export const isRlsDenied = (error) => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  // Statut HTTP éventuel (PostgREST expose parfois status / statusCode).
  const status = Number(error.status ?? error.statusCode);
  if (status === 401 || status === 403) {
    return true;
  }

  // Codes d'erreur Postgres / PostgREST.
  const code = typeof error.code === 'string' ? error.code.trim().toUpperCase() : '';
  if (code === '42501' || code === 'PGRST301') {
    return true;
  }

  // Repli sur le message pour les violations de politique RLS explicites.
  const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
  if (
    message.includes('row-level security') ||
    message.includes('row level security') ||
    message.includes('violates row-level security policy') ||
    message.includes('insufficient_privilege')
  ) {
    return true;
  }

  return false;
};

// Valide l'invariant de traçabilité d'activation d'un Profil_Accès candidat
// (Exigences 1.5, 1.8) : un accès actif (`acces_autorise === true`) DOIT porter
// l'identité de l'Administrateur ayant réalisé l'activation (`activated_by` non
// nul). Tout autre profil est accepté :
//   - `acces_autorise` faux/absent              ⇒ ok
//   - `acces_autorise` vrai AVEC `activated_by`  ⇒ ok
//   - `acces_autorise` vrai SANS `activated_by`  ⇒ ok:false (refus)
//
// Retourne { ok: true } ou { ok: false, code: 'missing_activator', message }.
export const validateProfile = (profile) => {
  if (!profile || typeof profile !== 'object') {
    // Un profil absent n'est pas un accès actif : rien à tracer, donc valide
    // au sens de l'invariant (l'absence d'accès est gérée par evaluateAccess).
    return { ok: true };
  }

  if (profile.acces_autorise === true) {
    const activatedBy = profile.activated_by;
    const hasActivator =
      activatedBy !== null &&
      activatedBy !== undefined &&
      String(activatedBy).trim() !== '';

    if (!hasActivator) {
      return {
        ok: false,
        code: 'missing_activator',
        message:
          "Un accès autorisé doit porter l'identifiant de l'Administrateur ayant réalisé l'activation.",
      };
    }
  }

  return { ok: true };
};
