// Résolution du locataire (agence) — logique PURE, sans dépendance externe.
//
// Détermine l'`agency_id` effectif d'une requête à partir de l'utilisateur
// authentifié (claims du JWT) et des en-têtes HTTP. C'est le verrou central de
// l'isolation inter-agences (R1/R2) : un utilisateur NON superadmin est
// TOUJOURS confiné à son propre `agency_id`, quelles que soient les valeurs
// d'en-tête fournies — aucune élévation vers une autre agence n'est possible.
//
// Extrait de `server.js` (decorator `requireAgency`) afin d'être testable
// isolément, sans démarrer Fastify ni Postgres.

export function resolveTenant(user, headers = {}) {
  if (!user || typeof user !== 'object') {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  const isSuperadmin = user.role === 'superadmin';

  if (!user.agency_id && !isSuperadmin) {
    return { ok: false, status: 403, error: 'No agency assigned' };
  }

  // Seul un superadmin peut cibler une autre agence via l'en-tête `x-agency-id`.
  // Pour tout autre rôle, on impose strictement l'agence du jeton (confinement).
  const headerAgency = headers ? headers['x-agency-id'] : undefined;
  const agencyId = isSuperadmin
    ? (headerAgency || user.agency_id || null)
    : user.agency_id;

  return { ok: true, agencyId };
}
