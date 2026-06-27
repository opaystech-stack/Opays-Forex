// Planification des relances d'abonnement et des rappels de vol (Exigences 10, 12).
//
// Fonctions et constantes PURES (sans effet de bord, sans réseau, horloge injectée)
// modélisant :
//   - le DÉCLENCHEMENT temporel d'une relance de renouvellement d'Abonnement (Req 10.4)
//     et d'un rappel de vol d'une Reservation_Billet (Req 12.5) ;
//   - la VALIDATION des bornes du Seuil_Relance_Abonnement (1..30 jours, défaut 3 — Req 10.5, 10.6)
//     et du Delai_Rappel_Vol (1..168 heures, défaut 48 — Req 12.6, 12.7).
//
// L'horloge (`nowMs`) et les instants cibles sont fournis en millisecondes (epoch UTC),
// ce qui rend ces fonctions testables sans temps réel : la couche edge `scheduled-reminders`
// se contente d'itérer les lignes candidates et d'appliquer ces prédicats purs.

// Conversions d'unités vers les millisecondes.
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

// Bornes et valeurs par défaut du Seuil_Relance_Abonnement, exprimées en jours (Req 10.5).
export const RENEWAL_THRESHOLD_MIN_DAYS = 1;
export const RENEWAL_THRESHOLD_MAX_DAYS = 30;
export const RENEWAL_THRESHOLD_DEFAULT_DAYS = 3;

// Bornes et valeurs par défaut du Delai_Rappel_Vol, exprimées en heures (Req 12.6).
export const FLIGHT_LEAD_TIME_MIN_HOURS = 1;
export const FLIGHT_LEAD_TIME_MAX_HOURS = 168;
export const FLIGHT_LEAD_TIME_DEFAULT_HOURS = 48;

// Indique si une valeur est un nombre fini exploitable comme horodatage/quantité.
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

// Indique si une valeur est un entier dans l'intervalle fermé [min, max].
const isIntegerInRange = (value, min, max) =>
  isFiniteNumber(value) && Number.isInteger(value) && value >= min && value <= max;

// Une relance de renouvellement d'Abonnement est DUE lorsque l'instant courant atteint
// la date de renouvellement diminuée du Seuil_Relance_Abonnement (Req 10.4) :
//   due  <=>  nowMs >= renewalDateMs - (seuilJours * MS_PER_DAY)
//
// Paramètres :
//   - nowMs        : instant courant en ms (epoch UTC) ;
//   - renewalDateMs: instant de la date de renouvellement en ms (epoch UTC) ;
//   - seuilJours   : Seuil_Relance_Abonnement en jours.
// Toute entrée non numérique/non finie ou un seuil hors bornes valides retourne `false`
// (aucune relance déclenchée sur une configuration invalide).
export const isSubscriptionReminderDue = (nowMs, renewalDateMs, seuilJours) => {
  if (!isFiniteNumber(nowMs) || !isFiniteNumber(renewalDateMs)) {
    return false;
  }
  if (!isValidRenewalThreshold(seuilJours)) {
    return false;
  }
  const reminderInstantMs = renewalDateMs - seuilJours * MS_PER_DAY;
  return nowMs >= reminderInstantMs;
};

// Un rappel de vol est DÛ lorsque l'instant courant atteint l'instant du vol diminué
// du Delai_Rappel_Vol (Req 12.5) :
//   due  <=>  nowMs >= flightInstantMs - (delaiHeures * MS_PER_HOUR)
//
// Paramètres :
//   - nowMs         : instant courant en ms (epoch UTC) ;
//   - flightInstantMs: instant du vol en ms (epoch UTC) ;
//   - delaiHeures   : Delai_Rappel_Vol en heures.
// Toute entrée non numérique/non finie ou un délai hors bornes valides retourne `false`.
export const isFlightReminderDue = (nowMs, flightInstantMs, delaiHeures) => {
  if (!isFiniteNumber(nowMs) || !isFiniteNumber(flightInstantMs)) {
    return false;
  }
  if (!isValidFlightLeadTime(delaiHeures)) {
    return false;
  }
  const reminderInstantMs = flightInstantMs - delaiHeures * MS_PER_HOUR;
  return nowMs >= reminderInstantMs;
};

// Valide un Seuil_Relance_Abonnement : entier dans l'intervalle fermé 1..30 jours (Req 10.5, 10.6).
export const isValidRenewalThreshold = (jours) =>
  isIntegerInRange(jours, RENEWAL_THRESHOLD_MIN_DAYS, RENEWAL_THRESHOLD_MAX_DAYS);

// Valide un Delai_Rappel_Vol : entier dans l'intervalle fermé 1..168 heures (Req 12.6, 12.7).
export const isValidFlightLeadTime = (heures) =>
  isIntegerInRange(heures, FLIGHT_LEAD_TIME_MIN_HOURS, FLIGHT_LEAD_TIME_MAX_HOURS);
