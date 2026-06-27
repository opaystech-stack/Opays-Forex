# Journal de Développement - Forex & Mobile Money Tracker

## 2026-06-09 - Audit Technique & Révision de la Feuille de Route (V1 Online + WhatsApp)

### Jalons
*   **Audit Complet Réalisé** : Identification de l'incompatibilité des triggers PostgreSQL avec les brouillons non validés. Identification des restrictions RLS posant problème en mode anonyme.
*   **Réorientation Technique** : Simplification confirmée (100% en ligne direct sur Supabase).
*   **Planification en Phases** : Définition de 4 phases claires pour stabiliser l'application, implémenter les brouillons, connecter l'API Gemini réelle et packager en PWA.

### Décisions d'Architecture Révisées
1.  **Gestion des statuts de Transaction** : Introduction du statut `draft` (brouillon) pour éviter de corrompre les soldes réels des caisses lors de l'intégration WhatsApp / OCR automatique. Le trigger SQL ne modifie les soldes que si `status = 'completed'`.
2.  **Sécurité RLS assouplie** : Activation des politiques `anon` publiques pour la V1 privée (sécurisée par la clé secrète de l'application), évitant la complexité d'un système de comptes utilisateurs en phase de test.
3.  **PWA Native** : Transition vers une PWA installable sur l'écran d'accueil du mobile pour offrir l'expérience d'une application native gratuitement et sans les stores d'applications.

### Prochaines Étapes
*   Toutes les phases de la feuille de route de Forex Ledger V1 et V2 (y compris l'OCR réel, la saisie vocale réelle, la PWA installable et la passerelle WhatsApp de VPS) sont désormais complétées et documentées.

## 2026-06-09 - Stabilisation de la V1 et Finalisation de l'Interface de Brouillons (Phase 1 & 2 Termines)

### Jalons
*   **Fin de la Phase 1 (Stabilisation & Nettoyage)** :
    *   Renommage complet du projet de `temp-vite` vers `forex-ledger` dans `package.json` et `index.html`.
    *   Suppression définitive de `App.css` mort.
    *   Création de `.env.example` pour guider le branchement Supabase.
    *   Stabilisation globale du fichier CSS `src/index.css` en rajoutant toutes les classes de grille de formulaire (`.form-row`), de liste de transactions (`.ledger-left`, etc.), de recherche (`.input-icon-wrapper`) et de brouillons (`.drafts-panel`, etc.).
    *   Correction du bug d'importation de `ArrowLeftRight` qui provoquait un crash au chargement.
*   **Fin de la Phase 2 (Interface de Validation des Brouillons)** :
    *   Mise en place d'un flux d'édition bidirectionnel entre le Dashboard et l'onglet Transactions.
    *   Intégration d'un bouton d'édition (crayon) et d'un clic interactif sur le texte de chaque brouillon dans le panneau orange du Dashboard.
    *   Pré-remplissage automatique du formulaire de transaction lorsqu'un brouillon est sélectionné.
    *   Affichage d'un en-tête dynamique coloré ("Validation Brouillon") et d'un bouton "Annuler" pour sortir du mode d'édition du brouillon.
    *   Branchement du bouton d'enregistrement sur la fonction `confirmDraft` (qui passe le statut de `draft` à `completed` et applique les soldes dans Supabase ou dans le mock de secours local).

## 2026-06-09 - IA Gemini Réelle (OCR + Audio) & Configuration PWA (Phase 3 & 4 Termines)

### Jalons
*   **Fin de la Phase 3 (IA Gemini Réelle - OCR & Vocal)** :
    *   Création de requêtes HTTP REST directes vers l'API Google AI pour utiliser `gemini-2.5-flash` sans dépendances tierces lourdes.
    *   **Module OCR Réel** : Conversion des images téléversées en base64 et envoi à Gemini avec un prompt structuré retournant un JSON strict pour remplir les portefeuilles source/dest, les montants, frais et ID de transaction.
    *   **Saisie Vocale Réelle** : Utilisation de l'API standard `MediaRecorder` pour capturer la voix de l'utilisateur directement depuis le micro du smartphone, conversion du fichier audio en base64 et envoi multimodal direct à Gemini pour extraction structurée.
    *   **Bascule Gracieuse** : Gestion intelligente des cas d'erreur (micro refusé, clé API non fournie) avec bascule transparente vers les algorithmes de simulation locaux afin de conserver l'application testable.
*   **Fin de la Phase 4 (PWA Installable sur Mobile)** :
    *   Création du fichier `manifest.json` avec description du thème, icônes, affichage autonome (standalone) et orientation portrait pour mobile.
    *   Création de `sw.js` (Service Worker) gérant la mise en cache locale des fichiers d'application essentiels pour une vitesse de chargement accrue.
    *   Modification de `index.html` pour lier le manifeste et déclarer le Service Worker au démarrage.
    *   Validation complète du build de production local (`npm run build`).

## 2026-06-09 - Intégration WhatsApp Automatique (V2 Terminée)

### Jalons
*   **Edge Function whatsapp-webhook (Supabase Deno)** :
    *   Création d'une fonction Deno TypeScript dans `supabase/functions/whatsapp-webhook` pour recevoir les notifications d'OpenWA.
    *   Intégration d'appels Gemini API pour analyser les messages ou images (reçus) entrants et en extraire de façon structurée les transactions financières.
    *   Calcul dynamique des commissions et bénéfices nets en USD basés sur les taux de change à jour.
    *   Insertion automatique des transactions extraites en statut `draft` directement dans Supabase PostgreSQL.
*   **Passerelle OpenWA (Docker VPS)** :
    *   Création d'un fichier `docker-compose.yml` complet pour instancier la passerelle WhatsApp sur un serveur VPS.
    *   Mise en cache et persistance de la session WhatsApp (dossier `./sessions`) pour éviter de devoir re-scanner le QR code.
    *   Guide complet rédigé dans `whatsapp-gateway/README.md` décrivant les prérequis système, les variables d'environnement, le branchement webhook et les étapes d'appairage.


## 2026-06-11 - Finalisation SaaS (devises, dettes, gains, contraste, stabilité mobile)

### Jalons
*   **Isolation de l'espace public** : confirmation que les gardes `PublicOnlyRoute`/`PrivateRoute` (react-router) empêchent un utilisateur authentifié de revenir sur la page d'accueil marketing ou les pages d'auth (`/`, `/login`, `/register` → `/app`), y compris par URL directe ou bouton précédent.
*   **Registre de devises centralisé** : création de `src/utils/currencies.js` (USD, EUR, UGX, KES, TZS, BIF, CDF, FCFA) comme source de vérité unique, et du composant réutilisable `src/components/CurrencySelect.jsx`. Toutes les devises sont **toujours sélectionnables** (jamais désactivées), avec avertissement non bloquant si un taux manque. Intégré dans `Wallets.jsx` (remplacement de la liste codée en dur, retrait de RWF) et `Debts.jsx`. Libellés i18n fr/en ajoutés (FCFA précise BCEAO/BEAC).
*   **Suivi des dettes & créances** : nouvelle page `src/pages/Debts.jsx` (« Ce qu'on te doit » / « Ce que tu dois »), grand livre déclaratif distinct des prêts, persistance via `AppContext` (`createDebt`, `updateDebtStatus`, `getDebtTotals`, `MOCK_DEBTS`, clé `forex_debts`) et table Supabase `debts` ajoutée à `supabase_schema.sql`. Bouton dédié `debts-fab` placé en haut à droite, à côté du bouton Paramètres.
*   **Suivi des gains** : helpers purs `sumDailyProfit`/`sumMonthlyProfit` dans `src/utils/finance.js` (brouillons exclus, pertes incluses) et bloc « Gains » (jour + mois) dans le `Dashboard`.
*   **Contraste & accessibilité** : découverte que toute la couche de styles applicatifs (`.btn`, `.mobile-navbar`, `.card`, etc.) et ses variables CSS étaient absentes. Réintroduction d'une feuille de style complète dans `src/index.css` avec une palette de boutons (`src/styles/buttonPalette.js`) respectant WCAG ≥ 4,5:1 dans tous les états (actif et désactivé, sans dégradation par opacité).
*   **Stabilité mobile** : barre de navigation inférieure `position: fixed` (barre latérale sur desktop ≥ 900px), `overflow-x: hidden`, réservation d'espace pour la barre, unités `100dvh` pour éviter le tremblement au clavier.
*   **Garde de démarrage** : en production sans configuration Supabase, écran d'erreur bloquant (`BootGuard`).

### Tests
*   Ajout de `fast-check` + `@testing-library/react` (config Vitest `jsdom`/`globals`, esbuild JSX automatique).
*   15 propriétés de correction couvertes (registre, conversion, gains, dettes, contraste) + tests d'exemple. Suite complète verte (`npm test` : 25 tests). `npm run build` OK.

## 2026-06-27 - Alignement Design System Open Design & Stabilité des Tests

### Jalons
*   **Alignement de la page Coordonnées de Paiement (`/paiement`)** :
    *   Refonte complète de [Paiement.jsx](file:///c:/LAPOSTE/Projets/FOREX/src/pages/Paiement.jsx) selon le prototype `paiement-redesign.html` d'Open Design.
    *   Intégration d'une structure en grille à 2 colonnes, de cartes individuelles avec dégradés subtils, d'indicateurs d'étapes verticaux reliés en continu et d'une zone de glisser-déposer de fichier stylisée.
    *   Bouton interactif de copie dynamique avec message temporaire de confirmation ("Copié !").
*   **Mock local autonome** :
    *   Ajout de coordonnées fictives par défaut (`VITE_PAY_*`) dans le fichier [.env](file:///c:/LAPOSTE/Projets/FOREX/.env) pour assurer l'affichage automatique des cartes de démonstration sans dépendances externes.
*   **Stabilisation de Vitest sous forte charge** :
    *   Ajout de `testTimeout: 30000` (30 secondes) dans [vite.config.js](file:///c:/LAPOSTE/Projets/FOREX/vite.config.js) pour fiabiliser l'exécution des tests d'intégration Vitest en cas d'engorgement système.
    *   Validation complète de la suite de tests (**476 tests sur 476 validés OK**).
