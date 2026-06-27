# Implementation Plan

## Overview

Plan d'implémentation du bugfix `admin-design-fix` suivant la méthodologie de
condition de bug (exploration → préservation → correction → validation). Les
tests d'exploration (Property 1 & 2) et de préservation (Property 3) sont écrits
AVANT la correction, conformément au design. Deux corrections ciblées : honorer
`?debug_force_demo` dans la garde interne de `EspaceAdminPlateforme`, et
envelopper `ConsoleAdmin` dans le conteneur de thème clair `StandalonePage`.

## Tasks

- [x] 1. Écrire les tests d'exploration de la condition de bug (AVANT toute correction)
  - **Property 1: Bug Condition** - Garde interne honore `?debug_force_demo`
  - **Property 2: Bug Condition** - Console admin sur surface de thème clair
  - **CRITICAL**: Ces tests DOIVENT ÉCHOUER sur le code non corrigé — l'échec confirme l'existence du bug
  - **DO NOT attempt to fix the test or the code when it fails** à ce stade
  - **NOTE**: Ces tests encodent le comportement attendu — ils valideront la correction lorsqu'ils passeront après l'implémentation
  - **GOAL**: Faire émerger des contre-exemples qui démontrent l'existence des bugs
  - **Scoped PBT Approach**: les bugs sont déterministes ; scoper chaque propriété aux cas concrets reproductibles ci-dessous
  - Property 1 (depuis `isBugCondition_PlatformAdmin` du design) : simuler `window.location.search = "?debug_force_demo"` puis rendre `EspaceAdminPlateforme` SANS `profilAcces.is_platform_editor` et SANS `user.isDemo` ; pour toute valeur de profil/flag satisfaisant la condition de bug, asserter que l'UI d'administration plateforme est présente et que le texte `platform_admin.permission_denied` (« Permission insuffisante ») est ABSENT
  - Property 2 (depuis `isBugCondition_ConsoleAdmin` du design) : rendre la route `/admin` (montage de `ConsoleAdmin`) en contexte admin ; asserter la présence d'un ancêtre `.standalone-page` (conteneur de thème clair)
  - Les assertions doivent correspondre aux Correctness Properties du design (Property 1 et Property 2 / Expected Behavior)
  - Exécuter les tests sur le code NON corrigé (utiliser l'infrastructure existante : Vitest + Testing Library, cf. `EspaceAdminPlateforme.test.jsx`)
  - **EXPECTED OUTCOME**: Les tests ÉCHOUENT (c'est correct — cela prouve que les bugs existent)
  - Documenter les contre-exemples observés (ex. : la carte « Permission insuffisante » s'affiche malgré `?debug_force_demo` ; `ConsoleAdmin` rendu sans ancêtre `.standalone-page`)
  - Marquer la tâche terminée quand les tests sont écrits, exécutés et l'échec documenté
  - _Requirements: 2.1, 2.2_

- [x] 2. Écrire les tests de préservation basés sur les propriétés (AVANT d'implémenter la correction)
  - **Property 3: Preservation** - Comportement hors condition de bug inchangé
  - **IMPORTANT**: Suivre la méthodologie d'observation d'abord (observation-first)
  - Observer d'abord le comportement sur le code NON corrigé pour les entrées hors condition de bug (cas où `isBugCondition_PlatformAdmin` ET `isBugCondition_ConsoleAdmin` sont faux)
  - Observer : `EspaceAdminPlateforme` avec `is_platform_editor = true` (sans debug) ⇒ l'UI d'administration plateforme s'affiche
  - Observer : ni éditeur, ni `isDemo`, ni `?debug_force_demo` ⇒ la carte de refus s'affiche (garde interne)
  - Observer : `/admin` sans rôle admin ni démo/debug ⇒ redirection vers la Page_Acces_Restreint (`AdminRoute`)
  - Observer : `/paiement`, `/admin-plateforme`, garde d'agence suspendue conservent leur conteneur `.standalone-page` et leur contraste
  - Observer : la logique de `ConsoleAdmin` (chargement, pagination, sélection de preuve, activer/désactiver, valider/rejeter) fonctionne comme avant
  - Écrire des tests basés sur les propriétés capturant ces comportements observés (depuis les Preservation Requirements du design) : générer des combinaisons aléatoires de `{ is_platform_editor, isDemo, hasDebugDemo, isAdmin, route }` et vérifier que, hors condition de bug, la décision (UI vs refus, redirection, thème) est identique entre F et F'
  - Le test basé sur les propriétés génère de nombreux cas pour des garanties plus fortes (cf. Preservation Checking du design)
  - Exécuter les tests sur le code NON corrigé
  - **EXPECTED OUTCOME**: Les tests PASSENT (cela confirme le comportement de référence à préserver)
  - Marquer la tâche terminée quand les tests sont écrits, exécutés et passants sur le code non corrigé
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Corriger les deux défauts des espaces d'administration

  - [x] 3.1 Honorer `?debug_force_demo` dans la garde interne de `EspaceAdminPlateforme`
    - Extraire le test de `?debug_force_demo` dans un utilitaire partagé synchrone et défensif `src/utils/debugDemo.js` exportant `hasDebugDemo()` (try/catch, garde `typeof window`), conforme à AGENTS.md (préférer mettre à jour/centraliser les utilitaires plutôt que dupliquer)
    - Dans `src/pages/EspaceAdminPlateforme.jsx`, étendre le calcul d'autorisation : `isPlatformEditor = Boolean(profilAcces?.is_platform_editor) || Boolean(user?.isDemo) || hasDebugDemo()`
    - Remplacer la définition locale de `hasDebugDemo()` dans `src/App.jsx` par l'import depuis `src/utils/debugDemo.js`, sans changer son comportement
    - _Bug_Condition: isBugCondition_PlatformAdmin(X) — route "/admin-plateforme" AND hasDebugDemo = true AND NOT (is_platform_editor OR isDemo)_
    - _Expected_Behavior: EspaceAdminPlateforme'(X) affiche l'UI d'administration et NON la carte « Permission insuffisante » (Property 1 du design)_
    - _Preservation: Preservation Requirements du design (accès/refus légitimes inchangés)_
    - _Requirements: 2.1, 3.1, 3.2_

  - [x] 3.2 Envelopper `ConsoleAdmin` dans le conteneur de thème clair
    - Dans `src/App.jsx`, route `/admin` : entourer `<ConsoleAdmin />` du composant existant `StandalonePage` (déjà importé), comme les autres pages autonomes : `<StandalonePage maxWidth={1080}><ConsoleAdmin /></StandalonePage>` (largeur alignée sur `PlatformAdminScreen` pour le tableau de la console)
    - Aucune modification de la logique de `ConsoleAdmin` : seul l'habillage/contraste change
    - _Bug_Condition: isBugCondition_ConsoleAdmin(X) — route "/admin" AND container ≠ lightThemeStandaloneContainer_
    - _Expected_Behavior: ConsoleAdminRender'(X) monte la console dans `.standalone-page` avec un contraste lisible (Property 2 du design)_
    - _Preservation: Preservation Requirements du design (logique/actions de la console et thème des autres pages inchangés)_
    - _Requirements: 2.2, 3.4, 3.5_

  - [x] 3.3 Vérifier que les tests d'exploration de la condition de bug passent désormais
    - **Property 1: Expected Behavior** - Garde interne honore `?debug_force_demo`
    - **Property 2: Expected Behavior** - Console admin sur surface de thème clair
    - **IMPORTANT**: Réexécuter LES MÊMES tests que la tâche 1 — ne PAS écrire de nouveaux tests
    - Les tests de la tâche 1 encodent le comportement attendu ; lorsqu'ils passent, ils confirment que le comportement attendu est satisfait
    - Exécuter les tests d'exploration de l'étape 1
    - **EXPECTED OUTCOME**: Les tests PASSENT (confirment que les bugs sont corrigés)
    - _Requirements: 2.1, 2.2_

  - [x] 3.4 Vérifier que les tests de préservation passent toujours
    - **Property 3: Preservation** - Comportement hors condition de bug inchangé
    - **IMPORTANT**: Réexécuter LES MÊMES tests que la tâche 2 — ne PAS écrire de nouveaux tests
    - Exécuter les tests de préservation basés sur les propriétés de l'étape 2
    - **EXPECTED OUTCOME**: Les tests PASSENT (confirment l'absence de régression)
    - Confirmer que tous les tests passent encore après la correction (pas de régression)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. Checkpoint - S'assurer que tous les tests passent
  - Exécuter `npm test` et vérifier que la suite complète passe
  - S'assurer que tous les tests passent ; en cas de question ou d'ambiguïté, demander à l'utilisateur

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1", "2"],
      "description": "Tests d'exploration (Property 1 & 2) et de préservation (Property 3) écrits et exécutés sur le code NON corrigé. Indépendants."
    },
    {
      "wave": 2,
      "tasks": ["3.1", "3.2"],
      "description": "Corrections ciblées : garde interne honore ?debug_force_demo ; ConsoleAdmin enveloppé dans StandalonePage. Dépend de la compréhension issue des tâches 1 et 2."
    },
    {
      "wave": 3,
      "tasks": ["3.3", "3.4"],
      "description": "Vérifier que les tests d'exploration passent désormais et que les tests de préservation passent toujours. Dépend de 3.1 et 3.2."
    },
    {
      "wave": 4,
      "tasks": ["4"],
      "description": "Checkpoint final : toute la suite de tests passe. Dépend de toutes les vagues précédentes."
    }
  ]
}
```

- Les tâches 1 et 2 sont indépendantes et doivent être réalisées en premier (sur le code NON corrigé).
- Les tâches 3.1 et 3.2 (corrections) dépendent de la compréhension issue des tâches 1 et 2.
- Les tâches 3.3 et 3.4 (vérifications) dépendent des corrections 3.1 et 3.2.
- La tâche 4 (checkpoint) dépend de toutes les précédentes.

## Notes

- Les tests d'exploration (tâche 1) DOIVENT échouer sur le code non corrigé ; ne pas
  tenter de corriger le test ou le code à ce stade.
- Les tests de préservation (tâche 2) DOIVENT passer sur le code non corrigé
  (méthodologie observation-first).
- Réutiliser l'infrastructure de test existante (Vitest + Testing Library), cf.
  `EspaceAdminPlateforme.test.jsx`.
- Conforme à AGENTS.md : centraliser `hasDebugDemo()` dans `src/utils/debugDemo.js`
  plutôt que dupliquer, et préserver la structure/le nommage des pages existantes.
