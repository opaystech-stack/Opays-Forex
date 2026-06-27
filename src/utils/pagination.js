// Pagination des listes d'Operations, de Clients, d'Abonnements et de Reservations_Billet
// (Exigences 17.1 et 17.4).
//
// Fonction et constantes PURES (sans effet de bord, sans réseau) modélisant le découpage
// d'une liste en pages destinées à un chargement progressif, page par page :
//   - chaque page contient AU PLUS 50 éléments (Req 17.1) ;
//   - l'union ordonnée de toutes les pages successives est une permutation exacte de la
//     liste d'entrée, sans perte ni doublon (Req 17.4, chargement à la demande).
//
// La couche UI se contente d'appeler `paginate` avec la liste, le numéro de page demandé
// et, optionnellement, une taille de page ; le calcul de tri/filtrage et le chargement
// progressif réel sont délégués à la base (index) et au contexte applicatif.

// Taille de page maximale imposée par l'exigence 17.1.
export const MAX_PAGE_SIZE = 50;

// Taille de page par défaut, alignée sur la borne maximale autorisée.
export const DEFAULT_PAGE_SIZE = 50;

// Indique si une valeur est un entier positif fini exploitable comme taille/numéro de page.
const isPositiveInteger = (value) =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

// Normalise la taille de page demandée vers un entier de l'intervalle fermé [1, MAX_PAGE_SIZE].
// Toute valeur absente, non entière, nulle ou négative retombe sur DEFAULT_PAGE_SIZE ;
// toute valeur supérieure à MAX_PAGE_SIZE est plafonnée à MAX_PAGE_SIZE (Req 17.1).
const normalizePageSize = (pageSize) => {
  if (!isPositiveInteger(pageSize)) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(pageSize, MAX_PAGE_SIZE);
};

// Découpe `items` en pages d'au plus `pageSize` éléments et retourne la page `page` demandée.
//
// Paramètres :
//   - items   : tableau d'éléments à paginer (toute valeur non tableau est traitée comme vide) ;
//   - page    : numéro de page demandé, indexé à partir de 1 (valeur invalide ⇒ 1) ;
//   - pageSize: taille de page souhaitée, normalisée à l'intervalle [1, MAX_PAGE_SIZE].
//
// Retour : un objet décrivant la page courante :
//   {
//     items,        // éléments de la page (au plus pageSize, donc au plus 50 — Req 17.1)
//     page,         // numéro de page effectif (borné à [1, totalPages] ou 1 si liste vide)
//     pageSize,     // taille de page effective appliquée
//     totalItems,   // nombre total d'éléments de la liste d'entrée
//     totalPages,   // nombre total de pages (0 si la liste est vide)
//     hasPrevious,  // vrai s'il existe une page précédente
//     hasNext       // vrai s'il existe une page suivante
//   }
//
// Invariant de couverture exacte (Req 17.4) : pour une même liste et une même `pageSize`,
// la concaténation ordonnée des `items` des pages 1..totalPages reproduit exactement la
// liste d'entrée, sans perte ni doublon.
export const paginate = (items, page = 1, pageSize = DEFAULT_PAGE_SIZE) => {
  const source = Array.isArray(items) ? items : [];
  const effectivePageSize = normalizePageSize(pageSize);
  const totalItems = source.length;
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / effectivePageSize);

  // Numéro de page demandé normalisé puis borné à l'intervalle des pages existantes.
  const requestedPage = isPositiveInteger(page) ? page : 1;
  const effectivePage = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);

  const startIndex = (effectivePage - 1) * effectivePageSize;
  const pageItems = source.slice(startIndex, startIndex + effectivePageSize);

  return {
    items: pageItems,
    page: effectivePage,
    pageSize: effectivePageSize,
    totalItems,
    totalPages,
    hasPrevious: effectivePage > 1,
    hasNext: effectivePage < totalPages,
  };
};
