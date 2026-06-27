// Module de validation et de calcul de marge des réservations de billets d'avion.
//
// Fonctions PURES (sans effet de bord) consommées par l'écran de réservation
// (`src/pages/Billets.jsx`) et par AppContext pour fiabiliser l'enregistrement
// d'une Reservation_Billet.
//
// Convention de retour de validation : { ok: boolean, error?: string, field?: string }.
//
// _Requirements: 12.2, 12.3, 12.4_

import { roundHalfUp } from './finance.js';

// Calcule le bénéfice d'une Reservation_Billet : prix payé par le client diminué
// du prix réel payé par l'Agence, arrondi à 2 décimales (Req 12.3).
// bénéfice = roundHalfUp(prixClient - prixAgence, 2).
// Les valeurs absentes ou non numériques sont traitées comme 0 (comportement sûr,
// cohérent avec convertToUSD / roundHalfUp de finance.js).
export const computeFlightProfit = (prixClient, prixAgence) => {
  const client = Number(prixClient);
  const agence = Number(prixAgence);
  const safeClient = Number.isFinite(client) ? client : 0;
  const safeAgence = Number.isFinite(agence) ? agence : 0;
  return roundHalfUp(safeClient - safeAgence, 2);
};

// Convertit une valeur de date (chaîne `YYYY-MM-DD`, ISO, Date ou timestamp)
// en début de journée locale, pour une comparaison au jour près.
// Retourne un objet Date valide ou null si la valeur n'est pas une date exploitable.
const toStartOfDay = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
};

// Valide une Reservation_Billet avant enregistrement (Req 12.2, 12.4).
//
// Refuse l'enregistrement, sans créer de réservation, si (Req 12.4) :
//  - la date du vol est antérieure à la date du jour ;
//  - le numéro de billet est vide (ou uniquement des espaces) ;
//  - le prix payé par le client est négatif ;
//  - le prix réel payé par l'Agence est négatif.
//
// Le contrôle de date se fait au jour près : un vol prévu aujourd'hui est accepté.
// `today` est injectable pour rendre la fonction pure et testable (défaut : maintenant).
//
// Champs attendus en entrée (camelCase) :
//   { ticketNumber, flightDate, agencyPrice, customerPrice, ... }
//
// Retourne { ok: true } si la réservation est valide,
// sinon { ok: false, error, field }.
export const validateFlightBooking = (input = {}, today = new Date()) => {
  const {
    ticketNumber,
    flightDate,
    agencyPrice,
    customerPrice,
  } = input || {};

  // Numéro de billet non vide (Req 12.4).
  if (
    ticketNumber === null ||
    ticketNumber === undefined ||
    String(ticketNumber).trim() === ''
  ) {
    return {
      ok: false,
      error: 'Le numéro de billet est requis.',
      field: 'ticketNumber',
    };
  }

  // Date du vol exploitable et non antérieure à la date du jour (Req 12.4).
  const flight = toStartOfDay(flightDate);
  if (flight === null) {
    return {
      ok: false,
      error: 'La date du vol est invalide.',
      field: 'flightDate',
    };
  }
  const todayStart = toStartOfDay(today) ?? toStartOfDay(new Date());
  if (flight.getTime() < todayStart.getTime()) {
    return {
      ok: false,
      error: 'La date du vol ne peut pas être antérieure à la date du jour.',
      field: 'flightDate',
    };
  }

  // Prix réel payé par l'Agence : numérique et non négatif (Req 12.4).
  const agence = Number(agencyPrice);
  if (!Number.isFinite(agence) || agence < 0) {
    return {
      ok: false,
      error: "Le prix réel payé par l'agence doit être positif ou nul.",
      field: 'agencyPrice',
    };
  }

  // Prix payé par le client : numérique et non négatif (Req 12.4).
  const client = Number(customerPrice);
  if (!Number.isFinite(client) || client < 0) {
    return {
      ok: false,
      error: 'Le prix payé par le client doit être positif ou nul.',
      field: 'customerPrice',
    };
  }

  return { ok: true };
};
