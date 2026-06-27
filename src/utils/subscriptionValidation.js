// Module de validation des ventes d'abonnements TV et de la logique associée.
//
// Fonctions PURES (sans effet de bord, sans dépendance réseau) consommées par
// l'écran de vente d'Abonnement (`src/pages/Abonnements.jsx`) et par le
// Service_Relance pour fiabiliser :
//  - la saisie d'un Abonnement (Fournisseur_Abonnement actif, formule, montant
//    payé strictement positif, date de renouvellement future) (Req 10.2, 10.3) ;
//  - l'autorisation d'envoi d'une Campagne_Marketing soumise au consentement du
//    Client (Req 10.7) ;
//  - la construction d'une entrée d'Historique_Rappels par tentative de relance,
//    portant un horodatage, un type et un résultat (Req 10.8).
//
// Feature: agency-operations-expansion

// Types de relance consignés dans l'Historique_Rappels d'un Abonnement (Req 10.8).
export const REMINDER_TYPE_RENEWAL = 'renouvellement';

// Résultats normalisés d'une tentative de relance/rappel (Req 10.8).
export const REMINDER_RESULT_SUCCESS = 'succès';
export const REMINDER_RESULT_FAILURE = 'échec';

// Convertit une valeur de date (Date, horodatage en ms, ou chaîne ISO
// `YYYY-MM-DD`) en un indice de jour calendaire UTC, ou `null` si la valeur
// n'est pas une date interprétable. Comparer des indices de jour permet une
// comparaison « date du jour » indépendante de l'heure (renewal_date est une
// DATE — Req 10.2).
const toDayNumber = (value) => {
  let ms;
  if (value instanceof Date) {
    ms = value.getTime();
  } else if (typeof value === 'number') {
    ms = value;
  } else if (typeof value === 'string' && value.trim() !== '') {
    ms = new Date(value).getTime();
  } else {
    return null;
  }
  if (!Number.isFinite(ms)) {
    return null;
  }
  return Math.floor(ms / 86_400_000);
};

// Valide la saisie d'un Abonnement avant enregistrement.
//
// Accepte si et seulement si (Req 10.2, Property 21) :
//  - le Fournisseur_Abonnement est actif (`providerActive === true`) ;
//  - une formule (`plan`) non vide est fournie ;
//  - le montant payé (`amount`) est un nombre strictement positif ;
//  - la date de renouvellement (`renewalDate`) est strictement postérieure à la
//    date du jour (`today`).
//
// Tout autre cas est rejeté en identifiant le champ invalide (Req 10.3).
// L'ordre de vérification est déterministe : `provider`, puis `plan`, puis
// `amount`, puis `renewalDate`.
//
// Retourne { ok: true } si la saisie est valide,
// sinon { ok: false, error, field }.
export const validateSubscription = ({
  providerActive,
  plan,
  amount,
  renewalDate,
  today,
} = {}) => {
  // Fournisseur_Abonnement actif requis.
  if (providerActive !== true) {
    return {
      ok: false,
      field: 'provider',
      error: "Le fournisseur d'abonnement est invalide.",
    };
  }

  // Formule requise (chaîne non vide, espaces de bord retirés).
  if (typeof plan !== 'string' || plan.trim().length === 0) {
    return { ok: false, field: 'plan', error: 'La formule est invalide.' };
  }

  // Montant payé strictement positif.
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return { ok: false, field: 'amount', error: 'Le montant payé est invalide.' };
  }

  // Date de renouvellement strictement postérieure à la date du jour.
  const renewalDay = toDayNumber(renewalDate);
  const todayDay = toDayNumber(today);
  if (renewalDay === null || todayDay === null || renewalDay <= todayDay) {
    return {
      ok: false,
      field: 'renewalDate',
      error: 'La date de renouvellement est invalide.',
    };
  }

  return { ok: true };
};

// Indique si une Campagne_Marketing peut être envoyée à un Client.
//
// L'envoi est autorisé si et seulement si le Client a explicitement consenti
// (`marketing_consent === true`) (Req 10.7, Property 25). Toute autre valeur
// (false, absente, non booléenne) interdit l'envoi.
//
// Accepte soit le booléen de consentement directement, soit un objet Client
// portant `marketingConsent` (camelCase) ou `marketing_consent` (snake_case,
// tel que stocké en base).
//
// Retourne true si l'envoi est autorisé, false sinon.
export const canSendMarketingCampaign = (consent) => {
  if (consent && typeof consent === 'object') {
    return consent.marketingConsent === true || consent.marketing_consent === true;
  }
  return consent === true;
};

// Construit une entrée d'Historique_Rappels pour une tentative de relance.
//
// Chaque tentative — transmise ou échouée — produit exactement une entrée
// portant un horodatage (`timestamp`), un type (`type`) et un résultat
// (`result`) (Req 10.8, Property 26). L'horodatage est normalisé en chaîne ISO
// 8601 ; l'horloge est injectée par l'appelant (`timestamp`) pour conserver la
// pureté de la fonction. Une cause d'échec optionnelle (`error`) est conservée
// pour le diagnostic lorsque la tentative échoue.
//
// @param {{ type?: string, success?: boolean, timestamp?: number|Date|string, error?: string }} params
// @returns {{ timestamp: string, type: string, result: string, error?: string }}
export const buildReminderHistoryEntry = ({
  type = REMINDER_TYPE_RENEWAL,
  success = false,
  timestamp = Date.now(),
  error,
} = {}) => {
  const at =
    timestamp instanceof Date
      ? timestamp
      : new Date(typeof timestamp === 'number' ? timestamp : Date.parse(timestamp));
  const iso = Number.isNaN(at.getTime())
    ? new Date(0).toISOString()
    : at.toISOString();

  const entry = {
    timestamp: iso,
    type,
    result: success ? REMINDER_RESULT_SUCCESS : REMINDER_RESULT_FAILURE,
  };

  if (!success && typeof error === 'string' && error.trim() !== '') {
    entry.error = error;
  }

  return entry;
};

// Ajoute une entrée d'Historique_Rappels à l'historique d'un Abonnement de
// façon IMMUABLE : renvoie un NOUVEAU tableau contenant exactement une entrée
// supplémentaire, sans muter l'historique d'origine (Req 10.8, Property 26).
//
// @param {Array} history - historique actuel (non muté ; toute valeur non
//   tableau est traitée comme un historique vide).
// @param {Object} entry - entrée produite par `buildReminderHistoryEntry`.
// @returns {Array} nouvel historique avec l'entrée ajoutée en fin.
export const appendReminderHistoryEntry = (history, entry) => {
  const base = Array.isArray(history) ? history : [];
  return [...base, entry];
};
