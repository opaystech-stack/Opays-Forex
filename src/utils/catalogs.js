// Module de validation des catalogues administrables.
//
// Fonctions PURES (sans effet de bord) consommées par l'Espace_Administration_Plateforme
// et les écrans de saisie pour fiabiliser l'édition des catalogues de référence :
// Catalogue_Methodes_Transfert (Exigence 9) et Catalogue_Fournisseurs_Abonnement (Exigence 11).
//
// Couvre :
//  - la validation des libellés (1..60 caractères, unicité insensible casse/bords) (Req 9.3, 9.5, 11.4, 11.6) ;
//  - la permanence et la non-suppression de la valeur « Autre » (Req 9.1, 9.7) ;
//  - la validation du libellé personnalisé « Autre » d'un transfert (Req 8.3, 8.5) ;
//  - les Fournisseurs_Abonnement par défaut (Req 11.1).

// Bornes de longueur d'un libellé de catalogue (Req 9.5, 11.6).
export const LABEL_MIN_LENGTH = 1;
export const LABEL_MAX_LENGTH = 60;

// Valeur permanente et non supprimable du Catalogue_Methodes_Transfert (Req 9.1, 9.7).
export const TRANSFER_METHOD_OTHER = 'Autre';

// Fournisseurs_Abonnement par défaut du Catalogue_Fournisseurs_Abonnement (Req 11.1).
export const DEFAULT_PROVIDERS = ['Canal+', 'Access', 'Évasion', 'DStv'];

// Normalise un libellé pour la comparaison d'unicité : suppression des espaces
// de bord et passage en minuscules (comparaison insensible à la casse et aux
// espaces de bord — Req 9.5, 11.6).
const normalizeLabel = (label) =>
  typeof label === 'string' ? label.trim().toLowerCase() : '';

// Valide un libellé de catalogue (méthode de transfert ou fournisseur d'abonnement).
//
// Accepte si et seulement si le libellé, une fois les espaces de bord retirés,
// comporte de 1 à 60 caractères ET n'est pas un doublon d'un libellé existant
// (comparaison insensible à la casse et aux espaces de bord). Rejette un libellé
// vide, composé uniquement d'espaces, de plus de 60 caractères, ou dupliqué
// (Req 9.3, 9.5, 11.4, 11.6).
//
// Retourne { ok: true } si le libellé est valide,
// sinon { ok: false, error }.
export const isValidCatalogLabel = (label, existingLabels = []) => {
  // Absent ou non textuel.
  if (typeof label !== 'string') {
    return { ok: false, error: 'Le libellé est invalide.' };
  }

  const trimmed = label.trim();

  // Vide ou uniquement des espaces.
  if (trimmed.length < LABEL_MIN_LENGTH) {
    return { ok: false, error: 'Le libellé est invalide.' };
  }

  // Trop long (longueur évaluée sur le libellé sans espaces de bord).
  if (trimmed.length > LABEL_MAX_LENGTH) {
    return { ok: false, error: 'Le libellé est invalide.' };
  }

  // Doublon (insensible casse/espaces de bord).
  const normalized = normalizeLabel(trimmed);
  const existing = Array.isArray(existingLabels) ? existingLabels : [];
  const isDuplicate = existing.some(
    (candidate) => normalizeLabel(candidate) === normalized
  );
  if (isDuplicate) {
    return { ok: false, error: 'Le libellé est invalide.' };
  }

  return { ok: true };
};

// Indique si une Methode_Transfert est supprimable.
//
// La valeur « Autre » est permanente et non supprimable ; toute autre méthode
// est supprimable (Req 9.1, 9.7). La comparaison est insensible à la casse et
// aux espaces de bord pour éviter tout contournement.
//
// Retourne false pour « Autre », true sinon.
export const isDeletableMethod = (label) =>
  normalizeLabel(label) !== normalizeLabel(TRANSFER_METHOD_OTHER);

// Valide le libellé personnalisé exigé lorsque la Methode_Transfert « Autre »
// est sélectionnée pour une opération de transfert.
//
// Le libellé personnalisé est requis et doit comporter de 1 à 60 caractères
// (espaces de bord retirés) ; un libellé vide, composé uniquement d'espaces ou
// de plus de 60 caractères est rejeté (Req 8.3, 8.5).
//
// Retourne true si le libellé est valide, false sinon.
export const isValidCustomTransferLabel = (label) => {
  if (typeof label !== 'string') {
    return false;
  }
  const trimmed = label.trim();
  return trimmed.length >= LABEL_MIN_LENGTH && trimmed.length <= LABEL_MAX_LENGTH;
};
