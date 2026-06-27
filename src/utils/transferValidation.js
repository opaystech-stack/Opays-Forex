// Module de validation des opérations de transfert d'argent.
//
// Fonction PURE (sans effet de bord) consommée par l'écran Transferts et
// AppContext pour fiabiliser l'enregistrement d'une opération de transfert
// (Exigence 8).
//
// Couvre :
//  - le montant strictement positif (Req 8.2, 8.4) ;
//  - la présence et l'activité de la Methode_Transfert sélectionnée (Req 8.2, 8.4) ;
//  - le libellé personnalisé requis 1..60 caractères lorsque la méthode « Autre »
//    est sélectionnée (Req 8.3, 8.5).
//
// Convention de retour : { ok: boolean, error?: string, field?: string }.

import {
  TRANSFER_METHOD_OTHER,
  isValidCustomTransferLabel,
} from './catalogs.js';

// Normalise un libellé de méthode pour la comparaison à « Autre » :
// suppression des espaces de bord et passage en minuscules (comparaison
// insensible à la casse et aux espaces de bord, cohérente avec catalogs.js).
const normalizeLabel = (label) =>
  typeof label === 'string' ? label.trim().toLowerCase() : '';

// Indique si la Methode_Transfert sélectionnée correspond à la valeur « Autre ».
const isOtherMethod = (methodLabel) =>
  normalizeLabel(methodLabel) === normalizeLabel(TRANSFER_METHOD_OTHER);

// Valide une opération de transfert d'argent avant enregistrement.
//
// Paramètres (objet) :
//  - amount       : montant de l'opération (doit être strictement positif) ;
//  - methodId     : identifiant de la Methode_Transfert sélectionnée ;
//  - methodLabel  : libellé de la Methode_Transfert sélectionnée (sert à
//                   détecter la valeur permanente « Autre ») ;
//  - methodActive : indique si la Methode_Transfert sélectionnée est active ;
//  - customLabel  : libellé personnalisé saisi lorsque « Autre » est choisi.
//
// Règles (dans l'ordre de contrôle) :
//  1. Une Methode_Transfert doit être sélectionnée (Req 8.4).
//  2. La Methode_Transfert sélectionnée doit être active (Req 8.4).
//  3. Le montant doit être numérique et strictement positif (Req 8.2, 8.4).
//  4. Si la méthode est « Autre », un libellé personnalisé de 1 à 60 caractères
//     est exigé (Req 8.3, 8.5).
//
// Retourne { ok: true } si l'opération est valide,
// sinon { ok: false, error, field }.
export const validateTransfer = ({
  amount,
  methodId,
  methodLabel,
  methodActive,
  customLabel,
} = {}) => {
  // 1. Methode_Transfert présente (Req 8.4).
  const methodMissing =
    methodId === null ||
    methodId === undefined ||
    (typeof methodId === 'string' && methodId.trim() === '');
  if (methodMissing) {
    return {
      ok: false,
      error: 'La méthode de transfert est requise.',
      field: 'methode',
    };
  }

  // 2. Methode_Transfert active (Req 8.4).
  if (methodActive !== true) {
    return {
      ok: false,
      error: 'La méthode de transfert sélectionnée est désactivée.',
      field: 'methode',
    };
  }

  // 3. Montant strictement positif (Req 8.2, 8.4).
  if (amount === null || amount === undefined) {
    return { ok: false, error: 'Le montant est requis.', field: 'montant' };
  }
  if (typeof amount === 'string' && amount.trim() === '') {
    return { ok: false, error: 'Le montant est requis.', field: 'montant' };
  }
  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount)) {
    return { ok: false, error: 'Le montant doit être numérique.', field: 'montant' };
  }
  if (parsedAmount <= 0) {
    return {
      ok: false,
      error: 'Le montant doit être strictement positif.',
      field: 'montant',
    };
  }

  // 4. Libellé personnalisé requis lorsque la méthode « Autre » est choisie
  //    (Req 8.3, 8.5).
  if (isOtherMethod(methodLabel) && !isValidCustomTransferLabel(customLabel)) {
    return {
      ok: false,
      error: 'Le libellé personnalisé est invalide (1 à 60 caractères requis).',
      field: 'libelle',
    };
  }

  return { ok: true };
};
