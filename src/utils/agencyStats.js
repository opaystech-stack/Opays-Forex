// Logique PURE de cloisonnement par agence : statistiques d'agences par état,
// affectation de la clé d'agence aux entités créées, résolution du Point_De_Vente
// et de la Caisse par défaut implicites, et vérification du rattachement des
// données existantes lors du backfill de migration (Exigences 3.2, 3.4, 5.8, 18.6).
//
// Ces fonctions ne produisent aucun effet de bord ni accès réseau ; elles
// reflètent côté applicatif la sémantique imposée par la migration
// `0003_agency_operations_expansion.sql` (création d'une Agence par défaut par
// Propriétaire_Agence et backfill d'`agency_id`), afin d'être testables sans base.
//
// Propriétés de conception couvertes :
//   - Property 7  : Affectation de la clé d'agence (Req 3.2) ;
//   - Property 8  : Point de vente et caisse par défaut implicites (Req 3.4) ;
//   - Property 33 : Statistique du nombre d'agences par état (Req 5.8) ;
//   - Property 34 : Rattachement complet des données à la migration (Req 18.6).

// Etat_Agence : ensemble FERMÉ des états de cycle de vie d'une Agence (Req 5).
export const AGENCY_STATES = ['active', 'suspendue'];

// Libellés des Point_De_Vente et Caisse par défaut implicites (alignés sur les
// valeurs par défaut du schéma `points_of_sale` / `registers` — Req 3.4).
export const DEFAULT_POINT_OF_SALE_NAME = 'Point de vente par défaut';
export const DEFAULT_REGISTER_NAME = 'Caisse par défaut';

// Un identifiant d'Agence est valide s'il s'agit d'une valeur non vide
// (chaîne non blanche). Sert de garde à l'affectation de la clé de cloisonnement.
export const isValidAgencyId = (agencyId) =>
  typeof agencyId === 'string' && agencyId.trim().length > 0;

// ============================================================
// Property 33 — Statistique du nombre d'agences par état (Req 5.8)
// ============================================================
// Retourne, pour chaque Etat_Agence de l'ensemble fermé, le cardinal exact du
// sous-ensemble correspondant, accompagné du nombre total d'agences.
// Invariant : la somme des comptes par état est égale au nombre total d'agences
// (toutes les agences portant un état appartenant à AGENCY_STATES).
export const countAgenciesByState = (agencies = []) => {
  const list = Array.isArray(agencies) ? agencies : [];

  const counts = {};
  for (const state of AGENCY_STATES) {
    counts[state] = 0;
  }

  for (const agency of list) {
    const state = agency?.state;
    if (Object.prototype.hasOwnProperty.call(counts, state)) {
      counts[state] += 1;
    }
  }

  return { ...counts, total: list.length };
};

// ============================================================
// Property 7 — Affectation de la clé d'agence (Req 3.2)
// ============================================================
// Rattache une entité métier nouvellement créée (Operation, Client, transfert,
// abonnement, réservation, commande à distance) à l'identifiant de l'agence
// courante en lui posant un `agency_id` non nul. Retourne une NOUVELLE entité
// sans muter l'entrée. Lève une erreur si l'`agency_id` fourni est invalide,
// garantissant qu'aucune entité ne peut être créée sans clé de cloisonnement.
export const assignAgencyId = (entity, agencyId) => {
  if (!isValidAgencyId(agencyId)) {
    throw new Error("agency_id invalide : une agence courante est requise pour créer l'entité.");
  }
  return { ...(entity ?? {}), agency_id: agencyId };
};

// Affecte le même `agency_id` à chaque entité d'une liste (création par lot).
// Retourne une nouvelle liste de nouvelles entités ; ne mute pas l'entrée.
export const assignAgencyIdToAll = (entities = [], agencyId) => {
  const list = Array.isArray(entities) ? entities : [];
  return list.map((entity) => assignAgencyId(entity, agencyId));
};

// ============================================================
// Property 8 — Point de vente et caisse par défaut implicites (Req 3.4)
// ============================================================
// Résout le Point_De_Vente par défaut d'une Agence. Si l'Agence dispose déjà de
// Point_De_Vente explicites, retourne celui marqué par défaut (ou le premier) ;
// sinon, retourne un Point_De_Vente par défaut implicite UNIQUE, déterministe
// (identique d'un appel à l'autre pour un même `agencyId`).
export const resolveDefaultPointOfSale = (agencyId, existingPointsOfSale = []) => {
  if (!isValidAgencyId(agencyId)) {
    throw new Error('agency_id invalide : impossible de résoudre le Point_De_Vente par défaut.');
  }

  const explicit = Array.isArray(existingPointsOfSale) ? existingPointsOfSale : [];
  if (explicit.length > 0) {
    const chosen = explicit.find((pos) => pos?.is_default) ?? explicit[0];
    return { ...chosen, agency_id: agencyId, implicit: false };
  }

  // Identifiant déterministe du Point_De_Vente implicite (un seul par Agence).
  return {
    id: `${agencyId}::default-pos`,
    agency_id: agencyId,
    name: DEFAULT_POINT_OF_SALE_NAME,
    is_default: true,
    implicit: true,
  };
};

// Résout la Caisse par défaut d'un Point_De_Vente. Si des Caisses explicites
// existent, retourne celle marquée par défaut (ou la première) ; sinon, retourne
// une Caisse par défaut implicite UNIQUE et déterministe pour ce Point_De_Vente.
export const resolveDefaultRegister = (pointOfSaleId, existingRegisters = []) => {
  if (!isValidAgencyId(pointOfSaleId)) {
    throw new Error('pos_id invalide : impossible de résoudre la Caisse par défaut.');
  }

  const explicit = Array.isArray(existingRegisters) ? existingRegisters : [];
  if (explicit.length > 0) {
    const chosen = explicit.find((reg) => reg?.is_default) ?? explicit[0];
    return { ...chosen, pos_id: pointOfSaleId, implicit: false };
  }

  // Identifiant déterministe de la Caisse implicite (une seule par Point_De_Vente).
  return {
    id: `${pointOfSaleId}::default-register`,
    pos_id: pointOfSaleId,
    name: DEFAULT_REGISTER_NAME,
    is_default: true,
    implicit: true,
  };
};

// ============================================================
// Property 34 — Rattachement complet des données à la migration (Req 18.6)
// ============================================================
// Construit la table de correspondance Propriétaire_Agence -> Agence par défaut,
// en reflétant la sélection de la migration (`ORDER BY created_at ASC, id ASC` :
// la première Agence créée pour un propriétaire est son Agence par défaut).
// Retourne un objet { [ownerId]: agencyId }.
export const buildOwnerAgencyMap = (agencies = []) => {
  const list = Array.isArray(agencies) ? agencies : [];

  // Tri stable reproduisant l'ordre de la migration : created_at puis id croissants.
  const sorted = [...list].sort((a, b) => {
    const ta = a?.created_at ?? '';
    const tb = b?.created_at ?? '';
    if (ta < tb) return -1;
    if (ta > tb) return 1;
    const ia = a?.id ?? '';
    const ib = b?.id ?? '';
    if (ia < ib) return -1;
    if (ia > ib) return 1;
    return 0;
  });

  const map = {};
  for (const agency of sorted) {
    const ownerId = agency?.owner_id;
    const agencyId = agency?.id;
    if (ownerId == null || agencyId == null) {
      continue;
    }
    // Première Agence rencontrée pour ce propriétaire = Agence par défaut.
    if (!Object.prototype.hasOwnProperty.call(map, ownerId)) {
      map[ownerId] = agencyId;
    }
  }

  return map;
};

// Backfill du rattachement des données existantes : pour chaque ligne (transaction,
// client, dépense, prêt, dette) rattachée à un Propriétaire_Agence via `ownerKey`
// (par défaut `user_id`), pose `agency_id` égal à l'Agence par défaut de ce
// propriétaire. Une ligne déjà rattachée (agency_id non nul) est préservée.
// Retourne une nouvelle liste de nouvelles lignes ; ne mute pas l'entrée.
export const backfillAgencyId = (rows = [], ownerAgencyMap = {}, ownerKey = 'user_id') => {
  const list = Array.isArray(rows) ? rows : [];
  const map = ownerAgencyMap ?? {};

  return list.map((row) => {
    const current = row?.agency_id;
    if (current != null && current !== '') {
      return { ...row };
    }
    const ownerId = row?.[ownerKey];
    const resolved = Object.prototype.hasOwnProperty.call(map, ownerId) ? map[ownerId] : null;
    return { ...row, agency_id: resolved };
  });
};

// Vérifie que le backfill est complet : chaque ligne porte un `agency_id` non nul.
// Renvoie true si et seulement si aucune ligne ne reste sans agence (Req 18.6).
export const isBackfillComplete = (rows = []) => {
  const list = Array.isArray(rows) ? rows : [];
  return list.every((row) => row?.agency_id != null && row.agency_id !== '');
};
