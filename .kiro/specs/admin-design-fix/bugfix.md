# Bugfix Requirements Document

## Introduction

Les espaces d'administration de l'application présentent deux défauts visuels et
fonctionnels qui les rendent inutilisables :

1. **`/admin-plateforme` ("Espace administration plateforme")** affiche la carte
   de blocage « Permission insuffisante : réservé à l'éditeur de la plateforme »
   alors même que l'accès est ouvert via `?debug_force_demo` (mode démo/debug).
   La garde au niveau de la route (`PlatformEditorRoute`) autorise pourtant
   l'entrée, mais la garde interne du composant `EspaceAdminPlateforme` ne
   reconnaît pas le paramètre `?debug_force_demo`, ce qui bloque l'interface.

2. **`/admin` ("Console d'administration")** rend du texte sombre sur le fond
   bleu nuit (`--deep-navy`) du `body` : l'en-tête « Console d'administration » et
   le texte courant (« Chargement des données… ») ont un contraste insuffisant et
   sont quasi illisibles. La page `ConsoleAdmin` est montée directement sur le
   `body` sombre sans le conteneur de thème clair (`.standalone-page`) utilisé par
   les autres pages autonomes telles que `/admin-plateforme`.

Le présent document décrit le comportement défectueux actuel, le comportement
attendu, et le comportement existant qui doit être préservé (anti-régression).
Le contexte technique et les détails d'implémentation seront traités dans le
document de design.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN un utilisateur ouvre `/admin-plateforme` avec le paramètre `?debug_force_demo` THEN le composant `EspaceAdminPlateforme` affiche la carte « Permission insuffisante : réservé à l'éditeur de la plateforme » et masque l'interface d'administration, bien que la garde de route ait autorisé l'accès.

1.2 WHEN un utilisateur ouvre `/admin` ("Console d'administration") THEN le système rend du texte sombre (`--text-primary`/`--text-secondary`) sur le fond bleu nuit (`--deep-navy`) du `body`, produisant un contraste insuffisant qui rend l'en-tête et le contenu illisibles.

### Expected Behavior (Correct)

2.1 WHEN un utilisateur ouvre `/admin-plateforme` avec le paramètre `?debug_force_demo` THEN le système SHALL afficher l'interface de l'Espace_Administration_Plateforme, de manière cohérente avec la garde de route, sans présenter la carte de permission refusée.

2.2 WHEN un utilisateur ouvre `/admin` ("Console d'administration") THEN le système SHALL rendre la console sur une surface de thème clair de sorte que l'en-tête et tout le texte respectent un contraste lisible.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN un Editeur_Plateforme réel (`is_platform_editor`) ou un utilisateur en mode démo (`isDemo`) ouvre `/admin-plateforme` THEN le système SHALL CONTINUE TO afficher l'interface d'administration plateforme.

3.2 WHEN un utilisateur sans droit d'éditeur de plateforme et sans mode démo/debug accède à `/admin-plateforme` THEN le système SHALL CONTINUE TO refuser l'accès (redirection de route ou carte de permission refusée).

3.3 WHEN un utilisateur non administrateur et sans mode démo/debug accède à `/admin` THEN le système SHALL CONTINUE TO être redirigé vers la Page_Acces_Restreint.

3.4 WHEN les pages autonomes existantes en thème clair (`/admin-plateforme`, `/paiement`, etc.) sont rendues THEN le système SHALL CONTINUE TO afficher leur thème et leur contraste corrects.

3.5 WHEN la Console_Admin charge et affiche les profils, preuves, la pagination et les actions (activer/désactiver, valider/rejeter) THEN le système SHALL CONTINUE TO fonctionner comme avant, seul l'habillage/contraste étant corrigé.

## Bug Condition Derivation

### Bug Condition — `/admin-plateforme` (accès bloqué en démo/debug)

```pascal
FUNCTION isBugCondition_PlatformAdmin(X)
  INPUT: X = { route, hasDebugDemo, profilAcces, user }
  OUTPUT: boolean

  // L'accès est censé être ouvert (route ?debug_force_demo) mais la garde
  // interne du composant ne reconnaît pas ce paramètre.
  RETURN X.route = "/admin-plateforme"
     AND X.hasDebugDemo = true
     AND NOT (X.profilAcces.is_platform_editor OR X.user.isDemo)
END FUNCTION
```

```pascal
// Property: Fix Checking — la garde interne honore ?debug_force_demo
FOR ALL X WHERE isBugCondition_PlatformAdmin(X) DO
  result ← EspaceAdminPlateforme'(X)
  ASSERT result = adminUI AND result ≠ permissionDeniedCard
END FOR
```

### Bug Condition — `/admin` (contraste illisible)

```pascal
FUNCTION isBugCondition_ConsoleAdmin(X)
  INPUT: X = { route, container }
  OUTPUT: boolean

  // La console est montée sur le body bleu nuit sans conteneur de thème clair,
  // alors que ses textes utilisent des couleurs de thème clair (sombres).
  RETURN X.route = "/admin"
     AND X.container ≠ lightThemeStandaloneContainer
END FUNCTION
```

```pascal
// Property: Fix Checking — contraste lisible sur surface claire
FOR ALL X WHERE isBugCondition_ConsoleAdmin(X) DO
  result ← ConsoleAdminRender'(X)
  ASSERT textOn(result) has readable contrast against background(result)
END FOR
```

### Preservation Goal

```pascal
// Property: Preservation Checking
FOR ALL X WHERE NOT (isBugCondition_PlatformAdmin(X) OR isBugCondition_ConsoleAdmin(X)) DO
  ASSERT F(X) = F'(X)
END FOR
```

Pour toute entrée hors condition de bug (utilisateurs légitimes, refus d'accès
légitime, autres pages), le code corrigé se comporte de manière identique au code
d'origine.
