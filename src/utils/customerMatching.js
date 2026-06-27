// Déduplication / rattachement client — fonctions pures
//
// Extraites de `AppContext.findOrCreateCustomer` afin d'être testables
// indépendamment (tests de propriété P15–P19). Ces fonctions ne créent
// jamais d'enregistrement et n'ont aucun effet de bord.
//
// Feature: financial-ops-audit-voice-agent

/**
 * Normalise un numéro de téléphone en retirant TOUS les caractères
 * d'espacement (espaces, tabulations, retours à la ligne, etc.).
 * Deux numéros ne différant que par leurs espaces produisent la même valeur.
 *
 * @param {string|null|undefined} phone
 * @returns {string} numéro sans aucun caractère d'espacement ('' si absent)
 */
export const normalizePhone = (phone) => {
  if (phone === null || phone === undefined) return '';
  return String(phone).replace(/\s/g, '');
};

/**
 * Normalise un nom : passage en minuscules et suppression des espaces de
 * début et de fin. Les variations de casse et d'espaces de bord produisent
 * la même valeur normalisée.
 *
 * @param {string|null|undefined} name
 * @returns {string} nom normalisé ('' si absent)
 */
export const normalizeName = (name) => {
  if (name === null || name === undefined) return '';
  return String(name).toLowerCase().trim();
};

// Valeur de tri pour `created_at` : timestamp numérique, ou +Infinity si la
// date est absente/invalide (de sorte qu'une date valide soit toujours
// considérée comme « plus ancienne » qu'une date manquante).
const createdAtValue = (customer) => {
  const t = Date.parse(customer && customer.created_at);
  return Number.isFinite(t) ? t : Infinity;
};

// Sélectionne, de façon déterministe, le client de `created_at` le plus
// ancien. En cas d'égalité stricte, conserve la première occurrence
// rencontrée (déterminisme indépendant de l'ordre d'égalité).
const pickOldest = (list) =>
  list.reduce(
    (best, current) =>
      best === null || createdAtValue(current) < createdAtValue(best)
        ? current
        : best,
    null
  );

/**
 * Recherche déterministe d'un client correspondant, sans création.
 *
 * Priorité de correspondance (Exigences 8.1, 8.2, 8.7) :
 *   1. correspondance par téléphone normalisé ;
 *   2. à défaut, correspondance par nom normalisé ;
 *   3. en cas de correspondances multiples dans l'ensemble retenu,
 *      départage par `created_at` le plus ancien.
 *
 * Ne crée jamais d'enregistrement et signale l'ambiguïté (plusieurs
 * correspondances) afin que l'appelant puisse demander une confirmation
 * manuelle (Exigences 5.9, 6.5, 7.3).
 *
 * @param {Array<{id?: string, name?: string, phone?: string, created_at?: string}>} customers
 * @param {{ name?: string, phone?: string }} identity
 * @returns {{ match: object|null, ambiguous: boolean }}
 */
export const matchCustomer = (customers, identity = {}) => {
  const list = Array.isArray(customers) ? customers : [];
  const { name, phone } = identity || {};

  const normPhone = normalizePhone(phone);
  const normName = normalizeName(name);

  const phoneMatches = normPhone
    ? list.filter(
        (c) => c && normalizePhone(c.phone) !== '' && normalizePhone(c.phone) === normPhone
      )
    : [];

  const nameMatches = normName
    ? list.filter(
        (c) => c && normalizeName(c.name) !== '' && normalizeName(c.name) === normName
      )
    : [];

  // Le téléphone normalisé est prioritaire sur le nom normalisé.
  const candidates = phoneMatches.length > 0 ? phoneMatches : nameMatches;

  if (candidates.length === 0) {
    return { match: null, ambiguous: false };
  }
  if (candidates.length === 1) {
    return { match: candidates[0], ambiguous: false };
  }
  return { match: pickOldest(candidates), ambiguous: true };
};
