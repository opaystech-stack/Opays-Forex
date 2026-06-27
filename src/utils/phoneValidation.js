// Validation et normalisation des numéros de téléphone — fonctions pures
//
// Logique partagée entre le Service_Envoi (whatsappClient) et la fonction
// Edge `whatsapp-send`. Aucune fonction ici n'a d'effet de bord ni n'effectue
// d'appel réseau.
//
// Feature: whatsapp-client-reminders

import { normalizePhone } from './customerMatching.js';

/**
 * Indique si un numéro est au format international E.164 :
 * un `+` suivi de 8 à 15 chiffres. Les caractères d'espacement sont ignorés
 * (un numéro « + 243 81 234 56 78 » est traité comme « +243812345678 »).
 *
 * Rejette les chaînes vides, sans `+`, contenant des lettres ou tout autre
 * caractère non numérique, ainsi que les numéros trop courts (< 8 chiffres)
 * ou trop longs (> 15 chiffres).
 *
 * @param {string|null|undefined} phone
 * @returns {boolean} vrai ssi le numéro respecte le format international
 */
export const isValidInternationalPhone = (phone) => {
  if (phone === null || phone === undefined) return false;
  // Réutilise la normalisation existante : retire tous les espaces.
  const normalized = normalizePhone(phone);
  return /^\+\d{8,15}$/.test(normalized);
};

/**
 * Normalise un numéro pour l'envoi à la passerelle WhatsApp en réutilisant
 * `normalizePhone` (suppression de tous les espaces) tout en CONSERVANT le
 * `+` international de tête.
 *
 * @param {string|null|undefined} phone
 * @returns {string} numéro sans espaces, conservant le `+` ('' si absent)
 */
export const normalizeForGateway = (phone) => normalizePhone(phone);
