# Requirements Document

## Introduction

Cette spécification regroupe un ensemble d'améliorations transverses pour l'application SaaS Opays Forex (PWA React + Vite, backend Supabase, déploiement Vercel). Les améliorations couvrent six domaines : le comportement de la page d'accueil pour les utilisateurs authentifiés, l'élargissement de la gestion multidevises, l'ajout d'un module de suivi des dettes (créances et dettes), des corrections d'accessibilité sur le contraste des boutons, la stabilité de l'affichage mobile, et un module de suivi des gains (profits) journaliers et mensuels.

Toutes les exigences respectent l'architecture existante : navigation par onglets dans `AppShell` (src/App.jsx), état global via `AppContext` (src/context/AppContext.jsx), repli sur des données fictives (mock-data) lorsque Supabase n'est pas configuré, et logique financière centralisée dans `src/utils/finance.js`. Aucune exigence n'impose de changement d'architecture ; les capacités sont ajoutées en réutilisant les structures existantes.

## Glossary

- **Application** : la PWA Opays Forex côté client (React + Vite).
- **Page_Marketing** : la page publique servie sur la route `/` (composant `Home`), destinée aux visiteurs non authentifiés.
- **Espace_Application** : l'interface authentifiée servie sous la route `/app/*` (composant `AppShell`) incluant tableau de bord, transactions, portefeuilles, dépenses, prêts et paramètres.
- **Utilisateur_Authentifié** : un utilisateur disposant d'une session active (`user` non nul dans `AppContext`), incluant l'utilisateur de démonstration (`isDemo`).
- **Visiteur** : un utilisateur sans session active.
- **Garde_Route_Publique** : le composant `PublicOnlyRoute` de src/App.jsx qui redirige les utilisateurs authentifiés hors des pages publiques.
- **Garde_Route_Privee** : le composant `PrivateRoute` de src/App.jsx qui redirige les visiteurs vers `/login`.
- **Gestionnaire_Devises** : la couche logique gérant la liste des devises supportées et leur usage dans l'affichage, les calculs et les sélections.
- **Devise_Supportee** : une devise figurant dans la liste de référence de l'Application (USD, EUR, KES, TZS, BIF, CDF, UGX, FCFA, etc.).
- **Module_Dettes** : la nouvelle fonctionnalité de suivi des créances (argent dû à l'utilisateur) et des dettes (argent que l'utilisateur doit).
- **Creance** : une somme qu'un tiers doit à l'utilisateur (receivable).
- **Dette** : une somme que l'utilisateur doit à un tiers (payable).
- **Bouton_Dettes** : le point d'entrée dédié ouvrant le Module_Dettes.
- **Bouton_Parametres** : le bouton/icône des paramètres existant (`settings-fab`) affiché en haut à droite de l'en-tête sur mobile.
- **Navigation_Inferieure** : la barre de navigation par onglets (`mobile-navbar`) affichée en bas de l'écran sur mobile.
- **Module_Gains** : le module affichant les indicateurs de gains (profits) journaliers et mensuels.
- **Gain_Journalier** : la somme des profits (`profit_usd`) des transactions complétées d'une journée donnée.
- **Gain_Mensuel** : la somme des profits des transactions complétées d'un mois donné.
- **WCAG_AA** : le niveau AA des Web Content Accessibility Guidelines, exigeant un ratio de contraste minimal de 4,5:1 pour le texte normal et de 3:1 pour le texte de grande taille.
- **Decalage_Mise_En_Page** : tout déplacement, redimensionnement ou tremblement involontaire des éléments visibles (layout shift).

## Requirements

### Requirement 1: Comportement de la page d'accueil pour utilisateurs authentifiés

**User Story:** En tant qu'utilisateur authentifié, je veux rester dans l'espace applicatif sans pouvoir revenir sur la page marketing, afin de bénéficier d'une expérience SaaS continue et sans confusion.

#### Acceptance Criteria

1. WHEN un Utilisateur_Authentifié accède à la route `/`, THE Garde_Route_Publique SHALL rediriger l'Utilisateur_Authentifié vers la route `/app`.
2. WHEN un Utilisateur_Authentifié accède à l'une des routes publiques `/login` ou `/register`, THE Garde_Route_Publique SHALL rediriger l'Utilisateur_Authentifié vers la route `/app`.
3. WHILE un Utilisateur_Authentifié dispose d'une session active, THE Application SHALL servir uniquement l'Espace_Application et SHALL empêcher l'affichage de la Page_Marketing.
4. WHEN un Visiteur accède à la route `/`, THE Application SHALL afficher la Page_Marketing.
5. WHEN un Utilisateur_Authentifié accède à une route inconnue, THE Application SHALL rediriger l'Utilisateur_Authentifié vers l'Espace_Application.
6. WHILE la session est en cours de vérification, THE Application SHALL afficher l'écran de chargement avant toute redirection.

### Requirement 2: Gestion multidevises étendue

**User Story:** En tant qu'opérateur de change, je veux gérer un ensemble complet de devises régionales et internationales, afin de saisir mes portefeuilles, transactions et taux dans les devises réellement utilisées.

#### Acceptance Criteria

1. THE Gestionnaire_Devises SHALL inclure comme Devise_Supportee au minimum : le dollar américain (USD), l'euro (EUR), le shilling kényan (KES), le shilling tanzanien (TZS), le franc burundais (BIF), le franc congolais (CDF), le shilling ougandais (UGX) et le franc CFA (FCFA).
2. WHEN un utilisateur crée un portefeuille, THE Application SHALL proposer la sélection parmi l'ensemble des Devise_Supportee.
3. WHEN un utilisateur saisit une transaction, THE Application SHALL permettre la sélection des montants source et destination parmi des portefeuilles libellés dans n'importe quelle Devise_Supportee.
4. WHEN un utilisateur gère les taux de change, THE Application SHALL permettre la saisie d'un taux vers l'USD pour chaque Devise_Supportee distincte de l'USD.
5. WHEN un montant est affiché dans une Devise_Supportee, THE Application SHALL afficher le code ou symbole de la devise associé au montant.
6. WHEN une conversion vers l'USD est demandée pour une Devise_Supportee, THE Gestionnaire_Devises SHALL utiliser le taux correspondant fourni par la couche de taux via `src/utils/finance.js`.
7. IF une Devise_Supportee ne possède aucun taux de change défini, THEN THE Application SHALL signaler l'absence de taux pour cette devise lors d'une opération de conversion.
8. THE Gestionnaire_Devises SHALL définir le franc CFA (FCFA) comme une seule entrée correspondant à la variante BCEAO/XOF (Afrique de l'Ouest). *(Hypothèse par défaut, alignée sur la donnée mock existante « Orange Money Cameroun (FCFA) » ; à confirmer lors de la conception si la variante BEAC/XAF d'Afrique centrale doit être distinguée.)*

### Requirement 3: Module de suivi des dettes (créances et dettes)

**User Story:** En tant qu'utilisateur, je veux suivre l'argent que l'on me doit et l'argent que je dois, afin d'avoir une vue claire de mes créances et dettes.

#### Acceptance Criteria

1. THE Application SHALL fournir un Module_Dettes permettant d'enregistrer des Creance et des Dette distinctes.
2. WHEN un utilisateur enregistre une Creance, THE Module_Dettes SHALL conserver le montant, la Devise_Supportee, la contrepartie et l'échéance associés.
3. WHEN un utilisateur enregistre une Dette, THE Module_Dettes SHALL conserver le montant, la Devise_Supportee, la contrepartie et l'échéance associés.
4. THE Module_Dettes SHALL afficher séparément le total des Creance et le total des Dette.
5. THE Application SHALL fournir un Bouton_Dettes dédié comme point d'entrée du Module_Dettes.
6. WHERE l'Application est affichée sur mobile, THE Application SHALL positionner le Bouton_Dettes dans l'en-tête en haut à droite, immédiatement à côté du Bouton_Parametres.
7. WHEN un utilisateur active le Bouton_Dettes, THE Application SHALL ouvrir le Module_Dettes.
8. THE Module_Dettes SHALL être distinct de la fonctionnalité « Prêts » (Loans) existante et SHALL réutiliser les structures de données et la logique financière existantes lorsque cela est pertinent. *(Hypothèse par défaut : le Module_Dettes est une fonctionnalité séparée des Prêts ; la relation précise — extension de Loans ou entité distincte — sera arrêtée en phase de conception.)*

### Requirement 4: Contraste et cohérence visuelle des boutons

**User Story:** En tant qu'utilisateur, je veux que le texte des boutons soit toujours lisible, afin d'utiliser l'application confortablement quel que soit l'état du bouton.

#### Acceptance Criteria

1. THE Application SHALL afficher le texte de chaque bouton à l'état actif avec un ratio de contraste conforme au niveau WCAG_AA par rapport à son arrière-plan.
2. THE Application SHALL afficher le texte de chaque bouton à l'état inactif ou désactivé avec un ratio de contraste conforme au niveau WCAG_AA par rapport à son arrière-plan.
3. THE Application SHALL appliquer un style de boutons cohérent à travers l'ensemble des pages de l'Espace_Application.
4. WHEN un bouton passe de l'état inactif à l'état actif, THE Application SHALL conserver un texte lisible conforme au niveau WCAG_AA dans les deux états.

### Requirement 5: Stabilité de l'affichage mobile

**User Story:** En tant qu'utilisateur mobile, je veux une interface stable qui ne saute pas et une barre de navigation toujours visible, afin de naviguer sans gêne.

#### Acceptance Criteria

1. WHILE l'Application est affichée sur mobile, THE Application SHALL maintenir la Navigation_Inferieure en position fixe en bas de l'écran indépendamment de la position de défilement.
2. WHEN l'utilisateur fait défiler le contenu sur mobile, THE Application SHALL maintenir les éléments d'interface sans Decalage_Mise_En_Page involontaire.
3. WHEN le clavier virtuel s'ouvre sur mobile, THE Application SHALL maintenir la mise en page sans Decalage_Mise_En_Page involontaire des éléments visibles hors de la zone de saisie.
4. THE Application SHALL conserver des dimensions de conteneur stables lors des changements d'onglet de l'Espace_Application.

### Requirement 6: Suivi des gains (profits) journaliers et mensuels

**User Story:** En tant qu'opérateur, je veux visualiser mes gains du jour et du mois, afin de suivre rapidement ma rentabilité.

#### Acceptance Criteria

1. THE Application SHALL fournir un Module_Gains affichant le Gain_Journalier et le Gain_Mensuel.
2. WHEN le Module_Gains est affiché, THE Module_Gains SHALL calculer le Gain_Journalier comme la somme des profits des transactions complétées de la journée courante.
3. WHEN le Module_Gains est affiché, THE Module_Gains SHALL calculer le Gain_Mensuel comme la somme des profits des transactions complétées du mois sélectionné.
4. WHERE aucun mois n'est explicitement sélectionné, THE Module_Gains SHALL utiliser le mois courant pour le Gain_Mensuel.
5. THE Application SHALL rendre le Module_Gains accessible depuis le tableau de bord ou via un onglet dédié.
6. THE Module_Gains SHALL calculer les gains via la logique financière centralisée dans `src/utils/finance.js`.
7. IF aucune transaction complétée n'existe pour la période considérée, THEN THE Module_Gains SHALL afficher une valeur de gain égale à zéro pour cette période.

### Requirement 7: Compatibilité avec l'architecture existante

**User Story:** En tant que mainteneur, je veux que ces améliorations respectent l'architecture actuelle, afin de garder un code propre et maintenable.

#### Acceptance Criteria

1. THE Application SHALL conserver la compatibilité avec la pile existante React, Vite, Vercel et Supabase.
2. THE Application SHALL centraliser toute nouvelle logique financière ou métier dans `src/utils/finance.js` conformément aux règles du fichier AGENTS.md.
3. WHERE Supabase n'est pas configuré, THE Application SHALL conserver le repli sur les données fictives (mock-data) pour les nouvelles fonctionnalités.
4. THE Application SHALL réutiliser les structures existantes (navigation par onglets `AppShell`, état global `AppContext`) plutôt que d'introduire des implémentations parallèles.
5. WHEN la logique de `src/utils/finance.js` est modifiée, THE Application SHALL maintenir à jour les tests correspondants dans `src/utils/finance.test.js`.
