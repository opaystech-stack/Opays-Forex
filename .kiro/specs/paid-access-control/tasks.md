# Implementation Plan: Paid Access Control

## Overview

Cette implémentation ajoute un contrôle d'accès par activation manuelle à l'application OpaysFox (React + Vite + Supabase). L'approche suit la décision d'architecture clé de la conception : **la sécurité repose sur la base (RLS + Storage policies)**, le *gating* React n'étant qu'une commodité UX. On construit d'abord les migrations SQL (tables, trigger, fonctions, RLS, Storage), puis la logique pure testable (`src/utils/*`), puis l'i18n, puis l'extension de `AppContext.jsx`, les pages et enfin le câblage des gardes de route. Chaque module pur est validé par des tests de propriété `fast-check` (≥ 100 itérations) avant le branchement UI.

Langage d'implémentation : **JavaScript (React + Vite)**, conformément à la conception qui s'ancre dans le code existant.

## Tasks

- [x] 1. Mettre en place le schéma de base de données et la sécurité Supabase
  - [x] 1.1 Créer les tables, fonctions et trigger d'auto-création
    - Créer le fichier de migration `supabase/migrations/0001_paid_access_control.sql`
    - Définir la table `access_profiles` (user_id PK, `acces_autorise` DEFAULT FALSE, `role` CHECK ('user','admin') DEFAULT 'user', `created_at`/`activated_at` TIMESTAMPTZ UTC, `activated_by`, contrainte `activation_traceability`)
    - Définir la table `payment_proofs` (id, user_id, `mode_paiement` CHECK, `reference`, `recu_path` NOT NULL, `statut` CHECK DEFAULT 'en_attente', `submitted_at`, `reviewed_at`, `reviewed_by`) + index `idx_payment_proofs_submitted`
    - Définir les fonctions `SECURITY DEFINER` `public.is_admin(uuid)` et `public.has_access(uuid)`
    - Définir la fonction `public.handle_new_user()` et le trigger `on_auth_user_created` (INSERT idempotent `ON CONFLICT DO NOTHING`)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.8, 1.9, 5.1, 5.6, 5.8_

  - [x] 1.2 Ajouter les politiques RLS sur `access_profiles` et `payment_proofs`
    - Activer RLS sur les deux tables
    - `access_profiles` : `ap_select_own`, `ap_select_admin`, `ap_update_admin` (aucune politique UPDATE pour `user`)
    - `payment_proofs` : `pp_select_own`, `pp_insert_own`, `pp_select_admin`, `pp_update_admin`
    - _Requirements: 1.6, 1.7, 5.10, 6.10_

  - [x] 1.3 Configurer le bucket Storage privé `receipts` et ses politiques
    - Créer le bucket privé `receipts` (aucune URL publique)
    - Politique `recus_user_rw` (accès limité au dossier `{user_id}/...`)
    - Politique `recus_admin_read` (lecture de tous les reçus par un admin)
    - _Requirements: 7.1, 7.2, 7.4, 7.5, 7.6_

  - [x] 1.4 Renforcer la RLS des tables de trésorerie existantes
    - Remplacer les politiques existantes de `wallets`, `exchange_rates`, `transactions`, `expenses`, `debts`, `customers`, `loans`, `message_templates`, `reminder_history` par des politiques exigeant `public.has_access(auth.uid())` en USING et WITH CHECK
    - _Requirements: 2.6, 2.7, 2.8_

- [x] 2. Implémenter la logique pure de contrôle d'accès — `src/utils/accessControl.js`
  - [x] 2.1 Implémenter les fonctions d'évaluation d'accès
    - `evaluateAccess({ status, profile })`, `isAccessGranted(profile)`, `isAdmin(profile)`, `isLoadTimedOut(elapsedMs, capMs = 10000)`, `validateProfile(profile)`
    - Règle centrale : toute incertitude ⇒ accès refusé
    - _Requirements: 1.4, 1.5, 1.8, 1.9, 2.1, 2.2, 2.3, 2.4, 6.9_

  - [ ]* 2.2 Écrire le test de propriété pour `evaluateAccess`
    - **Property 1: Évaluation d'accès complète et sûre par défaut**
    - Fichier `src/utils/accessControl.property.test.js`, fast-check ≥ 100 itérations
    - **Validates: Requirements 1.9, 2.1, 2.2, 2.3, 2.4**

  - [ ]* 2.3 Écrire le test de propriété pour `isLoadTimedOut`
    - **Property 2: Détection du dépassement de délai de chargement**
    - **Validates: Requirements 2.4**

  - [ ]* 2.4 Écrire le test de propriété pour `isAdmin`
    - **Property 3: Reconnaissance du rôle administrateur**
    - **Validates: Requirements 1.4, 6.9**

  - [ ]* 2.5 Écrire le test de propriété pour `validateProfile`
    - **Property 4: Invariant de traçabilité d'activation (validation)**
    - **Validates: Requirements 1.5, 1.8**

- [x] 3. Implémenter la logique pure de preuve de paiement — `src/utils/paymentProof.js`
  - [x] 3.1 Implémenter la validation et la construction d'enregistrement de preuve
    - Constantes `ACCEPTED_MIME`, `ACCEPTED_MODES`, `MAX_RECEIPT_BYTES`
    - `validateProofSubmission({ mode, file })` (ordre déterministe : mode → reçu présent → format → taille), `buildReceiptPath(userId, fileName)`, `buildProofRecord({ userId, mode, reference, recuPath })`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.8, 7.2, 7.3_

  - [ ]* 3.2 Écrire le test de propriété pour `validateProofSubmission`
    - **Property 5: Validation de la soumission de preuve**
    - Fichier `src/utils/paymentProof.property.test.js`, fast-check ≥ 100 itérations
    - **Validates: Requirements 5.1, 5.3, 5.4, 5.5, 5.6, 7.3**

  - [ ]* 3.3 Écrire le test de propriété pour `buildReceiptPath`
    - **Property 6: Chemin de reçu confiné au dossier de l'utilisateur**
    - **Validates: Requirements 5.2, 7.2**

  - [ ]* 3.4 Écrire le test de propriété pour `buildProofRecord`
    - **Property 7: Enregistrement de preuve complet**
    - **Validates: Requirements 5.8**

- [x] 4. Implémenter la logique pure des actions admin — `src/utils/adminActions.js`
  - [x] 4.1 Implémenter les patchs et le tri/pagination admin
    - `buildActivationPatch(actif, adminId)`, `buildReviewPatch(statut, adminId)`, `buildAdminPage(entries, page, pageSize = 50)`, `latestProofStatus(proofs)`
    - _Requirements: 3.4, 3.5, 6.1, 6.2, 6.4, 6.5, 6.6, 6.7_

  - [ ]* 4.2 Écrire le test de propriété pour `buildActivationPatch`
    - **Property 8: Patch d'activation/désactivation tracé**
    - Fichier `src/utils/adminActions.property.test.js`, fast-check ≥ 100 itérations
    - **Validates: Requirements 6.4, 6.5**

  - [ ]* 4.3 Écrire le test de propriété pour `buildReviewPatch`
    - **Property 9: Patch de revue de preuve tracé**
    - **Validates: Requirements 6.6, 6.7**

  - [ ]* 4.4 Écrire le test de propriété pour `buildAdminPage`
    - **Property 10: Tri et pagination de la Console_Admin**
    - **Validates: Requirements 6.1, 6.2**

  - [ ]* 4.5 Écrire le test de propriété pour `latestProofStatus`
    - **Property 11: Statut de preuve le plus récent**
    - **Validates: Requirements 3.4, 3.5**

- [x] 5. Implémenter la logique pure de configuration de paiement — `src/utils/paymentConfig.js`
  - [x] 5.1 Implémenter le filtrage des moyens de paiement configurés
    - `getConfiguredMethods(rawConfig)` (filtre les moyens vides, calcule `anyConfigured`), `isCopyable(address)`
    - Lecture des variables `VITE_PAY_*` (BTC, Lightning, USDT + réseau, Mobile Money en JSON)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.9, 4.10_

  - [ ]* 5.2 Écrire le test de propriété pour `getConfiguredMethods`
    - **Property 12: Filtrage des moyens de paiement configurés**
    - Fichier `src/utils/paymentConfig.property.test.js`, fast-check ≥ 100 itérations
    - **Validates: Requirements 4.9, 4.10**

- [x] 6. Ajouter les clés d'internationalisation — `src/i18n.js`
  - [x] 6.1 Ajouter les sections `access`, `payment`, `admin` dans `fr` et `en`
    - Couvrir les textes de Page_Acces_Restreint, Page_Paiement (procédure ≤ 5 étapes, confirmations/erreurs de copie) et Console_Admin
    - _Requirements: 3.8, 4.11_

  - [ ]* 6.2 Écrire le test de propriété de parité fr/en
    - **Property 13: Parité des clés de traduction fr/en**
    - Fichier `src/i18n.property.test.js`, fast-check ≥ 100 itérations
    - **Validates: Requirements 3.8, 4.11**

- [x] 7. Checkpoint - Vérifier la logique pure et les migrations
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Étendre le contexte global — `src/context/AppContext.jsx`
  - [x] 8.1 Ajouter le chargement du Profil_Accès
    - Nouveaux états `profilAcces`, `profileStatus` ('loading'|'ready'|'error')
    - `loadProfile()` appelé quand `authChecked && user && !user.isDemo`, avec garde de délai 10 s via `Promise.race`
    - Mode démo : `profileStatus='ready'`, `profilAcces={ acces_autorise:true, role:'user' }`, aucun appel réseau
    - Exposer `profilAcces`, `profileStatus`, `loadProfile`, `isAccessGranted`, `isAdmin` via le contexte
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 1.9_

  - [x] 8.2 Ajouter `submitPaymentProof`
    - Valider via `validateProofSubmission` → téléverser dans Storage (`buildReceiptPath`) → insérer la preuve (`buildProofRecord`) ; upload d'abord, insert ensuite
    - En cas d'échec d'upload : aucun insert, message d'erreur ; confirmation de réception < 5 s en cas de succès
    - Exposer `submitPaymentProof` via le contexte
    - _Requirements: 5.1, 5.2, 5.7, 5.8, 5.9_

  - [ ]* 8.3 Écrire les tests unitaires de `submitPaymentProof` et du mode démo
    - Mocks `storage.upload` succès/échec ⇒ présence/absence d'insert ; vérifier accès local en mode démo sans appel réseau
    - _Requirements: 5.7, 5.9, 2.1_

- [x] 9. Implémenter les pages
  - [x] 9.1 Créer `src/pages/AccesRestreint.jsx`
    - Message d'accès restreint (R3.1), bouton unique vers `/paiement` (R3.2, R3.3)
    - Affichage du Statut_Preuve le plus récent via `latestProofStatus` ou « aucune preuve » (R3.4, R3.5)
    - Action de déconnexion (`logOut` + redirection `/login`) (R3.6, R3.7) ; tout le texte via `useT()` (R3.8)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [x] 9.2 Créer `src/pages/Paiement.jsx`
    - Afficher les Coordonnées_Paiement configurées via `getConfiguredMethods` ; masquer les moyens non configurés (R4.9), message si aucun (R4.10)
    - Boutons de copie par adresse crypto, confirmation 2–5 s, repli « copier manuellement » à l'échec (R4.5, R4.6, R4.7)
    - Procédure ≤ 5 étapes (R4.8) ; formulaire de preuve (mode, référence optionnelle, fichier) avec validation cliente puis `submitPaymentProof` ; i18n + repli langue par défaut (R4.11)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 5.3, 5.4, 5.5, 5.6_

  - [x] 9.3 Créer `src/pages/ConsoleAdmin.jsx`
    - Liste paginée (50/page) triée par preuve la plus récente via `buildAdminPage`, colonnes e-mail/`acces_autorise`/dernier statut (R6.1), état vide (R6.2)
    - Détail d'une preuve + aperçu via URL signée `createSignedUrl(path, 300)` (R6.3, R6.11), reçu indisponible (R6.12)
    - Actions activer/désactiver (`buildActivationPatch`) et valider/rejeter (`buildReviewPatch`) avec conservation d'état à l'échec (R6.4–R6.8)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.11, 6.12_

- [x] 10. Câbler les gardes de route — `src/App.jsx`
  - [x] 10.1 Brancher `AccessGate`, `AdminRoute` et les routes `/paiement` et `/admin`
    - `AccessGate` consommant `profileStatus`/`profilAcces` : `loading` ⇒ `LoadingScreen`, non autorisé/erreur ⇒ `AccesRestreint`, autorisé ⇒ `AppShell`
    - `AdminRoute` : authentifié + `isAdmin` sinon `AccesRestreint` (R6.9) ; conserver `PrivateRoute` pour la redirection des non-authentifiés (R2.5)
    - Ajouter les routes `/paiement` (Paiement) et `/admin` (ConsoleAdmin)
    - _Requirements: 2.1, 2.2, 2.5, 6.9_

  - [ ]* 10.2 Écrire les tests d'intégration de gating et de navigation
    - Non authentifié ⇒ `/login` ; non autorisé ⇒ AccesRestreint ; `user` sur `/admin` ⇒ AccesRestreint ; déconnexion ⇒ `logOut` + `/login`
    - _Requirements: 2.2, 2.5, 3.7, 6.9_

- [x] 11. Gérer le refus RLS des données de trésorerie côté front — `src/context/AppContext.jsx`
  - [x] 11.1 Intercepter les erreurs RLS dans `fetchData` et les mutations
    - Détecter les erreurs PostgREST (401/403/`42501`) ⇒ afficher un message de restriction d'accès, ne modifier aucune donnée locale (R2.8) ; basculer vers Page_Acces_Restreint si l'accès a été révoqué (R2.6)
    - _Requirements: 2.6, 2.7, 2.8_

  - [ ]* 11.2 Écrire les tests d'exemple de refus RLS
    - Simuler un refus RLS ⇒ message de restriction, aucune mutation d'état local
    - _Requirements: 2.7, 2.8_

- [x] 12. Checkpoint final - Vérifier l'intégration complète
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Les tâches marquées `*` sont optionnelles (tests) et peuvent être ignorées pour un MVP rapide.
- Chaque tâche référence des exigences précises pour la traçabilité.
- Les tests de propriété (fast-check, ≥ 100 itérations) valident la logique pure universelle (Propriétés 1 à 13).
- Les comportements RLS, Storage, le rendu UI et la navigation sont couverts par des tests d'exemple/intégration/smoke.
- La sécurité réelle repose sur la RLS PostgreSQL et les politiques Storage ; le *gating* React est une commodité UX.
- Le mode démo (sans Supabase) accorde l'accès localement sans appel réseau et ne doit pas régresser.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1", "4.1", "5.1", "6.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "2.2", "3.2", "4.2", "5.2", "6.2", "8.1"] },
    { "id": 2, "tasks": ["2.3", "3.3", "4.3", "8.2"] },
    { "id": 3, "tasks": ["2.4", "3.4", "4.4", "9.1", "9.2", "9.3"] },
    { "id": 4, "tasks": ["2.5", "4.5", "10.1", "11.1"] },
    { "id": 5, "tasks": ["10.2", "11.2"] }
  ]
}
```
