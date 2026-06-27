// Accès de test local : présence du paramètre ?debug_force_demo dans l'URL.
// Évalué SYNCHRONEMENT par les gardes (route ET garde interne) pour autoriser
// l'ouverture directe des espaces protégés (démo) sans course avec l'effet
// d'auto-connexion. Défensif : try/catch + garde `typeof window` (SSR/tests).
//
// Centralisé ici (AGENTS.md : préférer mettre à jour/centraliser les utilitaires
// plutôt que dupliquer) et consommé par `App.jsx` et `EspaceAdminPlateforme.jsx`.
export function hasDebugDemo() {
  try {
    return (
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).has('debug_force_demo')
    );
  } catch {
    return false;
  }
}

export function hasDebugRestricted() {
  try {
    return (
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).has('debug_force_restricted')
    );
  } catch {
    return false;
  }
}
