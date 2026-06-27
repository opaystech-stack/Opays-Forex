# Implementation Plan: Relances clients WhatsApp

## Overview

Cette mise en œuvre ajoute un canal WhatsApp **sortant** à l'application Opays Forex et fiabilise le canal **entrant** existant, en suivant la conception à la lettre. L'approche est incrémentale et pilotée par les tests :

1. On construit d'abord la **logique pure** (`src/utils/`) — validation de numéro, mapping de résultat, résolution d'URL, composition de message, limitation de débit, file d'attente — chacune accompagnée de ses tests de propriété `fast-check` (≥ 100 itérations, étiquette `// Feature: whatsapp-client-reminders, Property {n}: …`).
2. On crée la **fonction Edge `whatsapp-send`** (Service_Envoi serveur) sur le patron `gemini-proxy`, puis on **corrige** `whatsapp-webhook` (audit : `WEBHOOK_SECRET`, timeouts, codes d'erreur typés) sans régression du cas nominal.
3. On ajoute le **schéma SQL** (`message_templates`, `reminder_history` + RLS), puis les **services** (`whatsappClient.js`, `reminderService.js`) et les **extensions `AppContext.jsx`**.
4. On branche l'**UI** bilingue (ReminderModal, action « Relancer », historique sur la Fiche_Client, TemplatesManager, intention vocale), on nettoie la **terminologie** (`kiosque`/`kiosk`) avec parité fr/en, et on clôt par une **validation finale et non-régression**.

Chaque sous-tâche de test est marquée `*` (optionnelle, non implémentée par défaut). Les tâches de cœur ne sont jamais optionnelles.

## Tasks

- [x] 1. Schéma de données des relances (SQL)
  - [x] 1.1 Ajouter les tables `message_templates` et `reminder_history` à `supabase_schema.sql`
    - Définir `message_templates` (id, name, lang `CHECK('fr','en')`, scenario `CHECK('recovery','announcement','personalized','custom')`, body, created_at, updated_at)
    - Définir `reminder_history` (id, customer_id FK→customers ON DELETE CASCADE, loan_id FK→loans ON DELETE SET NULL, template_id FK→message_templates ON DELETE SET NULL, scenario, content, trigger_source `CHECK('manual','voice')`, status `CHECK('sent','failed','queued')`, provider_message_id, error_reason, created_at)
    - Ajouter les index `idx_reminder_history_customer (customer_id, created_at DESC)` et `idx_message_templates_lang (lang, scenario)`
    - _Requirements: 7.2, 10.2, 11.1, 11.2, 11.3_

  - [x] 1.2 Activer RLS et créer les politiques `anon` cohérentes avec l'existant
    - `ALTER TABLE … ENABLE ROW LEVEL SECURITY` sur les deux tables
    - Politiques `templates_all_anon` et `reminders_all_anon` (`FOR ALL TO anon USING (true) WITH CHECK (true)`), à l'identique de `customers`/`loans`/`debts`
    - Ajouter le commentaire d'évolution `owner_id` documenté dans la conception
    - _Requirements: 11.6_

- [x] 2. Logique pure : validation de numéro, mapping de résultat, résolution d'URL (`src/utils/`)
  - [x] 2.1 Implémenter `phoneValidation.js`
    - `isValidInternationalPhone(phone)` : vrai ssi `+` suivi de 8 à 15 chiffres (E.164), espaces ignorés
    - `normalizeForGateway(phone)` : réutilise `customerMatching.normalizePhone` en conservant le `+`
    - _Requirements: 3.2, 3.3_

  - [ ]* 2.2 Écrire le test de propriété de `phoneValidation`
    - **Property 1 : Validation du format de numéro international**
    - **Validates: Requirements 3.2**
    - Fichier `src/utils/phoneValidation.property.test.js`, ≥ 100 itérations, étiquette de propriété

  - [x] 2.3 Implémenter `sendResult.js`
    - `mapGatewayResponse({ httpOk, messageId, error })` : `success:true` + messageId **ssi** `httpOk && messageId` non vide ; sinon `success:false` avec cause
    - _Requirements: 3.4, 3.5, 3.6_

  - [x] 2.4 Implémenter la résolution d'URL de passerelle `gatewayUrl.js`
    - Fonction pure : `resolveGatewayUrl(sendUrl, sharedUrl)` → `sendUrl` si défini, sinon `sharedUrl`
    - _Requirements: 12.2, 12.3_

  - [ ]* 2.5 Écrire le test de propriété de résolution d'URL
    - **Property 17 : Résolution de l'URL de passerelle d'envoi**
    - **Validates: Requirements 12.2, 12.3**
    - Fichier `src/utils/gatewayUrl.property.test.js`, ≥ 100 itérations, étiquette de propriété

- [x] 3. Logique pure : composition et résolution de variables (`messageComposer.js`)
  - [x] 3.1 Implémenter `messageComposer.js`
    - `resolveTemplate(templateBody, variables, options)` → `{ ok, text?, missing? }` : remplace `{{nom}}` par la valeur ; variable optionnelle sans valeur → repli défini (jamais le marqueur brut) ; variable obligatoire manquante → `ok:false` + `missing`
    - `composeFreeText(rawText)` → identité, aucune résolution
    - Variables minimales : `customer_name` (obligatoire), `amount_due`, `currency`, `due_date` (optionnelles, repli `« — »`)
    - _Requirements: 5.3, 5.4, 7.1, 7.3, 9.1, 9.2, 9.3, 10.3, 10.4_

  - [ ]* 3.2 Écrire le test de propriété texte libre
    - **Property 7 : Texte libre préservé littéralement**
    - **Validates: Requirements 5.3, 5.4**
    - Fichier `src/utils/messageComposer.property.test.js`, ≥ 100 itérations, étiquette de propriété

  - [ ]* 3.3 Écrire le test de propriété résolution complète
    - **Property 8 : Résolution complète des variables d'un modèle**
    - **Validates: Requirements 7.1, 9.1, 9.2, 10.3**
    - Même fichier, ≥ 100 itérations, étiquette de propriété

  - [ ]* 3.4 Écrire le test de propriété repli des variables optionnelles
    - **Property 9 : Repli des variables optionnelles**
    - **Validates: Requirements 7.3, 9.3**
    - Même fichier, ≥ 100 itérations, étiquette de propriété

  - [ ]* 3.5 Écrire le test de propriété blocage sur variable obligatoire
    - **Property 10 : Blocage sur variable obligatoire non résolue**
    - **Validates: Requirements 10.4**
    - Même fichier, ≥ 100 itérations, étiquette de propriété

- [x] 4. Logique pure : limitation de débit et file d'attente (`rateLimiter.js`, `reminderQueue.js`)
  - [x] 4.1 Implémenter `rateLimiter.js` (horloge injectée, état immuable)
    - `canSend(state, nowMs, config)` → `{ allowed, nextAllowedAtMs }` ; `registerSend(state, nowMs, config)` → nouvel état
    - Au plus `maxPerInterval` envois par `intervalMs` glissant ; espacement ≥ `minSpacingMs` entre deux envois consécutifs
    - _Requirements: 4.1, 4.4_

  - [ ]* 4.2 Écrire le test de propriété de débit/espacement
    - **Property 4 : Respect de la limite de débit et de l'espacement minimal**
    - **Validates: Requirements 4.1, 4.4, 6.4, 8.2**
    - Fichier `src/utils/rateLimiter.property.test.js`, ≥ 100 itérations, étiquette de propriété

  - [x] 4.3 Implémenter `reminderQueue.js` (FIFO, ré-essais, pur)
    - `enqueue(queue, item)` (ordre de soumission préservé), `dequeueReady(queue, nowMs, limiterState, config)`, `onFailure(queue, item, config)` → ré-essai si `attempts < maxAttempts`
    - _Requirements: 4.2, 4.3, 4.5_

  - [ ]* 4.4 Écrire le test de propriété FIFO sans perte
    - **Property 5 : File d'attente FIFO sans perte**
    - **Validates: Requirements 4.2, 4.3**
    - Fichier `src/utils/reminderQueue.property.test.js`, ≥ 100 itérations, étiquette de propriété

  - [ ]* 4.5 Écrire le test de propriété ré-essais bornés
    - **Property 6 : Ré-essais bornés**
    - **Validates: Requirements 4.5**
    - Même fichier, ≥ 100 itérations, étiquette de propriété

- [x] 5. Fonction Edge `whatsapp-send` (Service_Envoi serveur)
  - [x] 5.1 Créer `supabase/functions/whatsapp-send/index.ts` sur le patron `gemini-proxy`
    - CORS/`OPTIONS` ; validation `to`/`message` non vides → 400 sinon
    - Résolution d'URL serveur `WHATSAPP_SEND_GATEWAY_URL || WHATSAPP_GATEWAY_URL` (aucune → 500 `gateway_not_configured`)
    - `POST {gatewayUrl}/sendText` avec en-tête d'auth = `WHATSAPP_API_SECRET`, encadré d'un `AbortController` (timeout configurable)
    - Mapper la réponse selon la logique de `sendResult` (OK+id → succès ; OK sans id → `missing_message_id` ; non-OK/injoignable/timeout → échec). Secret et URL jamais exposés dans le corps/logs
    - _Requirements: 3.1, 3.4, 3.5, 3.6, 3.7, 12.1, 12.2, 12.3_

  - [ ]* 5.2 Écrire les tests d'exemple de `whatsapp-send` (`fetch` mocké)
    - En-tête d'auth posé depuis l'env, résolution d'URL, mapping succès/échec/sans-id
    - _Requirements: 3.4, 3.5, 3.6, 3.7, 12.1_

- [x] 6. Audit et corrections de `whatsapp-webhook/index.ts` (canal entrant)
  - [x] 6.1 Ajouter la vérification du `WEBHOOK_SECRET` (correction A1)
    - Lire `Deno.env.get('WEBHOOK_SECRET')` ; si défini, comparer à l'en-tête entrant (`x-webhook-secret` ou `?secret=`) → 401 `unauthorized` si absent/mismatch
    - Si non configuré : avertissement journalisé, comportement inchangé (rétro-compatibilité)
    - _Requirements: 1.3, 2.2, 14.1_

  - [x] 6.2 Encadrer les appels réseau de timeouts (correction A2)
    - `AbortController` + délais configurables (`MEDIA_TIMEOUT_MS`, `GEMINI_TIMEOUT_MS`, défaut 10 s) sur le téléchargement média et l'appel Gemini
    - Dépassement → 504 `timeout` ; échec de téléchargement média → repli texte + journal `media_download_failed` (pas d'échec dur)
    - _Requirements: 2.1_

  - [x] 6.3 Typer les codes d'erreur métier (corrections A3, A4, A6)
    - Portefeuille inconnu / résolution source-dest impossible → 422 `no_matching_wallet` (chaque requête traitée indépendamment)
    - Gemini HTTP non-OK/injoignable → 502 `gemini_upstream` ; réponse Gemini non analysable/vide → 422 `gemini_unparseable` (parsing sûr type `voiceAgent.parseGeminiResponse`)
    - Préserver le cas nominal : payload valide → 200 + transaction `draft` (corps inchangé)
    - _Requirements: 1.1, 1.2, 1.4, 2.3, 2.4, 2.5, 14.1_

  - [ ]* 6.4 Écrire les tests d'exemple du webhook corrigé (`fetch`/Supabase mockés)
    - Secret absent → 401 ; portefeuille inconnu → 422 ; Gemini KO → 502 ; timeout → 504 ; cas nominal → 200 + `draft` (non-régression)
    - _Requirements: 2.2, 2.3, 2.4, 14.1_

- [x] 7. Service_Envoi côté client (`src/services/whatsappClient.js`)
  - [x] 7.1 Implémenter `whatsappClient.js`
    - `sendWhatsApp({ supabase, to, message })` : valide le numéro (`phoneValidation`) — invalide → `{ success:false, error }` **sans** appel réseau ; sinon `supabase.functions.invoke('whatsapp-send', { body:{ to:normalizeForGateway(to), message } })` puis normalise via `sendResult`
    - _Requirements: 3.1, 3.2, 3.3_

  - [ ]* 7.2 Écrire le test de propriété « aucun appel passerelle pour numéro invalide »
    - **Property 2 : Aucun appel passerelle pour un numéro invalide**
    - **Validates: Requirements 3.3**
    - Fichier `src/services/whatsappClient.property.test.js`, invoke mocké, ≥ 100 itérations, étiquette de propriété

  - [ ]* 7.3 Écrire le test de propriété de mapping du résultat passerelle
    - **Property 3 : Mapping du résultat de la passerelle**
    - **Validates: Requirements 3.4, 3.5, 3.6**
    - Même fichier (via `sendResult`), ≥ 100 itérations, étiquette de propriété

- [x] 8. Service_Relance — orchestration (`src/services/reminderService.js`)
  - [x] 8.1 Implémenter `buildReminders({ scenario, customers, loans, template, freeText, lang })`
    - Recouvrement : résout `customer_name` + `amount_due` + `currency` depuis `loans` (`pending`/`overdue`), rattache `loan_id` ; aucun montant → pas de référence à un montant (Ex. 7.3)
    - Annonce : crée une Relance par Client sélectionné (cardinalité N) ; Personnalisée : résolution complète via `messageComposer`
    - Source vocale : reçoit le Client résolu par `customerMatching` ; ambiguïté/nulle → pas d'envoi + signalement ; `blocked` listant les variables manquantes
    - _Requirements: 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 8.1, 9.1, 9.2, 9.3_

  - [x] 8.2 Implémenter `runReminderBatch({ supabase, reminders, config, clock, onResult })`
    - Applique `rateLimiter` + `reminderQueue` (ordre, espacement, ré-essais ≤ `maxAttempts`) ; chaque envoi passe par `whatsappClient`
    - Lot d'annonce : un échec individuel n'interrompt pas la boucle ; tentative vocale ambiguë comptabilisée dans le débit
    - Journalisation : `logReminder` pour chaque envoi (succès/échec, content, horodatage, source, status, `error_reason`) ; échec d'écriture d'historique n'empêche pas l'envoi (Ex. 11.4)
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 6.4, 6.5, 8.2, 8.3, 8.4, 11.1, 11.2, 11.3, 11.4_

  - [ ]* 8.3 Écrire le test de propriété ambiguïté vocale
    - **Property 11 : Ambiguïté vocale sans envoi**
    - **Validates: Requirements 6.2**
    - Fichier `src/services/reminderService.property.test.jsx`, ≥ 100 itérations, étiquette de propriété

  - [ ]* 8.4 Écrire le test de propriété tentative vocale comptabilisée
    - **Property 12 : Une tentative vocale ambiguë est comptabilisée dans le débit**
    - **Validates: Requirements 6.5**
    - Même fichier, ≥ 100 itérations, étiquette de propriété

  - [ ]* 8.5 Écrire le test de propriété cardinalité d'annonce
    - **Property 13 : Cardinalité d'une annonce collective**
    - **Validates: Requirements 8.1**
    - Même fichier, ≥ 100 itérations, étiquette de propriété

  - [ ]* 8.6 Écrire le test de propriété résilience du lot
    - **Property 14 : Résilience du lot d'annonce**
    - **Validates: Requirements 8.4**
    - Même fichier, ≥ 100 itérations, étiquette de propriété

  - [ ]* 8.7 Écrire le test de propriété entrée d'historique complète
    - **Property 15 : Entrée d'historique complète et rattachée pour chaque envoi**
    - **Validates: Requirements 6.3, 8.3, 11.1, 11.2**
    - Même fichier, ≥ 100 itérations, étiquette de propriété

  - [ ]* 8.8 Écrire le test de propriété historique d'échec
    - **Property 16 : Historique d'échec horodaté avec cause**
    - **Validates: Requirements 7.2, 11.3**
    - Même fichier, ≥ 100 itérations, étiquette de propriété

- [x] 9. Extensions de `AppContext.jsx` (modèles + historique)
  - [x] 9.1 Ajouter l'état et les actions des modèles
    - `templates`, `createTemplate`, `updateTemplate`, `deleteTemplate`, `fetchTemplates` (patron `createDebt`/`createCustomer`, repli mock localStorage si `supabase` absent)
    - _Requirements: 10.2, 10.5_

  - [x] 9.2 Ajouter l'état et les actions d'historique
    - `reminderHistory`, `logReminder(entry)` (insert `reminder_history`), `getCustomerReminders(customerId)` ; repli mock localStorage
    - _Requirements: 11.1, 11.5_

  - [ ]* 9.3 Écrire les tests CRUD/round-trip de contexte
    - Modèles insert → relecture ; journalisation → relecture par client (mode mock)
    - _Requirements: 10.2, 10.5, 11.5_

- [x] 10. Checkpoint — Vérifier que tous les tests passent
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. UI — ReminderModal et action « Relancer »
  - [x] 11.1 Créer `src/components/ReminderModal.jsx` (bilingue `useT()`)
    - Sélection du scénario (recouvrement/annonce/personnalisé), choix modèle **vs** texte libre, aperçu résolu, états confirmation/erreur
    - Délègue à `reminderService` ; réutilise les classes CSS existantes (`card`, `btn`, `modal-*`, `alert`)
    - _Requirements: 5.2, 5.5, 5.6, 8.1, 10.1_

  - [x] 11.2 Ajouter le bouton « Relancer » sur `CustomerCard.jsx` et l'action du tableau de bord
    - Ouvre `ReminderModal` pour le Client concerné
    - _Requirements: 5.1_

  - [ ]* 11.3 Écrire les tests UI du déclenchement
    - Présence du bouton « Relancer », confirmation visuelle au succès, message d'erreur à l'échec
    - _Requirements: 5.1, 5.5, 5.6_

- [x] 12. UI — Historique des relances sur la Fiche_Client
  - [x] 12.1 Étendre `CustomerCard.jsx` pour afficher l'Historique_Relance
    - Liste date, contenu, source (manuelle/vocale), statut via `getCustomerReminders` ; bilingue `useT()`
    - _Requirements: 11.5_

  - [ ]* 12.2 Écrire le test de rendu de l'historique
    - Affichage des entrées d'historique d'un Client donné
    - _Requirements: 11.5_

- [x] 13. UI — Gestion des modèles (TemplatesManager)
  - [x] 13.1 Créer `src/components/TemplatesManager.jsx` (intégré à `Settings.jsx`)
    - CRUD des `message_templates` via `AppContext`, sélection de langue fr/en, bilingue `useT()`
    - _Requirements: 10.2, 10.5_

  - [ ]* 13.2 Écrire le test CRUD de l'UI des modèles
    - Création/édition/suppression d'un modèle (mode mock)
    - _Requirements: 10.2_

- [x] 14. UI — Intention vocale de relance
  - [x] 14.1 Étendre `VoiceAgentModal.jsx` et `voiceAgent.js` pour l'intention « relance »
    - Reconnaître l'intention, résoudre le Client via `customerMatching`, déléguer à `reminderService` ; ambiguïté → signalement sans envoi
    - Préserver les commandes vocales existantes (non-régression)
    - _Requirements: 6.1, 6.2_

  - [ ]* 14.2 Écrire le test de l'intention vocale de relance
    - Intention « relance » → délégation à `reminderService` ; ambiguïté signalée
    - _Requirements: 6.1, 6.2_

- [x] 15. Terminologie bilingue et parité i18n
  - [x] 15.1 Nettoyer la terminologie et ajouter les clés de relance dans `src/i18n.js`
    - Remplacer « kiosque » / « kiosk » par un terme professionnel (« point de service »/« agence ») dans `fr` et `en` ; remplacer les termes inappropriés identifiés en conservant le sens métier
    - Ajouter les clés fr/en des nouvelles UI (ReminderModal, historique, TemplatesManager, intention vocale)
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [x] 15.2 Appliquer la terminologie corrigée dans les composants affectés
    - Mettre à jour les composants/pages qui affichent les textes révisés
    - _Requirements: 13.5_

  - [ ]* 15.3 Écrire le test de propriété de parité fr/en
    - **Property 18 : Parité des clés de traduction fr/en**
    - **Validates: Requirements 13.2**
    - Fichier `src/i18n.property.test.js`, ≥ 100 itérations, étiquette de propriété

  - [ ]* 15.4 Écrire le test d'absence des termes inappropriés
    - Vérifier l'absence de « kiosque » / « kiosk » dans `src/i18n.js` et les composants
    - _Requirements: 13.1, 13.4, 13.5_

- [x] 16. Validation finale et non-régression
  - [ ]* 16.1 Écrire les tests d'intégration de validation finale
    - Flux entrant après corrections → transaction `draft` (Ex. 15.1) ; relance manuelle **et** vocale → `invoke('whatsapp-send')` mocké (Ex. 15.2) ; entrée `reminder_history` rattachée au Client (Ex. 15.3)
    - _Requirements: 15.1, 15.2, 15.3_

  - [x] 16.2 Exécuter la non-régression : `npm test` (suite complète) puis `npm run build`
    - Confirmer que tous les tests préexistants passent et que le build réussit
    - Vérifier que `src/utils/finance.js` et ses tests restent intacts ; vérifier que les commandes existantes de l'Agent_Vocal fonctionnent toujours ; structure des pages de `src/pages/` préservée
    - _Requirements: 14.2, 14.3, 14.4, 14.5, 15.4, 15.5_

- [x] 17. Checkpoint final — Vérifier que tous les tests passent
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Les sous-tâches marquées `*` sont optionnelles (tests unitaires, de propriété, d'intégration) et peuvent être sautées pour un MVP plus rapide ; elles ne sont pas implémentées par défaut.
- Chaque tâche référence des exigences précises pour la traçabilité ; chaque test de propriété référence sa propriété de conception et la clause d'exigence qu'il valide.
- Tests de propriété : bibliothèque **fast-check**, **≥ 100 itérations** (`fc.assert(..., { numRuns: 100 })`), étiquette `// Feature: whatsapp-client-reminders, Property {n}: …`.
- Les Propriétés 1 à 18 portent sur la logique pure ; les I/O, le rendu UI et la non-régression sont couverts par des tests d'exemple/intégration.
- Les corrections du webhook préservent le cas nominal (200 + transaction `draft`) ; l'authentification ne s'active que si `WEBHOOK_SECRET` est configuré.
- Le secret OpenWA et l'URL de passerelle restent **serveur uniquement** (fonction `whatsapp-send`), jamais dans le bundle `VITE_*` ni dans les réponses/logs.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "2.3", "2.4", "3.1", "4.1", "4.3"] },
    { "id": 1, "tasks": ["1.2", "2.2", "2.5", "3.2", "4.2", "4.4", "5.1", "6.1", "9.1"] },
    { "id": 2, "tasks": ["3.3", "4.5", "5.2", "6.2", "7.1", "9.2"] },
    { "id": 3, "tasks": ["3.4", "6.3", "7.2", "9.3", "8.1"] },
    { "id": 4, "tasks": ["3.5", "6.4", "7.3", "8.2"] },
    { "id": 5, "tasks": ["8.3"] },
    { "id": 6, "tasks": ["8.4", "11.1", "13.1", "14.1"] },
    { "id": 7, "tasks": ["8.5", "11.2", "13.2", "14.2"] },
    { "id": 8, "tasks": ["8.6", "12.1", "11.3"] },
    { "id": 9, "tasks": ["8.7", "12.2", "15.1"] },
    { "id": 10, "tasks": ["8.8", "15.2"] },
    { "id": 11, "tasks": ["15.3", "15.4"] },
    { "id": 12, "tasks": ["16.1"] },
    { "id": 13, "tasks": ["16.2"] }
  ]
}
```
