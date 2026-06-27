// Module d'activation à deux niveaux des Modules_Fonctionnels (Exigences 4, 6).
//
// Fonctions et constantes PURES (sans effet de bord ni réseau) modélisant la
// distinction entre :
//   - l'HABILITATION plateforme (Droit_Module accordé par l'Editeur_Plateforme),
//   - l'ACTIVATION agence (toggle du Propriétaire_Agence, état persistant).
//
// Sémantique des deux niveaux (Property 9, 10, 11 du document de conception) :
//   - Un Module_Additionnel n'est ACTIVABLE par l'Agence que si un Droit_Module
//     lui est accordé (entitlements[moduleKey] === true) (Req 4.4, 6.2).
//   - Un module est UTILISABLE (enabled) si et seulement si :
//       * c'est un Module_Base, OU
//       * c'est un module optionnel et il est activé, OU
//       * c'est un Module_Additionnel habilité ET activé (Req 6.5).
//   - Sans Droit_Module, un Module_Additionnel n'est ni activable ni utilisable ;
//     la révocation du Droit_Module le rend immédiatement non utilisable
//     (Req 4.3, 4.5, 6.2).

// Modules_Base : trésorerie de base, activés par défaut, aucun Droit_Module requis (Req 6.1).
export const BASE_MODULES = ['portefeuilles', 'transactions', 'depenses', 'clients'];

// Modules optionnels : activables librement par l'Agence, aucun Droit_Module requis (Req 6.1).
export const OPTIONAL_MODULES = [
  'prets',
  'dettes',
  'taux_service',
  'publication_whatsapp',
  'commande_distance',
];

// Modules_Additionnels : ensemble FERMÉ, désactivés et non habilités par défaut,
// dont l'activation exige un Droit_Module accordé au niveau plateforme (Req 4.1, 6.1).
export const ADDITIONAL_MODULES = ['transfert_argent', 'abonnements', 'billets_avion'];

// Indique si une clé appartient à l'ensemble fermé des Modules_Additionnels (Property 9, Req 4.1).
const isAdditionalModule = (moduleKey) => ADDITIONAL_MODULES.includes(moduleKey);

// Indique si une clé désigne un Module_Base.
const isBaseModule = (moduleKey) => BASE_MODULES.includes(moduleKey);

// Indique si une clé désigne un module optionnel.
const isOptionalModule = (moduleKey) => OPTIONAL_MODULES.includes(moduleKey);

// Un Module_Additionnel est ACTIVABLE par le Propriétaire_Agence si et seulement si
// un Droit_Module lui a été accordé (entitlements[moduleKey] === true) (Req 4.4, 6.2).
//
// Les Modules_Base et optionnels ne sont pas concernés par l'habilitation : ils ne
// sont donc PAS « activables » au sens du Droit_Module (cette fonction ne couvre que
// le verrou plateforme propre aux Modules_Additionnels). Pour toute clé inconnue ou
// non additionnelle, retourne false.
//
// `entitlements` est un dictionnaire { module_key: boolean } ; une clé absente ou
// falsy vaut « non habilité » (Req 4.3).
export const isModuleActivatable = (moduleKey, entitlements = {}) => {
  if (!isAdditionalModule(moduleKey)) {
    return false;
  }
  return entitlements?.[moduleKey] === true;
};

// Un Module_Fonctionnel est UTILISABLE (enabled) selon les règles à deux niveaux (Req 6.5) :
//   - Module_Base                         -> toujours utilisable ;
//   - module optionnel                    -> utilisable ssi activé (moduleStates) ;
//   - Module_Additionnel                  -> utilisable ssi habilité (entitlements) ET activé ;
//   - clé inconnue                        -> non utilisable.
//
// `context` :
//   - moduleStates : { module_key: boolean } états d'activation persistés par Agence (Req 6.6) ;
//   - entitlements : { module_key: boolean } Droits_Module accordés par la plateforme (Req 4.3).
export const isModuleEnabled = (moduleKey, context = {}) => {
  const { moduleStates = {}, entitlements = {} } = context;

  if (isBaseModule(moduleKey)) {
    return true;
  }

  if (isOptionalModule(moduleKey)) {
    return moduleStates?.[moduleKey] === true;
  }

  if (isAdditionalModule(moduleKey)) {
    // Deux niveaux requis : Droit_Module accordé ET activation agence (Req 6.5).
    return isModuleActivatable(moduleKey, entitlements) && moduleStates?.[moduleKey] === true;
  }

  return false;
};

// État d'activation par défaut d'une Agence sans choix de modules enregistré (Req 4.3, 6.8) :
//   - tous les Modules_Base activés,
//   - tous les modules optionnels désactivés,
//   - tous les Modules_Additionnels désactivés.
// Retourne un nouvel objet { module_key: boolean } à chaque appel (aucun état partagé).
export const defaultModuleState = () => {
  const state = {};
  for (const key of BASE_MODULES) {
    state[key] = true;
  }
  for (const key of OPTIONAL_MODULES) {
    state[key] = false;
  }
  for (const key of ADDITIONAL_MODULES) {
    state[key] = false;
  }
  return state;
};
