# Implementation Plan: Agency Operations Expansion

## Overview

Ce plan implémente l'extension OpaysFox vers les fondations d'une plateforme SaaS multi-agences, en **étendant** le code existant (React + Vite, Supabase) sans le dupliquer. L'approche est incrémentale :

1. Poser la base de données multi-tenant (migration `0003`, RLS, fonctions `SECURITY DEFINER`, index, backfill) avant toute UI.
2. Construire la **logique pure testable** (`src/utils/`) module par module, chaque propriété de correction (P1–P36) devenant un test de propriété `fast-check`.
3. Étendre les services à effets de bord (`AppContext.jsx`, `whatsappClient.js`, `reminderService.js`) et les Edge Functions.
4. Brancher l'UI (pages et gardes) sur la logique et le contexte, écran par écran.
5. Câbler l'ensemble et vérifier l'isolation/cycle de vie par tests d'intégration RLS.

Langage d'implémentation : **JavaScript (React + Vite)**, tests `vitest` + `@testing-library` + `fast-check` (`numRuns: 100`, tag `// Feature: agency-operations-expansion, Property {n}: ...`).

## Tasks

- [x] 1. Migration de base de données multi-tenant et RLS (`supabase/migrations/0003_agency_operations_expansion.sql`)
  - [x] 1.1 Créer les tables plateforme et multi-tenant
    - Écrire la migration idempotente (`IF NOT EXISTS` / `OR REPLACE`) créant `plans`, `agencies` (avec `owner_id`, `state`, `plan_id`), `points_of_sale`, `registers`, `whatsapp_numbers`
    - Ajouter `is_platform_editor` à `access_profiles` sans supprimer les colonnes existantes
    - Créer `agency_members` et `agency_invitations` avec contraintes `CHECK` de rôle/état et index unique partiel `uniq_pending_invite_email`
    - _Requirements: 3.1, 3.3, 3.5, 5.7, 1.6, 2.1, 18.2_

  - [x] 1.2 Créer les tables de modules, catalogues, services additionnels, WhatsApp et agents
    - Créer `module_entitlements`, `module_states`, `transfer_methods`, `subscription_providers`
    - Créer `transfers`, `subscriptions`, `flight_bookings`, `order_links`, `remote_orders`
    - Créer `whatsapp_messages` (avec `feature_source`, `whatsapp_number_id`), `ai_agents`, `critical_action_log`
    - Initialiser les données de référence : `Autre` permanent dans `transfer_methods`, fournisseurs par défaut (`Canal+`, `Access`, `Évasion`, `DStv`), les 6 types dans `ai_agents`, un `plans` par défaut
    - _Requirements: 4.1, 4.3, 6.6, 9.1, 11.1, 8.x, 10.x, 12.x, 13.2, 13.6, 14.2, 15.2_

  - [x] 1.3 Ajouter `agency_id` aux tables existantes et écrire le backfill de migration
    - Ajouter `agency_id` NULLABLE à `transactions`, `customers`, `expenses`, `loans`, `debts`, `reminder_history`, `message_templates`
    - Créer une agence par défaut par propriétaire (`admin`) existant, backfiller `agency_id`, puis poser la contrainte `NOT NULL`
    - _Requirements: 3.2, 18.6_

  - [x] 1.4 Créer les fonctions `SECURITY DEFINER` et les politiques RLS de cloisonnement
    - Écrire `is_agency_member(uid, aid)` (membre actif d'agence active OU propriétaire) et `is_platform_editor(uid)`
    - Appliquer le gabarit de politique d'isolation par `agency_id` à chaque table portant `agency_id`
    - Écrire les politiques de `module_entitlements` et `agencies` (écriture éditeur, lecture membre/éditeur), des catalogues (écriture éditeur, lecture membre) et la RPC `SECURITY DEFINER` d'insertion de `remote_orders` validant le jeton
    - _Requirements: 1.12, 2.8, 3.6, 4.8, 5.2, 5.4, 5.6, 9.6, 11.7_

  - [x] 1.5 Créer le bucket privé `order-proofs`, les index de performance et la planification cron
    - Créer le bucket privé `order-proofs` et sa politique de lecture par membre d'agence
    - Créer les index `idx_tx_agency_ts`, `idx_customers_agency`, `idx_transfers_agency`, `idx_subs_agency_renew`, `idx_flights_agency_at`, `idx_wamsg_agency_ts`, `idx_remote_orders_agency`
    - Programmer la tâche `pg_cron` (`*/15 * * * *`) invoquant `scheduled-reminders`
    - _Requirements: 14.4, 17.3, 10.4, 12.5_

  - [x]* 1.6 Écrire les tests smoke de schéma
    - Vérifier la présence des clés étrangères d'anticipation structurelle (`agencies.owner_id`, `points_of_sale.agency_id`, `registers.pos_id`, `whatsapp_numbers.agency_id`, `agencies.plan_id`, `subscription_providers.agency_id` nullable) et des index
    - _Requirements: 3.1, 3.3, 3.5, 5.7, 11.3, 13.6, 17.3_

- [x] 2. Logique pure d'autorisation (`src/utils/authorization.js`)
  - [x] 2.1 Implémenter le modèle de rôles et permissions
    - Définir `ROLES`, `PERMISSIONS`, `ROLE_PERMISSIONS` (`proprietaire` = toutes)
    - Implémenter `isValidRole`, `isValidInvitationEmail`, `effectivePermissions` (deny-overrides), `isAuthorized`
    - _Requirements: 1.2, 1.4, 1.5, 1.11, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x]* 2.2 Écrire le test de propriété pour la validation de rôle
    - **Property 1: Validation du rôle dans l'ensemble fermé**
    - **Validates: Requirements 1.5, 2.1**

  - [x]* 2.3 Écrire le test de propriété pour les permissions effectives
    - **Property 2: Permissions effectives et priorité du retrait (deny-overrides)**
    - **Validates: Requirements 2.2, 2.5, 2.6**

  - [x]* 2.4 Écrire le test de propriété pour la décision d'autorisation
    - **Property 3: Décision d'autorisation**
    - **Validates: Requirements 1.11, 2.3, 2.4**

  - [x]* 2.5 Écrire le test de propriété pour la validation d'e-mail d'invitation
    - **Property 4: Validation de l'e-mail d'invitation**
    - **Validates: Requirements 1.2, 1.4**

  - [x]* 2.6 Écrire le test de propriété pour le rejet d'e-mail déjà utilisé et l'expiration d'invitation
    - **Property 5: Rejet d'e-mail déjà utilisé** ; **Property 6: Expiration d'invitation au-delà de 168 heures**
    - **Validates: Requirements 1.6, 1.7**

- [x] 3. Logique pure d'activation de modules (`src/utils/moduleEntitlements.js`)
  - [x] 3.1 Implémenter l'activation à deux niveaux
    - Définir `BASE_MODULES`, `OPTIONAL_MODULES`, `ADDITIONAL_MODULES`
    - Implémenter `isModuleActivatable`, `isModuleEnabled`, `defaultModuleState`
    - _Requirements: 4.1, 4.3, 4.4, 4.5, 4.6, 6.1, 6.2, 6.3, 6.4, 6.5, 6.8_

  - [x]* 3.2 Écrire le test de propriété pour l'ensemble fermé des Modules_Additionnels
    - **Property 9: Ensemble fermé des Modules_Additionnels**
    - **Validates: Requirements 4.1**

  - [x]* 3.3 Écrire le test de propriété pour l'activation à deux niveaux
    - **Property 10: Activation des modules à deux niveaux**
    - **Validates: Requirements 4.3, 4.4, 4.5, 4.6, 6.2, 6.3, 6.4, 6.5**

  - [x]* 3.4 Écrire le test de propriété pour l'état de modules par défaut
    - **Property 11: État de modules par défaut**
    - **Validates: Requirements 6.8**

- [x] 4. Logique pure du taux de service (`src/utils/finance.js` étendu)
  - [x] 4.1 Ajouter le calcul du taux de service (additif, non-régression)
    - Implémenter `computeServiceAmount` et `computeOperationAmounts` sans modifier les fonctions existantes
    - Garantir le no-op à `serviceRate = 0` et la garde des bornes `[0,100]`
    - _Requirements: 7.3, 7.4, 7.5, 7.7, 7.8, 8.6, 18.1_

  - [x]* 4.2 Écrire le test de propriété pour l'invariant du montant de service
    - **Property 12: Invariant du montant de service (somme conservée)**
    - **Validates: Requirements 7.3, 7.7**

  - [x]* 4.3 Écrire le test de propriété pour le no-op du taux de service à 0
    - **Property 13: No-op du taux de service à 0 (non-régression)**
    - **Validates: Requirements 7.8, 18.1**

  - [x]* 4.4 Écrire le test de propriété pour la validation des taux
    - **Property 14: Validation des taux**
    - **Validates: Requirements 7.4, 7.5**

  - [x]* 4.5 Écrire le test de propriété pour les commissions incluses dans le bénéfice
    - **Property 16: Commissions incluses dans le bénéfice**
    - **Validates: Requirements 8.6**

  - [x]* 4.6 Vérifier la non-régression de la suite `finance.test.js` existante
    - Exécuter `src/utils/finance.test.js` et `finance.property.test.js` sans modification de comportement
    - _Requirements: 18.1, 18.5_

- [x] 5. Logique pure des catalogues administrables (`src/utils/catalogs.js`)
  - [x] 5.1 Implémenter la validation des libellés de catalogue
    - Implémenter `isValidCatalogLabel`, `isDeletableMethod`, `isValidCustomTransferLabel`, `TRANSFER_METHOD_OTHER`, `DEFAULT_PROVIDERS`
    - _Requirements: 8.3, 8.5, 9.1, 9.3, 9.4, 9.5, 9.7, 11.1, 11.4, 11.5, 11.6_

  - [x]* 5.2 Écrire le test de propriété pour la validation des libellés
    - **Property 17: Validation des libellés de catalogue**
    - **Validates: Requirements 9.3, 9.5, 11.4, 11.6**

  - [x]* 5.3 Écrire le test de propriété pour la permanence de « Autre »
    - **Property 18: Permanence et non-suppression de « Autre »**
    - **Validates: Requirements 9.1, 9.7**

  - [x]* 5.4 Écrire le test de propriété pour le filtrage des entrées actives et la stat par état
    - **Property 19: Filtrage des entrées actives et préservation de l'historique** ; **Property 20: Fournisseurs d'abonnement par défaut**
    - **Validates: Requirements 9.4, 11.5, 11.1**

- [x] 6. Logique pure de validation des services additionnels
  - [x] 6.1 Implémenter `src/utils/transferValidation.js`
    - Implémenter `validateTransfer` (montant > 0, méthode active, libellé `Autre` 1..60)
    - _Requirements: 8.2, 8.3, 8.4, 8.5_

  - [x]* 6.2 Écrire le test de propriété pour la validation d'un transfert
    - **Property 15: Validation d'une opération de transfert**
    - **Validates: Requirements 8.2, 8.3, 8.4, 8.5**

  - [x] 6.3 Implémenter `src/utils/subscriptionValidation.js`
    - Implémenter `validateSubscription` et la logique de consentement marketing et d'entrée d'historique de relance
    - _Requirements: 10.2, 10.3, 10.7, 10.8_

  - [x]* 6.4 Écrire le test de propriété pour la validation d'abonnement, le consentement et l'historique
    - **Property 21: Validation d'un abonnement** ; **Property 25: Consentement marketing requis** ; **Property 26: Entrée d'historique par tentative**
    - **Validates: Requirements 10.2, 10.3, 10.7, 10.8, 12.8, 13.2**

  - [x] 6.5 Implémenter `src/utils/flightBooking.js`
    - Implémenter `validateFlightBooking` et `computeFlightProfit` (`prixClient - prixAgence`, arrondi 2 décimales)
    - _Requirements: 12.2, 12.3, 12.4_

  - [x]* 6.6 Écrire le test de propriété pour le bénéfice et la validation de réservation
    - **Property 22: Calcul du bénéfice de réservation de billet et validation**
    - **Validates: Requirements 12.3, 12.4**

- [x] 7. Logique pure de planification des relances (`src/utils/reminderSchedule.js`)
  - [x] 7.1 Implémenter le déclenchement temporel et la validation des bornes
    - Implémenter `isSubscriptionReminderDue`, `isFlightReminderDue`, `isValidRenewalThreshold` (1..30), `isValidFlightLeadTime` (1..168)
    - _Requirements: 10.4, 10.5, 10.6, 12.5, 12.6, 12.7_

  - [x]* 7.2 Écrire le test de propriété pour le déclenchement temporel
    - **Property 23: Déclenchement temporel des relances et rappels**
    - **Validates: Requirements 10.4, 12.5**

  - [x]* 7.3 Écrire le test de propriété pour la validation des bornes
    - **Property 24: Validation des bornes de seuil et de délai**
    - **Validates: Requirements 10.5, 10.6, 12.6, 12.7**

- [x] 8. Logique pure du lien de commande à distance (`src/utils/orderToken.js`)
  - [x] 8.1 Implémenter la génération, l'encodage et la validation du jeton
    - Implémenter `generateOrderToken` (≥128 bits via `crypto.getRandomValues`), `isWellFormedToken`, `encodeOrderLink`, `decodeOrderLink`, et la validité (connu/non révoqué/non expiré) + champs requis du formulaire
    - _Requirements: 14.2, 14.5, 14.6_

  - [x]* 8.2 Écrire le test de propriété pour le round-trip et l'entropie du jeton
    - **Property 27: Round-trip et entropie du jeton de commande**
    - **Validates: Requirements 14.2**

  - [x]* 8.3 Écrire le test de propriété pour la validité du lien et les champs requis
    - **Property 28: Validité d'un lien de commande** ; **Property 29: Champs requis de la commande à distance**
    - **Validates: Requirements 14.5, 14.6**

- [x] 9. Logique pure du registre d'agents IA (`src/utils/agentRegistry.js`)
  - [x] 9.1 Implémenter le registre et la validation humaine
    - Définir `AGENT_TYPES` (6 types), implémenter `registerAgent`, `isCriticalAction`, `canExecuteProposal`
    - _Requirements: 14.7, 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_

  - [x]* 9.2 Écrire le test de propriété pour la validation humaine préalable
    - **Property 30: Validation humaine préalable à toute Action_Critique**
    - **Validates: Requirements 14.7, 15.3, 15.4, 15.6**

  - [x]* 9.3 Écrire le test de propriété pour le registre extensible et la journalisation
    - **Property 31: Registre d'agents extensible et journalisation des confirmations**
    - **Validates: Requirements 15.1, 15.5**

- [x] 10. Logique pure de pagination, statistiques et affectation d'agence
  - [x] 10.1 Implémenter `src/utils/pagination.js`
    - Implémenter `paginate` (page ≤ 50 éléments, couverture exacte sans perte ni doublon)
    - _Requirements: 17.1, 17.4_

  - [x]* 10.2 Écrire le test de propriété pour la pagination bornée
    - **Property 32: Pagination bornée et couverture exacte**
    - **Validates: Requirements 17.1, 17.4**

  - [x] 10.3 Implémenter `src/utils/agencyStats.js` et la résolution d'agence/PDV/caisse par défaut
    - Implémenter `countAgenciesByState`, l'affectation d'`agency_id` aux entités créées, la résolution du Point_De_Vente et de la Caisse par défaut implicites, et la vérification de rattachement du backfill
    - _Requirements: 3.2, 3.4, 5.8, 18.6_

  - [x]* 10.4 Écrire le test de propriété pour l'affectation d'agence, les défauts et la stat
    - **Property 7: Affectation de la clé d'agence** ; **Property 8: Point de vente et caisse par défaut implicites** ; **Property 33: Statistique du nombre d'agences par état** ; **Property 34: Rattachement complet des données à la migration**
    - **Validates: Requirements 3.2, 3.4, 5.8, 18.6**

- [x] 11. Internationalisation et contraste des nouveaux écrans
  - [x] 11.1 Ajouter les clés de traduction `fr`/`en` et étendre la palette
    - Ajouter les libellés des nouveaux écrans dans `src/i18n.js` (dictionnaires `fr` et `en` à parité stricte)
    - Étendre `src/styles/buttonPalette.js` avec les paires texte/fond des nouveaux composants
    - _Requirements: 16.6, 16.7_

  - [x]* 11.2 Écrire/étendre les tests de propriété pour la parité i18n et le contraste
    - **Property 36: Parité des clés de traduction fr/en** ; **Property 35: Contraste accessible des nouveaux composants**
    - **Validates: Requirements 16.6, 16.7**

- [x] 12. Checkpoint - Logique pure complète
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Étendre les services à effets de bord
  - [x] 13.1 Étendre `src/services/whatsappClient.js` (Service_Envoi unique)
    - Ajouter `featureSource`, `agencyId`, `whatsappNumberId` à `sendWhatsApp`, consigner chaque envoi dans `whatsapp_messages`, respecter la Limite_de_Debit, n'employer aucun autre canal
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.6_

  - [x] 13.2 Étendre `src/services/reminderService.js` (orchestration relances/rappels)
    - Orchestrer relances d'abonnement et rappels de vol via `rateLimiter`/`reminderQueue`/`sendResult`, journaliser succès/échec et programmer le ré-essai non bloquant
    - _Requirements: 10.4, 10.8, 12.5, 12.8, 13.5_

  - [x]* 13.3 Écrire les tests d'exemple du canal WhatsApp unique
    - Vérifier que publication, commande, relance, rappel et campagne passent toutes par `whatsapp-send` et consignent une entrée
    - _Requirements: 13.1, 13.3, 13.5_

  - [x] 13.4 Étendre `src/context/AppContext.jsx` (agence courante, permissions, modules, CRUD)
    - Exposer `currentAgency`/`agencyState`, les permissions effectives, l'état des modules et les actions CRUD des nouvelles entités, avec repli mock localStorage (mode démo préservé)
    - _Requirements: 1.10, 2.9, 6.6, 6.7, 7.6_

  - [x]* 13.5 Écrire les tests d'exemple du contexte
    - Tester le pré-remplissage du Taux_Service par défaut client (7.6), la persistance des états de module et le repli en cas d'échec (6.6, 6.7)
    - _Requirements: 6.6, 6.7, 7.6_

- [x] 14. Implémenter les Edge Functions Supabase
  - [x] 14.1 Créer `supabase/functions/agency-invite`
    - Émettre l'e-mail d'invitation (Supabase Auth admin / lien), valider l'unicité de l'e-mail, créer l'`agency_invitation` `en_attente`, gérer l'expiration et l'acceptation
    - _Requirements: 1.2, 1.3, 1.6, 1.7_

  - [x] 14.2 Créer `supabase/functions/scheduled-reminders`
    - Itérer les abonnements/vols dont la relance est due (via `reminderSchedule.js`), déléguer l'envoi au Service_Envoi, consigner dans `whatsapp_messages` et l'Historique_Rappels
    - _Requirements: 10.4, 12.5, 13.5_

  - [x]* 14.3 Écrire les tests d'exemple des Edge Functions
    - Tester la création/validation d'invitation et la sélection des relances dues (logique pure injectée)
    - _Requirements: 1.2, 1.6, 10.4, 12.5_

- [x] 15. Checkpoint - Services et Edge prêts
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Garde d'agence et gestion des employés (UI)
  - [x] 16.1 Implémenter `AgencyGate` dans `src/App.jsx`
    - Bloquer l'accès si `Etat_Agence = suspendue`, afficher le message d'accès suspendu, n'exposer aucune donnée de trésorerie ; câbler avec le gating `paid-access-control` existant
    - _Requirements: 5.2, 5.4, 18.2_

  - [x] 16.2 Implémenter `src/pages/Employes.jsx`
    - Inviter (e-mail + rôle + permissions), lister les comptes/invitations avec états, modifier rôle/permissions, désactiver un compte, le tout gardé par `employes.gerer`
    - _Requirements: 1.1, 1.8, 1.9, 1.10, 1.11, 2.9_

  - [x]* 16.3 Écrire les tests d'exemple de la gestion des employés
    - Tester les transitions d'état d'invitation (1.3), la modification de rôle (1.8) et le rendu conditionnel selon permission
    - _Requirements: 1.1, 1.3, 1.8, 1.10_

- [x] 17. Espace d'administration plateforme (UI)
  - [x] 17.1 Implémenter `src/pages/EspaceAdminPlateforme.jsx`
    - Accorder/révoquer les Droits_Module, lister/suspendre/réactiver les agences, administrer les catalogues, afficher la statistique d'agences par état ; gardé par le rôle Editeur_Plateforme
    - _Requirements: 4.2, 4.4, 4.5, 4.6, 4.7, 4.9, 5.1, 5.3, 5.5, 5.8, 9.2, 11.2_

  - [x]* 17.2 Écrire les tests d'exemple de l'administration plateforme
    - Tester l'enregistrement d'un Droit_Module à la demande ou à l'initiative (4.9), le rendu réservé à l'éditeur (4.2, 5.1) et l'affichage de la statistique (5.8)
    - _Requirements: 4.2, 4.9, 5.1, 5.8_

- [x] 18. Paramètres de modules (UI)
  - [x] 18.1 Étendre `src/pages/Settings.jsx` avec les toggles de modules
    - Afficher les toggles des Modules_Fonctionnels, masquer les Modules_Additionnels non habilités, afficher le message d'échec de persistance, réserver l'action au Propriétaire_Agence
    - _Requirements: 6.2, 6.3, 6.4, 6.7, 6.9_

  - [x]* 18.2 Écrire les tests d'exemple des paramètres de modules
    - Tester l'apparition/disparition de navigation selon habilitation et activation, et le refus pour un non-propriétaire
    - _Requirements: 6.2, 6.4, 6.9_

- [x] 19. Écrans des services additionnels (UI)
  - [x] 19.1 Implémenter `src/pages/Transferts.jsx`
    - Saisie d'un transfert (méthode du catalogue + montant + commission + libellé `Autre`), branchée sur `validateTransfer`, gardée par `services.vendre` et le module `transfert_argent`
    - _Requirements: 8.1, 8.2, 8.3, 8.6_

  - [x] 19.2 Implémenter `src/pages/Abonnements.jsx`
    - Vente d'abonnement (fournisseur actif + formule + montant + renouvellement), configuration du Seuil_Relance_Abonnement, envoi de campagne sur consentement, affichage de l'Historique_Rappels
    - _Requirements: 10.1, 10.2, 10.5, 10.6, 10.7, 10.8_

  - [x] 19.3 Implémenter `src/pages/Billets.jsx`
    - Réservation enrichie (champs complets + marge via `computeFlightProfit`), configuration du Delai_Rappel_Vol, affichage de l'Historique_Rappels
    - _Requirements: 12.1, 12.2, 12.3, 12.6, 12.7, 12.8_

  - [x]* 19.4 Écrire les tests d'exemple des écrans de services
    - Tester le rendu conditionnel selon module (8.1, 10.1, 12.1) et la réservation enrichie (12.2)
    - _Requirements: 8.1, 10.1, 12.1, 12.2_

- [x] 20. Commande à distance et publication (UI)
  - [x] 20.1 Implémenter `src/pages/FormulaireCommande.jsx` (route publique `/commande/:lien`)
    - Valider le jeton via `orderToken.js`, afficher le formulaire public sans authentification, enregistrer une Commande_Distante avec dépôt de Preuve dans le bucket privé via la RPC, gérer lien invalide et champ manquant
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_

  - [x] 20.2 Implémenter `src/pages/CommandesDistantes.jsx`
    - Lister les Commandes_Distantes `à_traiter`, exiger une Confirmation par un utilisateur habilité avant enregistrement définitif (via `canExecuteProposal`)
    - _Requirements: 14.7, 15.3_

  - [x]* 20.3 Écrire les tests d'exemple de la commande à distance
    - Tester l'enregistrement d'une commande valide avec preuve (14.3, 14.4) et le refus de lien invalide (14.5)
    - _Requirements: 14.3, 14.4, 14.5_

- [x] 21. Intégration de l'agent vocal et registre d'agents (UI)
  - [x] 21.1 Étendre `src/components/VoiceAgentModal.jsx`
    - Permettre l'ajustement du Taux_Change et du Taux_Service avant Confirmation (recalcul via `computeOperationAmounts`), intégrer le registre d'agents et l'exigence de validation humaine
    - _Requirements: 7.1, 7.2, 7.7, 15.3, 18.4_

  - [x]* 21.2 Écrire les tests d'exemple de l'agent vocal étendu
    - Tester le recalcul après ajustement du taux et la non-régression du flux vocal existant
    - _Requirements: 7.7, 18.4_

- [x] 22. Câblage final, responsive et navigation
  - [x] 22.1 Câbler les nouvelles routes, la navigation conditionnelle et la pagination des listes
    - Intégrer les pages dans `AppShell`/`react-router-dom`, brancher `paginate` sur les listes d'Operations/Clients/Abonnements/Reservations, appliquer le Systeme_Design (Theme_Clair, Cible_Tactile ≥ 44×44, responsive mobile/tablette/PC)
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 17.1, 17.4_

  - [x]* 22.2 Écrire les tests d'intégration RLS et performance
    - Tester l'isolation par agence (1.12, 3.6), la suspension/réactivation (5.2, 5.3, 5.4, 5.6), les droits de module (4.7, 4.8), les permissions d'écriture (2.8), la concurrence (17.6) et la performance des listes paginées (17.2, 17.5)
    - _Requirements: 1.12, 2.8, 3.6, 4.7, 4.8, 5.2, 5.3, 5.4, 5.6, 17.2, 17.5, 17.6_

- [x] 23. Checkpoint final - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Les tâches marquées `*` sont optionnelles (tests) et peuvent être ignorées pour un MVP plus rapide.
- Chaque tâche référence des sous-exigences précises pour la traçabilité.
- Chaque propriété de correction (P1–P36) est implémentée par un **seul** test de propriété, placé près de l'implémentation qu'il vérifie.
- Les garanties de sécurité (isolation multi-tenant, suspension, droits de module, permissions d'écriture) sont imposées par la RLS et vérifiées par des tests d'intégration (tâche 22.2), le gating React restant une commodité UX.
- Le principe « étendre, ne pas dupliquer » s'applique : `finance.js`, `whatsappClient.js`, `reminderService.js`, `AppContext.jsx`, `Settings.jsx`, `VoiceAgentModal.jsx`, `buttonPalette.js` et `i18n.js` sont étendus, non remplacés.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["1.4"] },
    { "id": 3, "tasks": ["1.5", "1.6", "2.1", "3.1", "4.1", "5.1", "6.1", "6.3", "6.5", "7.1", "8.1", "9.1", "10.1", "10.3", "11.1"] },
    { "id": 4, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6", "3.2", "3.3", "3.4", "4.2", "4.3", "4.4", "4.5", "4.6", "5.2", "5.3", "5.4", "6.2", "6.4", "6.6", "7.2", "7.3", "8.2", "8.3", "9.2", "9.3", "10.2", "10.4", "11.2"] },
    { "id": 5, "tasks": ["13.1", "13.2", "13.4"] },
    { "id": 6, "tasks": ["13.3", "13.5", "14.1", "14.2"] },
    { "id": 7, "tasks": ["14.3", "16.1", "17.1", "18.1", "19.1", "19.2", "19.3", "20.1", "20.2", "21.1"] },
    { "id": 8, "tasks": ["16.2", "22.1"] },
    { "id": 9, "tasks": ["16.3", "17.2", "18.2", "19.4", "20.3", "21.2", "22.2"] }
  ]
}
```
