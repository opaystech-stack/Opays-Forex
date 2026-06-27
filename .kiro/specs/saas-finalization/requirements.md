# Requirements Document

## Introduction

Ce document décrit les exigences pour la finalisation SaaS de l'application **OpaysFox** (suivi forex/trésorerie, React + Vite PWA, backend Supabase, interface en français). Six évolutions sont couvertes :

1. Comportement de la page d'accueil (séparation stricte entre l'espace public marketing et l'espace applicatif authentifié).
2. Gestion multi-devises complète, avec règle stricte : toutes les devises prises en charge sont toujours sélectionnables.
3. Suivi des dettes (créances et dettes : « Ce qu'on te doit » / « Ce que tu dois ») avec un bouton dédié.
4. Corrections d'affichage et de contraste des boutons (accessibilité WCAG, tous états).
5. Stabilité et adaptation mobile (absence de décalage de mise en page, barre de navigation inférieure fixe).
6. Suivi des gains (gain journalier et gain mensuel, basés sur `profit_usd`).

Toutes les exigences respectent l'architecture existante : `AppContext` pour l'état global, `src/pages` pour les pages, `src/components` pour les composants, `src/sections` pour la page marketing, `src/i18n.js` pour les traductions, et `src/utils/finance.js` pour la logique financière (avec tests dans `src/utils/finance.test.js`). La compatibilité avec React / Vite / Vercel / Supabase est maintenue.

## Glossary

- **OpaysFox_App** : L'application complète, incluant l'espace public marketing et l'espace applicatif authentifié.
- **Espace_Public** : Les pages publiques marketing accessibles sans authentification : page d'accueil (`/`, composée des sections Hero, Features, Pricing, CTA, Footer), connexion (`/login`) et inscription (`/register`).
- **Espace_Applicatif** : L'ensemble des écrans protégés sous `/app/*` (dashboard, transactions, portefeuilles, dépenses, prêts, paramètres, dettes, gains).
- **Garde_Publique** : Le garde de route `PublicOnlyRoute` qui contrôle l'accès aux pages de l'Espace_Public.
- **Garde_Privée** : Le garde de route `PrivateRoute` qui contrôle l'accès à l'Espace_Applicatif.
- **Utilisateur_Authentifié** : Un utilisateur disposant d'une session active (incluant le mode démo `isDemo`).
- **Utilisateur_Anonyme** : Un visiteur sans session active.
- **Registre_Devises** : La liste centralisée des devises prises en charge par l'application.
- **Devise_Supportée** : Une devise figurant dans le Registre_Devises : USD, UGX, KES, TZS, BIF, CDF, FCFA, EUR (et RWF déjà présent dans un sélecteur existant).
- **Sélecteur_Devises** : Tout composant d'interface permettant de choisir une devise (création de portefeuille, transactions, dépenses, prêts, dettes, taux de change).
- **Taux_De_Change** : Les enregistrements `exchange_rates` contenant `rate_to_usd` par devise, utilisés pour les conversions.
- **Module_Conversion** : La logique de conversion de `src/utils/finance.js` (`convertToUSD`).
- **Registre_Dettes** : La nouvelle fonctionnalité de suivi des créances et dettes, distincte des prêts (`loans`).
- **Dette** : Un enregistrement du Registre_Dettes, de type « créance » (`receivable`, ce qu'on te doit) ou « dette » (`payable`, ce que tu dois).
- **Bouton_Dettes** : Le bouton dédié déclenchant l'accès au Registre_Dettes.
- **Bouton_Paramètres** : Le bouton `settings-fab` existant dans l'en-tête de l'Espace_Applicatif.
- **Navigation_Mobile** : La barre de navigation principale (`mobile-navbar`) affichée en bas de l'écran sur mobile.
- **Composant_Bouton** : Tout élément interactif stylé en bouton dans l'application (classes `btn`, `navbar-tab`, `toggle-button`, `draft-btn`, `settings-fab`, etc.).
- **Module_Gains** : Le module affichant le gain journalier et le gain mensuel.
- **Gain_Journalier** : La somme des `profit_usd` des transactions complétées dont l'horodatage correspond à la journée en cours.
- **Gain_Mensuel** : La somme des `profit_usd` des transactions complétées dont l'horodatage correspond au mois sélectionné (mois en cours par défaut).
- **Ratio_Contraste** : Le rapport de contraste entre la couleur du texte et la couleur de fond, mesuré selon WCAG 2.1.

## Requirements

### Requirement 1: Isolation de l'espace public après authentification

**User Story:** En tant qu'utilisateur authentifié, je veux rester dans l'espace applicatif et ne pas pouvoir revenir sur la page marketing ou les pages d'authentification, afin de bénéficier d'une expérience SaaS cohérente.

#### Acceptance Criteria

1. WHEN un Utilisateur_Authentifié navigue vers la route `/`, THE Garde_Publique SHALL rediriger l'utilisateur vers `/app`.
2. WHEN un Utilisateur_Authentifié navigue vers la route `/login`, THE Garde_Publique SHALL rediriger l'utilisateur vers `/app`.
3. WHEN un Utilisateur_Authentifié navigue vers la route `/register`, THE Garde_Publique SHALL rediriger l'utilisateur vers `/app`.
4. WHEN un Utilisateur_Authentifié saisit directement une URL de l'Espace_Public dans le navigateur, THE Garde_Publique SHALL rediriger l'utilisateur vers `/app` sans afficher le contenu de l'Espace_Public.
5. WHEN un Utilisateur_Authentifié utilise le bouton « précédent » du navigateur pour atteindre une route de l'Espace_Public, THE Garde_Publique SHALL rediriger l'utilisateur vers `/app`.
6. WHEN un Utilisateur_Anonyme navigue vers une route de l'Espace_Applicatif (`/app/*`), THE Garde_Privée SHALL rediriger l'utilisateur vers `/login`.
7. IF la session d'un Utilisateur_Authentifié devient invalide ou rencontre une erreur d'authentification pendant l'accès à l'Espace_Applicatif, THEN THE Garde_Privée SHALL rediriger l'utilisateur vers `/login`.
8. WHILE la session d'authentification est en cours de vérification, THE OpaysFox_App SHALL afficher l'écran de chargement sans exposer le contenu de l'Espace_Public ni de l'Espace_Applicatif.
9. WHEN un Utilisateur_Anonyme navigue vers une route inconnue, THE OpaysFox_App SHALL rediriger l'utilisateur vers la page d'accueil `/`.

### Requirement 2: Registre centralisé des devises supportées

**User Story:** En tant qu'utilisateur, je veux que toutes les devises prises en charge soient disponibles de façon cohérente dans toute l'application, afin de gérer mes opérations dans n'importe quelle devise supportée.

#### Acceptance Criteria

1. THE Registre_Devises SHALL inclure les Devises_Supportées suivantes : USD, EUR, UGX, KES, TZS, BIF, CDF, FCFA.
2. THE OpaysFox_App SHALL afficher pour chaque Devise_Supportée un libellé identifiant la devise (par exemple « Shilling kényan (KES) », « Franc burundais (BIF) », « Franc congolais (CDF) », « Franc CFA (FCFA) ») quelle que soit la langue d'interface active.
3. WHERE une Devise_Supportée est ajoutée au Registre_Devises, THE OpaysFox_App SHALL la rendre disponible dans tous les Sélecteurs_Devises sans modification individuelle de chaque écran.
4. WHEN l'application affiche un libellé pour la devise FCFA, THE OpaysFox_App SHALL préciser la zone monétaire applicable (BCEAO / BEAC) dans le libellé ou la description associée.
5. THE OpaysFox_App SHALL fournir les libellés des Devises_Supportées via `src/i18n.js` en français et en anglais.

### Requirement 3: Disponibilité permanente des devises dans les sélecteurs

**User Story:** En tant qu'utilisateur, je veux pouvoir sélectionner n'importe quelle devise supportée dans tous les sélecteurs, afin de ne jamais être bloqué lors de la création d'un portefeuille, d'une transaction, d'une dépense, d'un prêt ou d'une dette.

#### Acceptance Criteria

1. THE Sélecteur_Devises SHALL présenter la totalité des Devises_Supportées du Registre_Devises.
2. WHEN un utilisateur ouvre un Sélecteur_Devises, THE OpaysFox_App SHALL rendre chaque Devise_Supportée sélectionnable.
3. THE OpaysFox_App SHALL maintenir chaque Devise_Supportée sélectionnable indépendamment de la présence d'un Taux_De_Change pour cette devise.
4. IF un Taux_De_Change est absent pour une Devise_Supportée sélectionnée, THEN THE OpaysFox_App SHALL afficher un message indiquant que le taux est manquant tout en conservant la sélection de la devise.
5. IF la sélection d'une Devise_Supportée ne peut être maintenue suite à une erreur, THEN THE OpaysFox_App SHALL permettre à l'utilisateur de poursuivre en choisissant une autre Devise_Supportée.
6. THE OpaysFox_App SHALL présenter les Devises_Supportées dans un ordre identique dans tous les Sélecteurs_Devises.

### Requirement 4: Conversion multi-devises

**User Story:** En tant qu'utilisateur, je veux que les montants en devises locales soient convertis en USD pour la consolidation, afin de connaître la valeur globale de mon patrimoine.

#### Acceptance Criteria

1. WHEN un montant est exprimé en USD, THE Module_Conversion SHALL retourner le montant inchangé.
2. WHEN un montant est exprimé dans une Devise_Supportée autre que USD et qu'un Taux_De_Change correspondant existe, THE Module_Conversion SHALL retourner le montant divisé par le `rate_to_usd` de cette devise.
3. IF aucun Taux_De_Change n'existe pour la devise d'un montant à convertir, THEN THE Module_Conversion SHALL retourner la valeur 0.
4. IF le `rate_to_usd` d'une devise vaut 0, THEN THE Module_Conversion SHALL retourner la valeur 0.
5. THE Module_Conversion SHALL conserver son comportement testé dans `src/utils/finance.test.js` et inclure des cas de test couvrant les Devises_Supportées ajoutées.

### Requirement 5: Enregistrement des dettes et créances

**User Story:** En tant qu'utilisateur, je veux enregistrer ce qu'on me doit et ce que je dois, afin de suivre mes créances et mes dettes en dehors des prêts formels.

#### Acceptance Criteria

1. THE Registre_Dettes SHALL permettre l'enregistrement d'une Dette de type créance (« Ce qu'on te doit »).
2. THE Registre_Dettes SHALL permettre l'enregistrement d'une Dette de type dette (« Ce que tu dois »).
3. WHEN un utilisateur enregistre une Dette, THE Registre_Dettes SHALL exiger un montant, une Devise_Supportée et le type de Dette (créance ou dette).
4. WHERE un utilisateur fournit le nom d'une contrepartie et une note pour une Dette, THE Registre_Dettes SHALL enregistrer ces informations avec la Dette.
5. THE Registre_Dettes SHALL afficher séparément le total des créances et le total des dettes.
6. WHEN un utilisateur marque une Dette comme réglée, THE Registre_Dettes SHALL mettre immédiatement à jour le statut de la Dette en « réglée » sans étape de validation supplémentaire.
7. THE Registre_Dettes SHALL constituer un grand livre de créances et dettes distinct des prêts (`loans`), ces derniers conservant leur logique d'intérêts et de débit/crédit de portefeuille existante.
8. WHERE le backend Supabase est configuré, THE Registre_Dettes SHALL persister les Dettes via Supabase, et WHERE l'application fonctionne en mode démo, THE Registre_Dettes SHALL persister les Dettes en stockage local cohérent avec le mécanisme `isUsingMock` existant.
9. WHILE l'application s'exécute en mode production, THE OpaysFox_App SHALL exiger que le backend Supabase soit configuré et SHALL empêcher le démarrage en l'absence de configuration Supabase.

### Requirement 6: Bouton d'accès dédié au suivi des dettes

**User Story:** En tant qu'utilisateur mobile, je veux un bouton dédié facilement accessible pour ouvrir le suivi des dettes, afin d'y accéder rapidement depuis l'en-tête.

#### Acceptance Criteria

1. THE OpaysFox_App SHALL afficher un Bouton_Dettes dédié donnant accès au Registre_Dettes.
2. WHILE l'application est affichée sur un écran mobile, THE OpaysFox_App SHALL positionner le Bouton_Dettes en haut à droite, adjacent au Bouton_Paramètres.
3. WHEN un utilisateur active le Bouton_Dettes, THE OpaysFox_App SHALL afficher le Registre_Dettes.
4. THE Bouton_Dettes SHALL comporter un libellé accessible en français décrivant sa fonction (par exemple via `aria-label`).

### Requirement 7: Contraste et lisibilité des boutons (accessibilité)

**User Story:** En tant qu'utilisateur, je veux que le texte de tous les boutons soit lisible dans tous leurs états, afin de comprendre les actions disponibles sans effort.

#### Acceptance Criteria

1. WHILE un Composant_Bouton est dans l'état actif, THE OpaysFox_App SHALL afficher le texte du bouton avec un Ratio_Contraste d'au moins 4,5:1 par rapport à son fond.
2. WHILE un Composant_Bouton est dans l'état inactif ou désactivé, THE OpaysFox_App SHALL afficher le texte du bouton avec un Ratio_Contraste d'au moins 4,5:1 par rapport à son fond.
3. THE OpaysFox_App SHALL appliquer une apparence visuelle cohérente aux Composants_Bouton de même variante à travers tous les écrans.
4. THE OpaysFox_App SHALL toujours distinguer visuellement l'état désactivé d'un Composant_Bouton de son état actif, tout en respectant le Ratio_Contraste minimal du texte dans chaque état.

### Requirement 8: Stabilité de la mise en page sur mobile

**User Story:** En tant qu'utilisateur mobile, je veux une interface stable qui ne se décale pas, afin de naviguer et saisir des données confortablement.

#### Acceptance Criteria

1. WHILE l'utilisateur fait défiler une page sur mobile, THE Navigation_Mobile SHALL rester fixée au bas de l'écran.
2. WHEN le clavier virtuel s'ouvre lors de la saisie dans un champ, THE OpaysFox_App SHALL conserver la disposition des éléments principaux sans décalage horizontal de la mise en page.
3. WHILE l'utilisateur fait défiler une page sur mobile, THE OpaysFox_App SHALL éviter tout redimensionnement ou tremblement (« jitter ») des conteneurs principaux.
4. THE OpaysFox_App SHALL empêcher le défilement horizontal involontaire de la page sur mobile.
5. THE OpaysFox_App SHALL réserver, indépendamment de la position effective de la Navigation_Mobile, l'espace destiné à la Navigation_Mobile afin que le contenu de la page ne soit pas masqué par celle-ci.

### Requirement 9: Suivi des gains journaliers et mensuels

**User Story:** En tant qu'utilisateur, je veux visualiser mon gain du jour et mon gain du mois, afin de suivre la rentabilité de mon activité.

#### Acceptance Criteria

1. THE Module_Gains SHALL afficher le Gain_Journalier.
2. THE Module_Gains SHALL afficher le Gain_Mensuel.
3. WHEN le Module_Gains calcule le Gain_Journalier, THE Module_Gains SHALL additionner les valeurs `profit_usd` (y compris les valeurs négatives représentant des pertes) des transactions complétées dont l'horodatage correspond à la journée en cours.
4. WHEN le Module_Gains calcule le Gain_Mensuel, THE Module_Gains SHALL additionner les valeurs `profit_usd` (y compris les valeurs négatives représentant des pertes) des transactions complétées dont l'horodatage correspond au mois sélectionné.
5. WHERE aucun mois n'est explicitement sélectionné, THE Module_Gains SHALL utiliser le mois en cours pour le Gain_Mensuel.
6. IF aucune transaction complétée ne correspond à la période, THEN THE Module_Gains SHALL afficher un gain de 0.
7. THE OpaysFox_App SHALL rendre le Module_Gains accessible depuis l'Espace_Applicatif (tableau de bord ou onglet dédié).
8. THE Module_Gains SHALL exclure les transactions au statut `draft` du calcul des gains.

### Requirement 10: Conformité architecturale et compatibilité

**User Story:** En tant que mainteneur, je veux que les nouvelles fonctionnalités respectent l'architecture existante, afin de préserver la maintenabilité et la compatibilité du SaaS.

#### Acceptance Criteria

1. THE OpaysFox_App SHALL gérer l'état des nouvelles fonctionnalités via `AppContext`.
2. THE OpaysFox_App SHALL placer les nouvelles pages dans `src/pages` et les nouveaux composants dans `src/components`.
3. THE OpaysFox_App SHALL fournir les libellés de l'interface des nouvelles fonctionnalités via `src/i18n.js` en français et en anglais.
4. THE OpaysFox_App SHALL placer la logique financière des gains et des conversions dans `src/utils/finance.js` et SHALL fournir les tests correspondants dans `src/utils/finance.test.js`.
5. THE OpaysFox_App SHALL rester compatible avec la chaîne React / Vite / Vercel / Supabase existante.
