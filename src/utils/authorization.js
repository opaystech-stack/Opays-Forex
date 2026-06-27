// Modèle de rôles et de permissions (Exigence 2, Exigence 1.2/1.4/1.5/1.11).
//
// Fonctions et constantes PURES (sans effet de bord, sans réseau) décrivant
// l'ensemble fermé des Rôles, le catalogue des Permissions, la matrice
// Rôle → Permissions et la logique de décision d'autorisation en
// « deny-overrides » (un retrait individuel l'emporte sur tout octroi).
//
// Cette couche est une commodité d'interface : l'autorité finale reste la RLS
// PostgreSQL (cf. design). Elle est ici extraite pour être testable isolément.

// Ensemble fermé des Rôles par défaut (Exigence 2.1).
export const ROLES = ['proprietaire', 'gerant', 'caissier', 'observateur'];

// Catalogue des Permissions unitaires vérifiables (Exigence 2.2).
export const PERMISSIONS = [
  'transactions.creer',
  'transactions.lire',
  'taux.modifier',
  'services.vendre',
  'employes.gerer',
  'modules.gerer',
  'clients.gerer',
  'whatsapp.envoyer',
  'rapports.lire',
];

// Matrice Rôle → Permissions (Exigence 2.2).
//
// `proprietaire` dispose de l'ensemble complet des Permissions. Les autres
// rôles reçoivent un sous-ensemble cohérent avec leur fonction métier ; ces
// sous-ensembles ne sont contraints par aucune exigence ni propriété formelle
// (seul `proprietaire = toutes` l'est), ils constituent des valeurs par défaut
// raisonnables et restent affinables par octrois/retraits individuels.
export const ROLE_PERMISSIONS = {
  // Toutes les permissions.
  proprietaire: [...PERMISSIONS],
  // Gérant : exploitation complète et gestion des employés, sauf la gestion
  // des modules (configuration réservée au propriétaire).
  gerant: [
    'transactions.creer',
    'transactions.lire',
    'taux.modifier',
    'services.vendre',
    'employes.gerer',
    'clients.gerer',
    'whatsapp.envoyer',
    'rapports.lire',
  ],
  // Caissier : opérations courantes au guichet.
  caissier: [
    'transactions.creer',
    'transactions.lire',
    'services.vendre',
    'clients.gerer',
    'whatsapp.envoyer',
  ],
  // Observateur : lecture seule.
  observateur: ['transactions.lire', 'rapports.lire'],
};

// Longueur maximale d'une adresse e-mail d'invitation (Exigence 1.4).
export const MAX_INVITATION_EMAIL_LENGTH = 254;

// Forme `partie-locale@domaine` : deux segments non vides, séparés par un
// unique `@`, sans espace. Aucun `@` n'est autorisé dans les segments, ce qui
// garantit la présence d'un seul séparateur.
const INVITATION_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/;

// Valide un Rôle (Exigences 1.5, 2.1).
//
// Retourne `true` si et seulement si `role` appartient exactement à
// l'ensemble fermé `ROLES`. Toute valeur absente, non chaîne ou hors ensemble
// est rejetée.
export const isValidRole = (role) =>
  typeof role === 'string' && ROLES.includes(role);

// Valide une adresse e-mail d'invitation (Exigences 1.2, 1.4).
//
// Retourne `true` si et seulement si `email` est une chaîne respectant la
// forme `partie-locale@domaine` et comportant au plus 254 caractères. Toute
// chaîne vide, malformée ou de plus de 254 caractères est rejetée.
export const isValidInvitationEmail = (email) => {
  if (typeof email !== 'string') {
    return false;
  }
  if (email.length === 0 || email.length > MAX_INVITATION_EMAIL_LENGTH) {
    return false;
  }
  return INVITATION_EMAIL_PATTERN.test(email);
};

// Calcule les Permissions effectives d'un Compte_Employé (Exigences 2.2, 2.5, 2.6).
//
// Ensemble effectif = (permissions(rôle) ∪ octrois) ∖ retraits.
// Sémantique « deny-overrides » : toute permission présente dans `denies` est
// absente du résultat, même si elle figure dans le rôle ou dans `grants`.
//
// Un rôle invalide ne contribue d'aucune permission de base (ensemble vide) ;
// les octrois individuels restent appliqués puis filtrés par les retraits.
// Retourne un tableau de Permissions dédupliquées.
export const effectivePermissions = (role, grants = [], denies = []) => {
  // Recherche sûre : on n'utilise que les propriétés PROPRES de la matrice.
  // Une indexation directe (`ROLE_PERMISSIONS[role] || []`) résoudrait des
  // membres hérités de `Object.prototype` (« valueOf », « toString »,
  // « constructor », « hasOwnProperty », …) ; la valeur héritée étant tronquée
  // « truthy », le repli `|| []` ne se déclencherait pas et `[...base]`
  // lèverait `TypeError: base is not iterable`. Le contrôle de propriété propre
  // combiné à `Array.isArray` garantit un repli vers l'ensemble vide pour tout
  // rôle inconnu, y compris ces noms hérités.
  const ownBase = Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, role)
    ? ROLE_PERMISSIONS[role]
    : [];
  const base = Array.isArray(ownBase) ? ownBase : [];
  const grantList = Array.isArray(grants) ? grants : [];
  const denyList = Array.isArray(denies) ? denies : [];

  const denySet = new Set(denyList);
  const union = new Set([...base, ...grantList]);

  return [...union].filter((permission) => !denySet.has(permission));
};

// Rend une décision d'autorisation (Exigences 1.11, 2.3, 2.4).
//
// Retourne `true` si et seulement si `requiredPermission` appartient à
// l'ensemble effectif des Permissions calculé par `effectivePermissions` ;
// dans le cas contraire l'action est refusée.
export const isAuthorized = (role, grants, denies, requiredPermission) =>
  effectivePermissions(role, grants, denies).includes(requiredPermission);

// Durée de validité d'une Invitation_Collaborateur, en heures (Exigence 1.7).
// Au-delà de ce délai entre la création et l'acceptation, l'invitation expire.
export const INVITATION_EXPIRY_HOURS = 168;

// Durée de validité d'une invitation, en millisecondes (dérivée de la constante
// en heures pour les comparaisons d'horodatages).
export const INVITATION_EXPIRY_MS = INVITATION_EXPIRY_HOURS * 60 * 60 * 1000;

// Normalise une adresse e-mail pour la comparaison d'unicité : minuscules et
// suppression des espaces de bord. Les valeurs non chaîne donnent `null`.
const normalizeEmail = (email) =>
  typeof email === 'string' ? email.trim().toLowerCase() : null;

// Détecte un e-mail d'invitation déjà utilisé (Exigence 1.6).
//
// Retourne `true` si et seulement si `email` est équivalent (insensible à la
// casse et aux espaces de bord) à l'un des e-mails de `existingEmails`, ceux-ci
// représentant les e-mails déjà rattachés à une Invitation_Collaborateur
// `en_attente` ou à un Compte_Employé actif de la même Agence. Une nouvelle
// invitation portant un e-mail équivalent est ainsi rejetée comme doublon.
export const isDuplicateInvitationEmail = (email, existingEmails = []) => {
  const target = normalizeEmail(email);
  if (target === null) {
    return false;
  }
  const list = Array.isArray(existingEmails) ? existingEmails : [];
  const normalizedExisting = new Set(
    list.map(normalizeEmail).filter((value) => value !== null)
  );
  return normalizedExisting.has(target);
};

// Détermine si une Invitation_Collaborateur est expirée (Exigence 1.7).
//
// Retourne `true` si et seulement si l'écart entre l'instant d'acceptation et
// l'horodatage de création dépasse strictement 168 heures. Une invitation
// expirée ne doit créer aucun Compte_Employé. Les horodatages invalides
// (non finis) sont traités comme expirés par prudence (refus par défaut).
export const isInvitationExpired = (createdAtMs, acceptedAtMs) => {
  if (!Number.isFinite(createdAtMs) || !Number.isFinite(acceptedAtMs)) {
    return true;
  }
  return acceptedAtMs - createdAtMs > INVITATION_EXPIRY_MS;
};
