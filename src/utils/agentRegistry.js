// Registre d'agents IA et validation humaine systématique (Exigence 15, Exigence 14.7).
//
// Fonctions et constantes PURES (sans effet de bord ni réseau) modélisant :
//   - le Registre_Agents extensible des types d'Agent_IA (Req 15.1, 15.2) ;
//   - la qualification d'une Action_Critique (Req 15.3, glossaire « Action_Critique ») ;
//   - la règle « validation humaine avant toute Action_Critique » : une proposition
//     d'Agent_IA (ou une Commande_Distante à enregistrer définitivement) n'est
//     exécutable QUE si elle a reçu une Confirmation explicite d'un Utilisateur
//     disposant de la Permission requise (Req 14.7, 15.3, 15.4, 15.6).
//
// Cette couche est une commodité d'interface et de logique : l'autorité finale
// (cloisonnement, écritures) reste la RLS PostgreSQL (cf. design). Elle est ici
// extraite pour être testable isolément.

// Six types d'Agent_IA anticipés dont le Registre_Agents est initialisé (Req 15.2).
// Le registre demeure extensible : `registerAgent` autorise l'ajout ultérieur de
// nouveaux types (Req 15.1).
export const AGENT_TYPES = [
  'forex',
  'comptabilite',
  'service_client',
  'whatsapp',
  'analyse_financiere',
  'marketing',
];

// Ensemble fermé des genres d'Action_Critique (Req 15.3, glossaire « Action_Critique ») :
// actions produisant un effet persistant ou externe. Toute action de ce genre,
// proposée par un Agent_IA ou issue d'une Commande_Distante, exige une Confirmation
// humaine habilitée avant exécution ou enregistrement définitif (Req 14.7, 15.4).
//
//   - création / modification / suppression d'une Operation ;
//   - création / modification / suppression d'un Service_Additionnel ;
//   - création / modification / suppression d'un Abonnement ;
//   - création / modification / suppression d'une Reservation_Billet ;
//   - création / modification / suppression d'une Commande_Distante (enregistrement définitif) ;
//   - modification d'un solde ;
//   - envoi d'un message WhatsApp sortant ;
//   - modification d'un Droit_Module, d'un Module_Fonctionnel ou d'un Etat_Agence.
export const CRITICAL_ACTION_KINDS = [
  'operation.creer',
  'operation.modifier',
  'operation.supprimer',
  'service_additionnel.creer',
  'service_additionnel.modifier',
  'service_additionnel.supprimer',
  'abonnement.creer',
  'abonnement.modifier',
  'abonnement.supprimer',
  'reservation_billet.creer',
  'reservation_billet.modifier',
  'reservation_billet.supprimer',
  'commande_distante.enregistrer',
  'commande_distante.modifier',
  'commande_distante.supprimer',
  'solde.modifier',
  'whatsapp.envoyer',
  'droit_module.modifier',
  'module_fonctionnel.modifier',
  'etat_agence.modifier',
];

// Crée un Registre_Agents initialisé avec exactement les six types anticipés (Req 15.2).
// Chaque entrée est un descripteur minimal { type, isEnabled }. Retourne un nouvel
// objet { agents: [...] } à chaque appel (aucun état partagé).
export const createAgentRegistry = () => ({
  agents: AGENT_TYPES.map((type) => ({ type, isEnabled: false })),
});

// Indique si un type d'Agent_IA est déjà présent dans un registre.
const hasAgentType = (registry, type) =>
  Array.isArray(registry?.agents) &&
  registry.agents.some((agent) => agent?.type === type);

// Ajoute un type d'Agent_IA au Registre_Agents sans retirer les types existants
// (registre extensible — Req 15.1, 15.6). Fonction PURE : retourne un NOUVEAU
// registre, sans muter l'entrée fournie.
//
// `agentDescriptor` doit comporter un `type` non vide. Un descripteur invalide,
// ou un `type` déjà présent, laisse le registre inchangé (retourne une copie
// préservant l'ensemble des types existants), garantissant l'idempotence et la
// non-perte des types déjà recensés.
export const registerAgent = (registry, agentDescriptor) => {
  const base =
    registry && Array.isArray(registry.agents)
      ? { ...registry, agents: [...registry.agents] }
      : { agents: [] };

  const type = agentDescriptor?.type;
  if (typeof type !== 'string' || type.trim().length === 0) {
    return base;
  }

  // Ne jamais retirer ni dupliquer un type déjà recensé (Req 15.1).
  if (hasAgentType(base, type)) {
    return base;
  }

  return {
    ...base,
    agents: [
      ...base.agents,
      { type, isEnabled: agentDescriptor?.isEnabled === true },
    ],
  };
};

// Indique si un genre d'action est une Action_Critique exigeant une Confirmation
// humaine préalable (Req 15.3). Toute valeur hors de l'ensemble fermé (action non
// critique, type invalide) retourne false.
export const isCriticalAction = (actionKind) =>
  typeof actionKind === 'string' && CRITICAL_ACTION_KINDS.includes(actionKind);

// Détermine si une proposition (d'un Agent_IA ou d'une Commande_Distante) peut être
// exécutée / enregistrée définitivement (Req 14.7, 15.3, 15.4, 15.6).
//
// Règle (Property 30) :
//   - Une action NON critique ne requiert pas de Confirmation : elle est exécutable.
//   - Une Action_Critique est exécutable SI ET SEULEMENT SI une Confirmation explicite
//     a été donnée (`confirmedBy` identifie un Utilisateur) ET cet Utilisateur dispose
//     de la Permission requise (`requiredPermission ∈ confirmerPermissions`).
//   - En l'absence de Confirmation habilitée, aucun effet persistant ou externe
//     n'est exécuté (retourne false).
//
// `action` :
//   - kind : genre de l'action proposée (cf. CRITICAL_ACTION_KINDS) ;
//   - requiredPermission : Permission exigée pour confirmer cette action (optionnelle ;
//     si absente, la seule présence d'un confirmateur identifié suffit).
// `confirmedBy` : identifiant de l'Utilisateur ayant donné la Confirmation, ou
//   null/undefined si aucune Confirmation n'a été donnée.
// `confirmerPermissions` : ensemble effectif des Permissions du confirmateur.
export const canExecuteProposal = ({
  action,
  confirmedBy,
  confirmerPermissions = [],
} = {}) => {
  const kind = action?.kind;

  // Une action non critique ne nécessite pas de validation humaine préalable.
  if (!isCriticalAction(kind)) {
    return true;
  }

  // Action_Critique : une Confirmation explicite et identifiée est obligatoire (Req 15.4).
  const hasConfirmer =
    typeof confirmedBy === 'string'
      ? confirmedBy.trim().length > 0
      : confirmedBy != null;
  if (!hasConfirmer) {
    return false;
  }

  // Le confirmateur doit disposer de la Permission requise, le cas échéant (Req 15.3).
  const requiredPermission = action?.requiredPermission;
  if (requiredPermission != null) {
    const permissions = Array.isArray(confirmerPermissions)
      ? confirmerPermissions
      : [];
    return permissions.includes(requiredPermission);
  }

  return true;
};
