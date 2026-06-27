# Admin Design Fix — Bugfix Design

## Overview

Ce design corrige deux défauts des espaces d'administration de l'application
(React + Vite, données Supabase), en respectant la méthodologie de condition de
bug définie dans `bugfix.md` (vérification de correction + vérification de
préservation). Les deux corrections sont volontairement minimales et alignées
sur la structure existante du code.

**Bug 1 — `/admin-plateforme` (accès bloqué en démo/debug).**
La garde de route `PlatformEditorRoute` (dans `src/App.jsx`) autorise l'accès
quand l'URL contient `?debug_force_demo` (via le helper synchrone
`hasDebugDemo()`). Mais la garde interne du composant `EspaceAdminPlateforme`
calcule son autorisation uniquement à partir de
`profilAcces.is_platform_editor` et `user.isDemo`, **sans** tenir compte du
paramètre `?debug_force_demo`. Comme l'auto-connexion en mode démo est
asynchrone (effet dans `AppContext`), `user.isDemo` n'est pas encore positionné
au premier rendu : la garde interne affiche alors la carte « Permission
insuffisante » alors que la route a déjà autorisé l'entrée. La correction aligne
la garde interne sur la garde de route en honorant `?debug_force_demo` de la
même façon (vérification synchrone de l'URL).

**Bug 2 — `/admin` (contraste illisible).**
Dans `src/App.jsx`, la route `/admin-plateforme` enveloppe son contenu dans
`PlatformAdminScreen`, qui applique le conteneur de Theme_Clair
`.standalone-page`. La route `/admin` monte au contraire `<ConsoleAdmin />`
directement, sans aucun conteneur, donc sur le fond bleu nuit (`--deep-navy`) du
`body`. Comme la `Console_Admin` utilise des couleurs de texte de thème clair
(`--text-primary`/`--text-secondary`, sombres), le contraste est insuffisant. La
correction enveloppe `ConsoleAdmin` dans le composant existant `StandalonePage`
(déjà importé dans `App.jsx`), exactement comme les autres pages autonomes.

## Glossary

- **Bug_Condition (C)** : Condition déclenchant le bug. Deux conditions
  distinctes ici : (a) accès `/admin-plateforme` ouvert via `?debug_force_demo`
  refusé par la garde interne ; (b) `/admin` rendu hors conteneur de thème clair.
- **Property (P)** : Comportement attendu après correction — l'interface
  d'administration plateforme s'affiche en mode démo/debug ; la `Console_Admin`
  s'affiche sur une surface claire au contraste lisible.
- **Preservation** : Comportements existants qui doivent rester inchangés —
  refus d'accès légitime, accès des utilisateurs légitimes, fonctionnalités de
  la console (chargement, pagination, actions), thème des autres pages.
- **F** : Code d'origine (non corrigé). **F'** : Code corrigé.
- **EspaceAdminPlateforme** : Composant page dans
  `src/pages/EspaceAdminPlateforme.jsx` portant la garde interne et l'UI
  d'administration plateforme (Droits_Module, agences, catalogues).
- **ConsoleAdmin** : Composant page dans `src/pages/ConsoleAdmin.jsx`, console
  d'administration des accès (profils, preuves de paiement, pagination, actions).
- **PlatformEditorRoute** : Garde de route dans `src/App.jsx` réservant
  `/admin-plateforme` à l'Editeur_Plateforme, au mode démo ou à `?debug_force_demo`.
- **hasDebugDemo()** : Helper synchrone dans `src/App.jsx` testant la présence du
  paramètre `?debug_force_demo` dans `window.location.search`.
- **StandalonePage** : Composant dans `src/components/StandalonePage.jsx`
  enveloppant une page hors AppShell dans le conteneur de Theme_Clair
  `.standalone-page` / `.standalone-page__inner`.
- **.standalone-page** : Classe CSS (`src/index.css`) appliquant un fond clair
  dégradé et la couleur de texte du thème clair aux pages autonomes.

## Bug Details

### Bug Condition

#### Condition 1 — `/admin-plateforme` (accès démo/debug bloqué)

Le bug se manifeste quand un utilisateur ouvre `/admin-plateforme` avec
`?debug_force_demo` : la garde de route autorise l'entrée, mais la garde interne
de `EspaceAdminPlateforme` ne reconnaît pas le paramètre et affiche la carte de
permission refusée. La garde interne est désynchronisée de la garde de route
parce qu'elle n'évalue pas `hasDebugDemo()`.

**Formal Specification:**
```
FUNCTION isBugCondition_PlatformAdmin(X)
  INPUT: X = { route, hasDebugDemo, profilAcces, user }
  OUTPUT: boolean

  RETURN X.route = "/admin-plateforme"
         AND X.hasDebugDemo = true
         AND NOT (X.profilAcces.is_platform_editor OR X.user.isDemo)
END FUNCTION
```

#### Condition 2 — `/admin` (contraste illisible)

Le bug se manifeste quand `/admin` est rendu : `ConsoleAdmin` est monté
directement sur le `body` bleu nuit, sans le conteneur de thème clair
`.standalone-page`, alors que ses textes utilisent les couleurs (sombres) du
thème clair.

**Formal Specification:**
```
FUNCTION isBugCondition_ConsoleAdmin(X)
  INPUT: X = { route, container }
  OUTPUT: boolean

  RETURN X.route = "/admin"
         AND X.container != lightThemeStandaloneContainer
END FUNCTION
```

### Examples

- **Démo/debug, attendu vs actuel** : ouvrir `/admin-plateforme?debug_force_demo`.
  Attendu : l'interface d'administration plateforme s'affiche (cohérent avec la
  route). Actuel : la carte « Permission insuffisante : réservé à l'éditeur de la
  plateforme » s'affiche et masque l'UI.
- **Console admin, attendu vs actuel** : ouvrir `/admin` en tant qu'admin.
  Attendu : en-tête « Console d'administration » et texte lisibles sur surface
  claire. Actuel : texte sombre sur fond bleu nuit, contraste insuffisant,
  en-tête et « Chargement des données… » quasi illisibles.
- **Éditeur réel** : ouvrir `/admin-plateforme` avec
  `profilAcces.is_platform_editor = true`. Attendu et actuel : l'UI s'affiche
  (comportement à préserver).
- **Edge case** : ouvrir `/admin-plateforme?debug_force_demo` après que l'effet
  d'auto-connexion a positionné `user.isDemo = true`. Attendu : l'UI s'affiche
  déjà aujourd'hui via `isDemo` ; après correction, elle s'affiche aussi au
  premier rendu (avant que `isDemo` ne soit positionné), grâce à
  `hasDebugDemo()`.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Un Editeur_Plateforme réel (`is_platform_editor`) ou un utilisateur en mode
  démo (`isDemo`) qui ouvre `/admin-plateforme` continue de voir l'interface
  d'administration plateforme.
- Un utilisateur sans droit d'éditeur de plateforme et sans mode démo/debug
  continue de se voir refuser l'accès à `/admin-plateforme` (redirection de route
  par `PlatformEditorRoute`, et carte de permission refusée par la garde interne).
- Un utilisateur non administrateur et sans mode démo/debug accédant à `/admin`
  continue d'être redirigé vers la Page_Acces_Restreint (`AdminRoute`).
- Les pages autonomes existantes en thème clair (`/admin-plateforme`,
  `/paiement`, garde d'agence suspendue, etc.) conservent leur thème et leur
  contraste corrects.
- La `Console_Admin` continue de charger et d'afficher profils, preuves,
  pagination et actions (activer/désactiver, valider/rejeter) exactement comme
  avant ; seul l'habillage/contraste est corrigé.

**Scope:**
Toute entrée hors condition de bug doit être totalement inchangée. Cela inclut :
- L'accès légitime (éditeur réel, mode démo) et le refus légitime à `/admin-plateforme`.
- La redirection légitime des non-admins à `/admin`.
- La logique métier et les interactions de la `Console_Admin`
  (`loadData`, `buildEntries`, pagination, `handleAccessChange`, `handleReview`,
  `selectProof`).
- Le rendu et le thème de toutes les autres routes/pages.

**Note :** Le comportement correct attendu pour les entrées buguées est défini
dans la section « Correctness Properties » (Property 1 et Property 2).

## Hypothesized Root Cause

D'après l'analyse du code, les causes les plus probables sont :

1. **Garde interne désynchronisée (`/admin-plateforme`)** : dans
   `EspaceAdminPlateforme.jsx`, le calcul
   `isPlatformEditor = Boolean(profilAcces?.is_platform_editor) || Boolean(user?.isDemo)`
   n'inclut pas la vérification de `?debug_force_demo`.
   - La garde de route `PlatformEditorRoute` (App.jsx) inclut pourtant
     `hasDebugDemo()` dans son test.
   - L'auto-connexion démo via `?debug_force_demo` est asynchrone (effet dans
     `AppContext`), donc `user.isDemo` est `false`/indéfini au premier rendu :
     la garde interne refuse l'accès avant que `isDemo` ne soit positionné.

2. **Conteneur de thème absent (`/admin`)** : dans `App.jsx`, la route `/admin`
   monte `<ConsoleAdmin />` directement, sans `StandalonePage`/`.standalone-page`,
   contrairement à `/admin-plateforme` (`PlatformAdminScreen` applique
   `.standalone-page`) et aux autres pages autonomes (`StandalonePage`).
   - Les textes de `ConsoleAdmin` utilisent `--text-primary`/`--text-secondary`
     (sombres), pensés pour une surface claire ; sur le `body` `--deep-navy`, le
     contraste s'effondre.

3. **(Écarté)** Couleurs codées en dur dans `ConsoleAdmin` : non — la console
   utilise les variables de thème ; le problème est l'absence de surface claire,
   pas les couleurs elles-mêmes.

## Correctness Properties

Property 1: Bug Condition — Garde interne honore `?debug_force_demo`

_For any_ entrée où la condition de bug `isBugCondition_PlatformAdmin` est vraie
(route `/admin-plateforme`, `?debug_force_demo` présent, ni éditeur réel ni
`isDemo`), la fonction corrigée `EspaceAdminPlateforme'` SHALL afficher
l'interface d'administration plateforme et NE PAS afficher la carte
« Permission insuffisante », de manière cohérente avec la garde de route
`PlatformEditorRoute`.

**Validates: Requirements 2.1**

Property 2: Bug Condition — Console admin sur surface de thème clair

_For any_ entrée où la condition de bug `isBugCondition_ConsoleAdmin` est vraie
(route `/admin` rendue hors conteneur de thème clair), le rendu corrigé
`ConsoleAdminRender'` SHALL monter la console dans le conteneur de Theme_Clair
`.standalone-page`, de sorte que l'en-tête et le texte présentent un contraste
lisible sur le fond clair.

**Validates: Requirements 2.2**

Property 3: Preservation — Comportement hors condition de bug inchangé

_For any_ entrée où la condition de bug est fausse (`NOT
(isBugCondition_PlatformAdmin(X) OR isBugCondition_ConsoleAdmin(X))`), le code
corrigé `F'` SHALL produire le même résultat que le code d'origine `F`,
préservant : l'accès légitime (éditeur réel, mode démo) et le refus légitime à
`/admin-plateforme`, la redirection des non-admins à `/admin`, la logique et les
interactions de la `Console_Admin`, ainsi que le thème des autres pages.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

En supposant l'analyse des causes correcte, deux modifications ciblées sont
nécessaires.

**Fichier** : `src/pages/EspaceAdminPlateforme.jsx`

**Fonction** : `EspaceAdminPlateforme` (calcul de `isPlatformEditor`)

**Changements spécifiques** :
1. **Honorer `?debug_force_demo` dans la garde interne** : étendre le calcul
   d'autorisation pour inclure une vérification synchrone du paramètre d'URL,
   alignée sur `PlatformEditorRoute` :
   - `isPlatformEditor = Boolean(profilAcces?.is_platform_editor) || Boolean(user?.isDemo) || hasDebugDemo()`.
2. **Éviter la duplication du test d'URL** : extraire le test `?debug_force_demo`
   dans un petit utilitaire partagé (p. ex. `src/utils/debugDemo.js` exportant
   `hasDebugDemo()`), puis l'importer à la fois dans `App.jsx` (qui en possède
   déjà une copie) et dans `EspaceAdminPlateforme.jsx`.
   - Conforme à AGENTS.md (« préférer mettre à jour les utilitaires existants
     plutôt qu'ajouter des implémentations parallèles ») : cela supprime une
     duplication plutôt que d'en créer une troisième.
   - Le helper reste synchrone et défensif (try/catch, garde `typeof window`),
     identique au comportement actuel de `App.jsx`.

**Fichier** : `src/App.jsx`

**Composant** : route `/admin` (montage de `ConsoleAdmin`)

**Changements spécifiques** :
3. **Envelopper la console dans le conteneur de thème clair** : entourer
   `<ConsoleAdmin />` du composant existant `StandalonePage` (déjà importé), à
   l'image des autres pages autonomes :
   - `<StandalonePage maxWidth={1080}><ConsoleAdmin /></StandalonePage>` (largeur
     alignée sur `PlatformAdminScreen` pour accueillir le tableau de la console).
   - Aucune modification de la logique de `ConsoleAdmin` : seul l'habillage change.
4. **(Si extraction du helper)** Remplacer la définition locale de
   `hasDebugDemo()` dans `App.jsx` par l'import depuis `src/utils/debugDemo.js`,
   sans changer son comportement.

## Testing Strategy

### Validation Approach

La stratégie suit une approche en deux temps : d'abord faire émerger des
contre-exemples qui démontrent le bug sur le code NON corrigé, puis vérifier que
la correction fonctionne et préserve le comportement existant. Les tests
unitaires utilisent l'infrastructure existante (Vitest + Testing Library, comme
`EspaceAdminPlateforme.test.jsx`).

### Exploratory Bug Condition Checking

**Goal** : Faire émerger des contre-exemples démontrant le bug AVANT
l'implémentation de la correction. Confirmer ou réfuter l'analyse des causes. En
cas de réfutation, re-hypothétiser.

**Test Plan** : Écrire des tests qui (a) rendent `EspaceAdminPlateforme` avec
`?debug_force_demo` présent mais sans `is_platform_editor`/`isDemo`, et vérifient
l'absence de la carte de refus ; (b) rendent la route `/admin` et vérifient la
présence du conteneur `.standalone-page`. Exécuter ces tests sur le code NON
corrigé pour observer les échecs.

**Test Cases** :
1. **Garde interne démo/debug** : simuler `window.location.search =
   "?debug_force_demo"` et rendre `EspaceAdminPlateforme` sans droits ;
   assert que l'UI d'administration est présente et que le texte
   `platform_admin.permission_denied` est absent (échouera sur code non corrigé).
2. **Conteneur de thème `/admin`** : rendre la route `/admin` (ou
   `ConsoleAdmin` via son montage de route) en contexte admin ; assert la
   présence d'un ancêtre `.standalone-page` (échouera sur code non corrigé).
3. **Edge — `isDemo` déjà positionné** : rendre `EspaceAdminPlateforme` avec
   `user.isDemo = true` ; assert que l'UI s'affiche (devrait passer même sur code
   non corrigé — confirme que la régression visée est bien le premier rendu).

**Expected Counterexamples** :
- Cas 1 : la carte « Permission insuffisante » est rendue alors que
  `?debug_force_demo` est présent.
- Cas 2 : `ConsoleAdmin` est rendu sans ancêtre `.standalone-page`.
- Causes probables : garde interne sans `hasDebugDemo()` ; route `/admin` sans
  `StandalonePage`.

### Fix Checking

**Goal** : Vérifier que pour toutes les entrées où la condition de bug est vraie,
la fonction corrigée produit le comportement attendu.

**Pseudocode:**
```
FOR ALL X WHERE isBugCondition_PlatformAdmin(X) DO
  result := EspaceAdminPlateforme'(X)
  ASSERT result = adminUI AND result != permissionDeniedCard
END FOR

FOR ALL X WHERE isBugCondition_ConsoleAdmin(X) DO
  result := ConsoleAdminRender'(X)
  ASSERT textOn(result) has readable contrast against background(result)
END FOR
```

### Preservation Checking

**Goal** : Vérifier que pour toutes les entrées où la condition de bug est
fausse, la fonction corrigée produit le même résultat que la fonction d'origine.

**Pseudocode:**
```
FOR ALL X WHERE NOT (isBugCondition_PlatformAdmin(X) OR isBugCondition_ConsoleAdmin(X)) DO
  ASSERT F(X) = F'(X)
END FOR
```

**Testing Approach** : Le test basé sur les propriétés est recommandé pour la
vérification de préservation car :
- Il génère automatiquement de nombreux cas de test sur le domaine d'entrée.
- Il capture des cas limites que des tests unitaires manuels pourraient manquer.
- Il fournit de fortes garanties que le comportement est inchangé pour toutes les
  entrées non buguées.

Concrètement, le domaine d'entrée se génère à partir de combinaisons de
`{ is_platform_editor, isDemo, hasDebugDemo, isAdmin, route }`. Pour la garde
interne, on génère des profils/flags aléatoires et on vérifie que, hors
condition de bug, la décision (UI vs refus) est identique entre F et F'.

**Test Plan** : Observer d'abord le comportement sur le code NON corrigé pour les
entrées hors bug, puis écrire des tests (unitaires et basés sur les propriétés)
capturant ce comportement.

**Test Cases** :
1. **Accès éditeur réel préservé** : `is_platform_editor = true` (sans
   debug) ⇒ l'UI d'administration plateforme s'affiche, avant et après correction.
2. **Refus légitime préservé** : ni éditeur, ni `isDemo`, ni `?debug_force_demo`
   ⇒ la carte de refus s'affiche (garde interne) ; la route redirige vers `/app`.
3. **Redirection non-admin préservée** : `/admin` sans rôle admin ni démo/debug
   ⇒ redirection vers la Page_Acces_Restreint, inchangée.
4. **Thème des autres pages préservé** : `/paiement`, garde d'agence suspendue,
   `/admin-plateforme` conservent leur conteneur `.standalone-page` et leur
   contraste.
5. **Logique de la console préservée** : chargement, pagination, sélection de
   preuve, activer/désactiver, valider/rejeter fonctionnent comme avant
   (le wrapper n'affecte pas le comportement).

### Unit Tests

- `EspaceAdminPlateforme` : avec `?debug_force_demo` (sans droits) ⇒ UI affichée,
  pas de carte de refus ; sans aucun droit/flag ⇒ carte de refus toujours
  présente.
- Route `/admin` : `ConsoleAdmin` rendu dans un ancêtre `.standalone-page`.
- `helper hasDebugDemo()` (si extrait) : retourne `true` avec `?debug_force_demo`,
  `false` sinon, robuste sans `window`.

### Property-Based Tests

- Générer des combinaisons aléatoires de `{ is_platform_editor, isDemo,
  hasDebugDemo }` et vérifier que la décision de la garde interne corrigée est
  cohérente avec `PlatformEditorRoute`, et identique à l'originale hors condition
  de bug.
- Générer des états admin variés et vérifier que `ConsoleAdmin` se rend toujours
  dans `.standalone-page` sans changer ses données/actions.

### Integration Tests

- Flux complet `/admin-plateforme?debug_force_demo` : entrée autorisée par la
  route ET UI affichée par la garde interne (plus de carte de refus).
- Flux complet `/admin` en admin : console rendue sur surface claire, en-tête et
  texte lisibles, pagination et actions opérationnelles.
- Bascule entre `/admin-plateforme`, `/admin` et `/paiement` : thèmes corrects et
  cohérents sur chaque page.
