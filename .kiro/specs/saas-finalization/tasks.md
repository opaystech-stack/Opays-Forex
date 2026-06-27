# Implementation Plan: Finalisation SaaS OpaysFox

## Overview

Cette feuille de route convertit la conception en étapes de code incrémentales pour une PWA React 19 + Vite 8 (JS/JSX), backend Supabase. Chaque étape s'appuie sur les précédentes et se termine par le câblage dans l'application. Les 15 propriétés de correction (P1–P15) du design sont chacune mappées sur exactement un test de propriété (fast-check, ≥ 100 itérations, commentaire de traçabilité `// Feature: saas-finalization, Property {n}: {texte}`). Les gardes, l'UI et le bloc Gains sont couverts par `@testing-library/react`. Langage d'implémentation : JavaScript / JSX (conforme au design).

## Tasks

- [ ] 1. Mettre en place l'outillage de test et de build
  - [ ] 1.1 Ajouter les dépendances et la configuration de test
    - Ajouter `fast-check` et `@testing-library/react` (+ `@testing-library/jest-dom` si nécessaire) en `devDependencies` de `package.json`
    - Configurer Vitest pour l'environnement `jsdom` dans `vite.config.js` (bloc `test: { environment: 'jsdom', globals: true }`) afin de permettre les tests de rendu React
    - Vérifier que `npm test` (`vitest run`) démarre sans casser `src/utils/finance.test.js`
    - _Requirements: 10.4, 10.5_

- [ ] 2. Créer le registre centralisé des devises
  - [ ] 2.1 Implémenter `src/utils/currencies.js`
    - Définir `SUPPORTED_CURRENCIES` (ordre stable : USD, EUR, UGX, KES, TZS, BIF, CDF, FCFA) avec `{ code, labelKey }`
    - Exporter `SUPPORTED_CURRENCY_CODES`, `isSupportedCurrency(code)` et `hasRate(code, rates)` (USD ⇒ vrai ; sinon `rate_to_usd` présent et ≠ 0)
    - _Requirements: 2.1, 2.3, 3.1, 3.6, 4.3, 4.4_
  - [ ]* 2.2 Écrire le test de propriété pour `hasRate`
    - Fichier `src/utils/hasRate.property.test.js`
    - **Property 3: Détection cohérente d'un taux manquant sans perte de sélection**
    - **Validates: Requirements 3.3, 3.4**

- [ ] 3. Étendre les libellés i18n (fr/en)
  - [ ] 3.1 Ajouter les sections de libellés dans `src/i18n.js`
    - `currency.*` pour les 8 devises (FCFA précisant la zone « BCEAO / BEAC »), distincts des clés de taux de `Settings`
    - `debts.*` (titre, types « Ce qu'on te doit » / « Ce que tu dois », champs, totaux, action « Marquer réglée », messages de validation)
    - `gains.*` (« Gain du jour » / « Gain du mois »), `currency_warning.missing_rate`, `nav.debts`, `nav.gains`
    - _Requirements: 2.2, 2.4, 2.5, 10.3_
  - [ ]* 3.2 Écrire le test de propriété pour les libellés de devises
    - Fichier `src/utils/currencyLabels.property.test.js`
    - **Property 2: Chaque devise supportée possède un libellé dans les deux langues**
    - **Validates: Requirements 2.2, 2.5**
  - [ ]* 3.3 Écrire les tests d'exemple du registre et du libellé FCFA
    - Fichier `src/utils/currencyRegistry.test.js` : le registre contient exactement les 8 codes attendus ; le libellé FCFA (fr et en) contient « BCEAO » et « BEAC »
    - _Requirements: 2.1, 2.4_

- [ ] 4. Étendre la logique financière (`src/utils/finance.js`)
  - [ ] 4.1 Implémenter `sumDailyProfit` et `sumMonthlyProfit`
    - Sommer `profit_usd` des transactions `status === 'completed'` du jour / du mois (mois courant par défaut)
    - Exclure les `draft`, inclure les valeurs négatives, neutraliser les valeurs non numériques via `Number(...) || 0`, retourner 0 si aucune correspondance
    - Conserver `convertToUSD` et `calculateLoanRepaymentUSD` inchangés
    - _Requirements: 9.3, 9.4, 9.5, 9.6, 9.8, 10.4_
  - [ ]* 4.2 Écrire le test de propriété du gain journalier
    - Fichier `src/utils/dailyProfit.property.test.js`
    - **Property 12: Gain journalier = somme des profits complétés du jour**
    - **Validates: Requirements 9.3, 9.6**
  - [ ]* 4.3 Écrire le test de propriété du gain mensuel
    - Fichier `src/utils/monthlyProfit.property.test.js`
    - **Property 13: Gain mensuel = somme des profits complétés du mois**
    - **Validates: Requirements 9.4, 9.5, 9.6**
  - [ ]* 4.4 Écrire le test de propriété métamorphique des brouillons
    - Fichier `src/utils/draftsProfit.property.test.js`
    - **Property 14: Les brouillons n'influencent jamais les gains**
    - **Validates: Requirements 9.8**
  - [ ]* 4.5 Écrire le test de propriété d'identité USD de la conversion
    - Fichier `src/utils/convertUsdIdentity.property.test.js`
    - **Property 4: Identité de conversion pour l'USD**
    - **Validates: Requirements 4.1**
  - [ ]* 4.6 Écrire le test de propriété de conversion par division
    - Fichier `src/utils/convertRate.property.test.js`
    - **Property 5: Conversion par division pour une devise avec taux**
    - **Validates: Requirements 4.2**
  - [ ]* 4.7 Écrire le test de propriété de conversion sûre sans taux
    - Fichier `src/utils/convertNoRate.property.test.js`
    - **Property 6: Conversion sûre en l'absence de taux exploitable**
    - **Validates: Requirements 4.3, 4.4**
  - [ ]* 4.8 Étendre les tests d'exemple existants de conversion
    - Conserver les tests verts de `src/utils/finance.test.js` et ajouter des cas couvrant les devises ajoutées (EUR, TZS, BIF, CDF, FCFA)
    - _Requirements: 4.5_

- [ ] 5. Créer le sélecteur de devises réutilisable et l'intégrer
  - [ ] 5.1 Implémenter `src/components/CurrencySelect.jsx`
    - Props `value, onChange, rates, name, id, ariaLabel` ; liste toutes les devises du registre dans l'ordre, aucune option `disabled`
    - Afficher l'avertissement non bloquant `currency_warning.missing_rate` quand `rates` fourni et `hasRate(value, rates) === false`, en conservant la sélection
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6_
  - [ ] 5.2 Remplacer les listes `<option>` codées en dur par `CurrencySelect`
    - Intégrer `CurrencySelect` dans `src/pages/Wallets.jsx` (création de caisse) et tout autre sélecteur de devises ; retirer `RWF` au profit du registre (R2.1)
    - _Requirements: 2.3, 3.1, 3.5_
  - [ ]* 5.3 Écrire le test de propriété du sélecteur
    - Fichier `src/components/CurrencySelect.property.test.jsx`
    - **Property 1: Le sélecteur de devises dérive intégralement du registre**
    - **Validates: Requirements 2.3, 3.1, 3.2, 3.3, 3.6**

- [ ] 6. Étendre `AppContext` pour le Registre des dettes
  - [ ] 6.1 Implémenter l'état et les méthodes des dettes
    - Ajouter `debts` state, `MOCK_DEBTS`, `createDebt` (validation type/montant>0/devise, statut initial `pending`), `updateDebtStatus(id, 'settled')` (renseigne `settled_at`, idempotent), `getDebtTotals()` (totaux séparés créances/dettes + USD via `convertToUSD`)
    - Charger `debts` dans `fetchData` (clé `forex_debts` / `MOCK_DEBTS` en mock, sinon `supabase.from('debts')`) et réinitialiser dans `resetMockData` ; aucun effet sur les soldes de portefeuilles
    - Ajouter l'état `configError` exposé pour le garde de démarrage
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 10.1_
  - [ ]* 6.2 Écrire le test de propriété du round-trip de création
    - Fichier `src/context/debtRoundtrip.property.test.js`
    - **Property 7: Round-trip de création d'une dette**
    - **Validates: Requirements 5.1, 5.2, 5.4**
  - [ ]* 6.3 Écrire le test de propriété de validation des champs obligatoires
    - Fichier `src/context/debtValidation.property.test.js`
    - **Property 8: Validation des champs obligatoires d'une dette**
    - **Validates: Requirements 5.3**
  - [ ]* 6.4 Écrire le test de propriété de séparation des totaux
    - Fichier `src/context/debtTotals.property.test.js`
    - **Property 9: Séparation des totaux créances / dettes**
    - **Validates: Requirements 5.5**
  - [ ]* 6.5 Écrire le test de propriété de règlement immédiat et idempotent
    - Fichier `src/context/debtSettle.property.test.js`
    - **Property 10: Règlement immédiat et idempotent d'une dette**
    - **Validates: Requirements 5.6**
  - [ ]* 6.6 Écrire le test de propriété d'isolation des soldes de portefeuilles
    - Fichier `src/context/debtWalletIsolation.property.test.js`
    - **Property 11: Le registre des dettes n'affecte pas les soldes des portefeuilles**
    - **Validates: Requirements 5.7**
  - [ ]* 6.7 Écrire le test d'exemple de persistance mock
    - Fichier `src/context/debtPersistence.test.js` : en mode démo, `createDebt` persiste dans `localStorage` (`forex_debts`)
    - _Requirements: 5.8_

- [ ] 7. Créer la page du Registre des dettes
  - [ ] 7.1 Implémenter `src/pages/Debts.jsx`
    - Formulaire de création (type, montant, devise via `CurrencySelect`, contrepartie et note optionnelles ; type/montant/devise obligatoires)
    - Affichage séparé du total des créances et du total des dettes via `getDebtTotals()`
    - Liste des dettes avec action « Marquer réglée » appelant `updateDebtStatus(id, 'settled')` immédiatement, libellés via i18n
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 10.2_

- [ ] 8. Câbler la navigation, le bouton dédié et le garde de démarrage (`src/App.jsx`)
  - [ ] 8.1 Ajouter le `Bouton_Dettes` et le rendu de l'onglet
    - Ajouter le bouton `debts-fab` dans l'en-tête de `AppShell`, adjacent à `settings-fab`, avec `aria-label` français, `onClick` ⇒ `setActiveTab('debts')`
    - Gérer le cas `'debts'` dans `renderActiveTab()` ⇒ `<Debts />`
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [ ] 8.2 Ajouter le garde de démarrage production-sans-Supabase
    - En `import.meta.env.PROD` et `hasCredentials === false`, afficher un écran d'erreur de configuration bloquant avant `BrowserRouter`, sans exposer l'espace public ni applicatif ; repli mock autorisé en développement
    - _Requirements: 5.9_
  - [ ]* 8.3 Écrire le test du bouton dettes
    - Fichier `src/App.debtsFab.test.jsx` : présence du bouton avec `aria-label` français adjacent à `settings-fab` ; clic ⇒ rend `Debts`
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [ ]* 8.4 Écrire le test du garde de démarrage
    - Fichier `src/App.bootGuard.test.jsx` : en `PROD` sans credentials, l'écran de configuration s'affiche et masque les deux espaces
    - _Requirements: 5.9_
  - [ ]* 8.5 Écrire les tests des gardes de route
    - Fichier `src/App.guards.test.jsx` : authentifié sur `/`, `/login`, `/register` ⇒ `/app` ; anonyme sur `/app/*` ⇒ `/login` ; `loading` ⇒ `LoadingScreen` ; route inconnue ⇒ `/`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_

- [ ] 9. Ajouter le bloc Gains au tableau de bord
  - [ ] 9.1 Implémenter le bloc Gains dans `src/pages/Dashboard.jsx`
    - Afficher le gain du jour (`sumDailyProfit`) et le gain du mois (`sumMonthlyProfit`), en réusinant le calcul de profit du jour existant sur `sumDailyProfit`
    - _Requirements: 9.1, 9.2, 9.7_
  - [ ]* 9.2 Écrire le test de rendu du bloc Gains
    - Fichier `src/pages/Dashboard.gains.test.jsx` : les deux valeurs (jour, mois) sont rendues dans le `Dashboard`
    - _Requirements: 9.1, 9.2, 9.7_

- [ ] 10. Réintroduire la couche de styles applicatifs et l'accessibilité
  - [ ] 10.1 Définir les styles applicatifs et la palette de boutons
    - Dans `src/index.css` : `.btn`, `.navbar-tab`, `.settings-fab`, `.debts-fab`, `.mobile-navbar` (`position: fixed; bottom: 0`), `.page-content` (`padding-bottom` réservant la hauteur de la barre, R8.5), `overflow-x: hidden` sur la racine, unités stables (`100dvh`/`min-height`)
    - Exporter la palette texte/fond par variante et état (actif, désactivé) dans `src/styles/buttonPalette.js` (source de vérité consommée par les variables CSS), avec ratios ≥ 4,5:1 et états distincts visuellement
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 8.4, 8.5_
  - [ ]* 10.2 Écrire le test de propriété de contraste des boutons
    - Fichier `src/styles/buttonContrast.property.test.js`
    - **Property 15: Contraste accessible du texte des boutons dans tous les états**
    - **Validates: Requirements 7.1, 7.2**
  - [ ]* 10.3 Écrire les tests d'exemple de mise en page et de distinction d'état
    - Fichier `src/styles/layout.test.js` : assertions CSS (`.mobile-navbar` `position: fixed; bottom: 0`, `.page-content` `padding-bottom`, `overflow-x: hidden`) et couleurs actif ≠ désactivé
    - _Requirements: 7.3, 7.4, 8.1, 8.4, 8.5_

- [ ] 11. Étendre le schéma Supabase
  - [ ] 11.1 Ajouter la table `debts` dans `supabase_schema.sql`
    - Table `debts` (type, counterparty_name, amount, currency VARCHAR(5), note, status, created_at, settled_at) avec contraintes CHECK et RLS, sans trigger de solde
    - _Requirements: 5.7, 5.8, 10.5_

- [ ] 12. Checkpoint final — garantir la verdeur de la chaîne
  - Ensure all tests pass, ask the user if questions arise.
  - Vérifier `npm run build`, `npm run lint`, `npm test` (les tests existants de `finance.test.js` restent verts)
  - _Requirements: 4.5, 10.5_

## Notes

- Les tâches marquées `*` sont optionnelles (tests) et peuvent être ignorées pour un MVP plus rapide ; les tâches d'implémentation principales ne le sont jamais.
- Chaque test de propriété référence exactement une propriété du design et porte le commentaire de traçabilité `// Feature: saas-finalization, Property {n}: {texte}` avec `numRuns: 100` minimum.
- Chaque propriété (P1–P15) est mappée sur exactement un test de propriété ; les gardes (R1), la persistance (R5.8), le démarrage (R5.9), le bouton (R6), la mise en page (R8) sont couverts par des tests d'exemple / d'intégration.
- Les checkpoints garantissent une validation incrémentale ; chaque tâche référence des exigences précises pour la traçabilité.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1", "4.1", "10.1", "11.1"] },
    { "id": 1, "tasks": ["2.2", "3.2", "3.3", "4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "4.8", "5.1", "6.1", "9.1", "10.2", "10.3"] },
    { "id": 2, "tasks": ["5.2", "5.3", "6.2", "6.3", "6.4", "6.5", "6.6", "6.7", "7.1", "8.2", "9.2"] },
    { "id": 3, "tasks": ["8.1", "8.4"] },
    { "id": 4, "tasks": ["8.3", "8.5"] }
  ]
}
```
