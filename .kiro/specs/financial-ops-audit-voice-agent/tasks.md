# Implementation Plan: Audit financier, fiabilisation des agents IA et bouton « Agent vocal »

## Overview

Ce plan convertit la conception en une suite incrémentale de tâches de code (React + Vite, JavaScript, `vitest` + `@testing-library` + `fast-check`). L'ordre suit le principe directeur de l'`AGENTS.md` : **réutiliser et fiabiliser le code existant** plutôt que dupliquer.

Séquence logique :
1. Extraction des **fonctions pures testables** (`finance.js`, `txnValidation.js`, `customerMatching.js`, `customerHistory.js`, `voiceAgent.js`) et leurs tests de propriété (P1–P25, fast-check, ≥ 100 itérations).
2. **Intégration dans `AppContext.jsx`** (calculs, validation, déduplication client, historique).
3. **Refactorisation de `Transactions.jsx`** pour consommer `voiceAgent.js`.
4. **Composants UI** (`CustomerCard.jsx`, `VoiceAgentModal.jsx`), **bouton « Agent vocal »** dans `app-header` (`App.jsx`) et CSS responsive/sticky.
5. **Scripts d'audit** (`scripts/audit/`) produisant `docs/Rapport_Audit.md`.
6. **Validation finale** vérifiable (build + `npm test` verts, non-régression, Exigence 11.5/11.6 et Exigence 12).

Convention de tag des tests de propriété : `// Feature: financial-ops-audit-voice-agent, Property {n}: {texte}`, `numRuns: 100`.

## Tasks

- [x] 1. Étendre la couche financière pure (`src/utils/finance.js`)
  - [x] 1.1 Implémenter les fonctions de calcul pures
    - Ajouter `roundHalfUp(value, decimals)` (arrondi demi vers le haut)
    - Ajouter `computeExchangeRate(sourceAmount, destAmount)` : `dest/source` à 6 décimales ; signaler une erreur si `sourceAmount <= 0` sans produire de taux
    - Étendre `convertToUSD` : division par `rate_to_usd` avec arrondi monétaire 2 décimales ; retour neutre / signalement si taux nul, négatif ou absent
    - Ajouter `computeProfitUSD(sourceAmount, sourceCur, destAmount, destCur, rates)` : valeur USD source − valeur USD dest, 2 décimales
    - Ajouter `applyBalances(wallets, txn)` : mutations selon `exchange`/`deposit`/`withdrawal`, débit du portefeuille de frais si `fee > 0`, arrondi 2 décimales, rejet sans effet de bord si solde source < 0, aucun effet pour les `draft`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 4.1_

  - [x]* 1.2 Écrire le test de propriété du calcul du taux
    - **Property 1: Calcul du taux de change**
    - Fichier : `src/utils/finance.property.test.js`
    - **Validates: Requirements 1.1**

  - [x]* 1.3 Écrire le test de propriété du rejet de montant source non positif
    - **Property 2: Montant source non positif rejeté pour le taux**
    - Fichier : `src/utils/finance.property.test.js`
    - **Validates: Requirements 1.2**

  - [x]* 1.4 Écrire le test de propriété de conversion USD et garde de taux invalide
    - **Property 3: Conversion USD par division et garde de taux invalide**
    - Fichier : `src/utils/finance.property.test.js`
    - **Validates: Requirements 1.10, 1.11**

  - [x]* 1.5 Écrire le test de propriété du calcul du profit en USD
    - **Property 7: Calcul du profit en USD**
    - Fichier : `src/utils/finance.property.test.js`
    - **Validates: Requirements 1.3**

  - [x]* 1.6 Écrire le test de propriété des mutations de soldes
    - **Property 4: Mutation des soldes selon le type d'opération**
    - Fichier : `src/utils/finance.property.test.js`
    - **Validates: Requirements 1.4, 1.5, 1.6, 1.8**

  - [x]* 1.7 Écrire le test de propriété du rejet pour fonds insuffisants
    - **Property 5: Fonds insuffisants rejetés sans effet de bord**
    - Fichier : `src/utils/finance.property.test.js`
    - **Validates: Requirements 1.7, 4.1**

  - [x]* 1.8 Écrire le test de propriété de neutralité des brouillons
    - **Property 6: Les brouillons n'affectent aucun solde**
    - Fichier : `src/utils/finance.property.test.js`
    - **Validates: Requirements 1.9**

- [x] 2. Créer le module de validation des opérations (`src/utils/txnValidation.js`)
  - [x] 2.1 Implémenter les fonctions de validation pures
    - `validateAmount(value, fieldName)` : rejette absent/nul/négatif/non numérique/`< 0,01`/`> 999 999 999,99` en identifiant le champ ; accepte l'intervalle valide
    - `ensureDistinctWallets(txn)` : rejet d'un `exchange` aux portefeuilles source = destination
    - `detectDuplicate(existingOps, transactionId)` : renvoie l'opération existante pour un `transaction_id` non vide déjà présent, suspend l'enregistrement ; aucun doublon sinon
    - _Requirements: 4.2, 4.3, 4.4, 4.5_

  - [x]* 2.2 Écrire le test de propriété de validation des montants
    - **Property 9: Validation des montants d'opération**
    - Fichier : `src/utils/txnValidation.property.test.js`
    - **Validates: Requirements 4.2**

  - [x]* 2.3 Écrire le test de propriété des portefeuilles distincts
    - **Property 10: Portefeuilles source et destination distincts (exchange)**
    - Fichier : `src/utils/txnValidation.property.test.js`
    - **Validates: Requirements 4.3**

  - [x]* 2.4 Écrire le test de propriété de détection de doublon
    - **Property 11: Détection de doublon par identifiant réseau**
    - Fichier : `src/utils/txnValidation.property.test.js`
    - **Validates: Requirements 4.4**

- [x] 3. Extraire le module de déduplication client (`src/utils/customerMatching.js`)
  - [x] 3.1 Implémenter les fonctions de rattachement pures
    - `normalizePhone(phone)` : retire tous les caractères d'espacement
    - `normalizeName(name)` : minuscule + suppression des espaces de bord
    - `matchCustomer(customers, { name, phone })` : priorité téléphone normalisé, sinon nom normalisé ; départage par téléphone puis `created_at` le plus ancien ; ne crée jamais d'enregistrement ; signale l'absence/ambiguïté de correspondance
    - _Requirements: 8.1, 8.2, 8.5, 8.6, 8.7, 5.8, 5.9, 6.5, 7.3_

  - [x]* 3.2 Écrire le test de propriété de priorité et déterminisme du rattachement
    - **Property 15: Priorité et déterminisme du rattachement client**
    - Fichier : `src/utils/customerMatching.property.test.js`
    - **Validates: Requirements 8.1, 8.2, 8.7, 5.8, 5.9, 6.5, 7.3, 12.3**

  - [x]* 3.3 Écrire le test de propriété de création puis rattachement
    - **Property 16: Création puis rattachement en l'absence de correspondance**
    - Fichier : `src/utils/customerMatching.property.test.js`
    - **Validates: Requirements 8.3**

  - [x]* 3.4 Écrire le test de propriété de normalisation des téléphones
    - **Property 17: Normalisation des numéros de téléphone (insensible aux espaces)**
    - Fichier : `src/utils/customerMatching.property.test.js`
    - **Validates: Requirements 8.5**

  - [x]* 3.5 Écrire le test de propriété de normalisation des noms
    - **Property 18: Normalisation des noms (casse et espaces de bord)**
    - Fichier : `src/utils/customerMatching.property.test.js`
    - **Validates: Requirements 8.6**

  - [x]* 3.6 Écrire le test de propriété d'absence de rattachement sans identité
    - **Property 19: Absence de rattachement sans identité**
    - Fichier : `src/utils/customerMatching.property.test.js`
    - **Validates: Requirements 8.4**

- [x] 4. Créer le module d'historique client (`src/utils/customerHistory.js`)
  - [x] 4.1 Implémenter les helpers d'historique purs
    - `sortCustomerOperations(operations)` : tri par date décroissante, départage par ordre d'enregistrement décroissant
    - `countCustomerOperations(operations)` : entier borné `[0, 999 999]`
    - `formatOperationRow(operation)` : date `JJ/MM/AAAA`, montant 2 décimales, type non vide
    - _Requirements: 9.2, 9.3, 9.7_

  - [x]* 4.2 Écrire le test de propriété de formatage des lignes
    - **Property 21: Formatage des lignes d'historique**
    - Fichier : `src/utils/customerHistory.property.test.js`
    - **Validates: Requirements 9.2**

  - [x]* 4.3 Écrire le test de propriété de comptage borné
    - **Property 22: Comptage borné des opérations**
    - Fichier : `src/utils/customerHistory.property.test.js`
    - **Validates: Requirements 9.3**

  - [x]* 4.4 Écrire le test de propriété de tri par date décroissante
    - **Property 24: Tri de l'historique par date décroissante**
    - Fichier : `src/utils/customerHistory.property.test.js`
    - **Validates: Requirements 9.7**

- [x] 5. Extraire le module d'agent vocal réutilisable (`src/utils/voiceAgent.js`)
  - [x] 5.1 Factoriser la logique d'agent IA depuis `Transactions.jsx`
    - `buildGeminiRequest({ kind, wallets, file|blob })` : prompt + mimeType + base64 selon `audio`/`ocr`/`file`
    - `parseGeminiResponse(text)` : retire les balises markdown, `JSON.parse` sûr, ne lève jamais ; `{ ok, data }` ou `{ ok, error }`
    - `validateMediaInput({ mimeType, sizeBytes, kind })` : rejet si type ∉ {application/pdf, image/jpeg, image/png} ou taille > 10 Mo, sans appel proxy
    - `callGeminiWithTimeout({ supabase, payload, timeoutMs })` : `AbortController`/`Promise.race`, bascule Mode_Simule
    - `validateExtractedFields(data)` : champs obligatoires absents/hors bornes laissés vides et marqués invalides
    - Conserver `simulateVoiceResult()` / `simulateOcrResult()`
    - _Requirements: 5.2, 5.3, 5.4, 5.7, 6.2, 6.8, 6.9, 7.5, 7.6, 7.7, 4.6_

  - [x]* 5.2 Écrire le test de propriété de robustesse de l'analyse Gemini
    - **Property 12: Robustesse de l'analyse de la réponse Gemini**
    - Fichier : `src/utils/voiceAgent.property.test.js`
    - **Validates: Requirements 5.7, 6.8, 6.9, 7.5, 7.7**

  - [x]* 5.3 Écrire le test de propriété de validation des champs extraits
    - **Property 13: Validation des champs extraits par les agents**
    - Fichier : `src/utils/voiceAgent.property.test.js`
    - **Validates: Requirements 5.3, 5.4, 12.2**

  - [x]* 5.4 Écrire le test de propriété de validation du format/taille des médias
    - **Property 14: Validation du format et de la taille des médias**
    - Fichier : `src/utils/voiceAgent.property.test.js`
    - **Validates: Requirements 6.2, 7.6**

- [x] 6. Checkpoint - Vérifier les fondations pures
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Intégrer les modules purs dans `src/context/AppContext.jsx`
  - [x] 7.1 Brancher calculs, validation et détection de doublon
    - Utiliser `finance.applyBalances`/`computeExchangeRate`/`computeProfitUSD` dans `addTransaction`/`confirmDraft`
    - Appliquer `txnValidation` (montants, portefeuilles distincts, détection de doublon avec suspension/confirmation)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 7.2 Refactoriser `findOrCreateCustomer` et l'historique
    - Consommer `customerMatching` (rattachement déterministe, sans doublon) ; en l'absence de correspondance, créer puis rattacher
    - Gérer l'échec de `createCustomer` : annuler l'opération, conserver les données saisies, message d'échec
    - Exposer l'historique trié et le total via `customerHistory`, mis à jour après enregistrement
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.8, 9.1, 9.5, 9.6, 12.5_

  - [x]* 7.3 Écrire le test de propriété d'appartenance à l'historique
    - **Property 20: Appartenance à l'historique du client**
    - Fichier : `src/context/AppContext.integration.test.jsx`
    - **Validates: Requirements 9.1, 9.5, 9.6**

  - [x]* 7.4 Écrire le test de propriété d'incrément du total
    - **Property 23: Incrément du total à l'enregistrement**
    - Fichier : `src/context/AppContext.integration.test.jsx`
    - **Validates: Requirements 12.5**

  - [x]* 7.5 Écrire les tests unitaires d'échec de création client
    - Vérifier qu'un échec de `createCustomer` annule l'opération sans appeler la persistance et conserve les données
    - Fichier : `src/context/AppContext.integration.test.jsx`
    - _Requirements: 8.8_

- [x] 8. Refactoriser `src/pages/Transactions.jsx` vers `voiceAgent.js`
  - [x] 8.1 Réécrire les flux agents pour consommer le module commun
    - `processAudioWithGemini`/`processImageWithGemini`/upload utilisent `buildGeminiRequest`, `validateMediaInput`, `callGeminiWithTimeout`, `parseGeminiResponse`, `validateExtractedFields`
    - Conserver le pré-remplissage `applyGeminiResult`, la Confirmation explicite et la bascule Mode_Simule, sans changer le contrat de `gemini-proxy`
    - _Requirements: 5.1, 5.3, 5.4, 5.5, 5.6, 5.7, 6.1, 6.3, 6.6, 6.7, 6.8, 6.9, 7.1, 7.2, 7.4, 7.5, 7.7_

  - [-]* 8.2 Écrire les tests unitaires des flux agents
    - Mapping `applyGeminiResult` (champs absents laissés vides), confirmation explicite obligatoire, timeouts/erreurs proxy → Mode_Simule, refus micro
    - Fichier : `src/pages/Transactions.test.jsx`
    - _Requirements: 5.5, 5.6, 6.6, 6.7, 7.4, 4.6_

- [x] 9. Étendre la palette de boutons (`src/styles/buttonPalette.js`)
  - [x] 9.1 Ajouter la paire texte/fond `fab` pour le bouton « Agent vocal »
    - Réutiliser les variables de la Charte_Graphique des boutons existants
    - _Requirements: 10.7_

  - [x]* 9.2 Étendre le test de propriété de contraste à la paire `fab`
    - **Property 25: Contraste accessible du bouton « Agent vocal »**
    - Fichier : `src/styles/buttonContrast.property.test.js`
    - **Validates: Requirements 10.7**

- [x] 10. Créer les composants UI
  - [x] 10.1 Implémenter `src/components/CustomerCard.jsx`
    - Afficher l'identité du client, la liste triée (`sortCustomerOperations`), le total (`countCustomerOperations`) et le formatage (`formatOperationRow`)
    - Cas sans opération : total `0` + message d'absence
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.7_

  - [-]* 10.2 Écrire les tests UI de `CustomerCard`
    - Liste vide (total 0 + message), tri et formatage des lignes
    - Fichier : `src/components/CustomerCard.test.jsx`
    - _Requirements: 9.2, 9.3, 9.4, 9.7_

  - [x] 10.3 Implémenter `src/components/VoiceAgentModal.jsx`
    - Démarrage de l'écoute micro ≤ 2 s ; affichage Transcription puis Confirmation de l'action interprétée avant exécution
    - Refus micro / échec de démarrage : message d'erreur, dashboard inchangé, bascule Mode_Simule
    - Réutiliser `voiceAgent.js` et le flux de confirmation/`applyGeminiResult` ; brancher sur `addTransaction` (AppContext)
    - _Requirements: 5.5, 5.6, 10.4, 10.5, 10.6, 12.1, 12.2_

  - [-]* 10.4 Écrire les tests UI de `VoiceAgentModal`
    - Aucune exécution sans validation explicite ; refus micro → message + état inchangé
    - Fichier : `src/components/VoiceAgentModal.test.jsx`
    - _Requirements: 5.5, 5.6, 10.5, 10.6_

- [x] 11. Intégrer le bouton « Agent vocal » dans `app-header` (`src/App.jsx`)
  - [x] 11.1 Ajouter le bouton et son câblage
    - Ajouter `voice-agent-btn` immédiatement adjacent à « Paramètres » (`settings-fab`), libellé « Agent vocal », clé i18n, état d'ouverture du `VoiceAgentModal`, sans déplacer ni altérer les boutons existants
    - Fichiers : `src/App.jsx`, `src/i18n.js`
    - _Requirements: 10.1, 10.7, 11.3, 11.4_

  - [x] 11.2 Implémenter le positionnement responsive et la barre fixe
    - `@media (max-width: 767.98px)` : cluster en haut à droite, adjacent à Paramètres, sans chevauchement
    - `@media (min-width: 768px)` : liste latérale, ordre existant conservé
    - Conteneur de la Barre_Actions_Dashboard en `position: sticky; top: 0` avec `z-index` élevé
    - Fichier : `src/index.css`
    - _Requirements: 10.2, 10.3, 11.1, 11.2_

  - [-]* 11.3 Écrire les tests d'intégration UI du bouton et de la barre
    - Présence/libellé, rendu responsive (< 768px et ≥ 768px sans chevauchement), barre ancrée et boutons cliquables au scroll, non-régression de l'ordre/comportement des boutons existants
    - Fichier : `src/App.integration.test.jsx`
    - _Requirements: 10.1, 10.2, 10.3, 11.1, 11.2, 11.3, 11.4, 12.6_

- [x] 12. Checkpoint - Vérifier l'intégration UI et contexte
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Implémenter les scripts d'audit (`scripts/audit/`) et le Rapport_Audit
  - [x] 13.1 Module d'audit d'intégrité des calculs
    - Comparer valeurs code/attendues (seuil 0,01) sur `finance.js`/`AppContext.jsx`, produire des findings (fichier, ligne, sévérité `critique`/`majeur`/`mineur`)
    - Recenser les cas d'erreur financière non gérés (fonds insuffisants, montant invalide, portefeuilles identiques, doublon, délai)
    - Fichier : `scripts/audit/calculationsAudit.js`
    - _Requirements: 1.12, 4.7_

  - [x] 13.2 Module d'audit navigation/contrôleurs/sécurité
    - Inventaire route→fonction de contexte pour `wallets`, `transactions`, `expenses`, `loans`, `customers`, `debts` ; état RLS ∈ {Activée, Désactivée, Indéterminée} avec sévérités
    - Fichier : `scripts/audit/securityAudit.js`
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.6_

  - [x] 13.3 Module d'audit de cohérence du schéma
    - Comparer champs/FK/contraintes entre `AppContext.jsx`, `supabase_schema.sql`, `docs/03_Architecture/db_schema.md` ; récapitulatif + verdict
    - Fichier : `scripts/audit/schemaAudit.js`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7_

  - [x]* 13.4 Écrire le test de propriété du verdict de cohérence du schéma
    - **Property 8: Verdict de cohérence du schéma**
    - Fichier : `scripts/audit/schemaAudit.property.test.js`
    - **Validates: Requirements 3.7**

  - [x] 13.5 Module de recensement des erreurs non gérées
    - Recenser localisation + type pour chaque cas d'erreur financière non géré dans `Transactions.jsx`/`AppContext.jsx`
    - Fichier : `scripts/audit/errorsAudit.js`
    - _Requirements: 4.7_

  - [x] 13.6 Script runner générant `docs/Rapport_Audit.md`
    - Agréger les quatre axes, gérer un fichier source illisible (interruption de l'audit concerné, erreur consignée, poursuite des autres), écrire le livrable Markdown structuré
    - Fichier : `scripts/audit/runAudit.js`
    - _Requirements: 1.12, 2.1, 2.4, 3.7, 4.7, 2.6, 3.6_

  - [x]* 13.7 Écrire les tests d'exemple des modules d'audit
    - Findings attendus (sévérité/fichier/ligne) sur entrées construites ; cas du fichier illisible (audit interrompu, autres poursuivis)
    - Fichier : `scripts/audit/audit.test.js`
    - _Requirements: 1.12, 2.2, 2.6, 3.1, 3.2, 3.6, 4.7_

- [x] 14. Validation finale et non-régression
  - [-]* 14.1 Écrire les tests d'acceptation de l'Exigence 12
    - Dictée vocale → Transcription + données d'opération concordantes (12.1) ; rejet si confiance < 80 % ou champ obligatoire absent (12.2) ; extraction reçu + Rattachement_Client (12.3) ; champ illisible/client introuvable → reçu conservé sans opération (12.4) ; reflet dans la Fiche_Client + total incrémenté (12.5)
    - Fichier : `src/finalValidation.test.jsx`
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [x] 14.2 Valider build, suite de tests et non-régression
    - Garde d'authentification (`/app/*` redirige vers `/login` sans utilisateur) ajoutée aux tests d'intégration
    - Exécuter `npm run build` (code de sortie 0) et `npm test` (zéro test en échec), confirmer la conformité Charte_Graphique et l'absence de régression des fonctionnalités du tableau de bord
    - _Requirements: 2.3, 11.5, 11.6, 12.6_

## Notes

- Les tâches marquées `*` sont optionnelles (tests) et peuvent être différées pour un MVP plus rapide ; les tâches non marquées constituent l'implémentation cœur et doivent être réalisées.
- Chaque test de propriété cible une **fonction pure**, utilise **fast-check** (≥ 100 itérations) et la convention de tag `// Feature: financial-ops-audit-voice-agent, Property {n}: ...`.
- Les tâches respectent l'`AGENTS.md` : extension de `finance.js` et mise à jour de `finance.test.js`, réutilisation de `AppContext.jsx`/`Transactions.jsx`/`App.jsx` plutôt que duplication, contrat `gemini-proxy` inchangé.
- Les checkpoints valident la progression de façon incrémentale.
- La dernière tâche (14.2) couvre l'Exigence 11.5/11.6 et, avec 14.1, l'ensemble de l'Exigence 12.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1", "4.1", "5.1", "9.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "3.2", "4.2", "5.2", "9.2", "7.1", "8.1", "10.1", "13.1", "13.2", "13.3", "13.5"] },
    { "id": 2, "tasks": ["1.3", "2.3", "3.3", "4.3", "5.3", "7.2", "8.2", "10.2", "13.4", "13.6"] },
    { "id": 3, "tasks": ["1.4", "2.4", "3.4", "4.4", "5.4", "7.3", "10.3", "13.7"] },
    { "id": 4, "tasks": ["1.5", "3.5", "7.4", "10.4", "11.1"] },
    { "id": 5, "tasks": ["1.6", "3.6", "7.5", "11.2"] },
    { "id": 6, "tasks": ["1.7", "11.3"] },
    { "id": 7, "tasks": ["1.8", "14.1"] },
    { "id": 8, "tasks": ["14.2"] }
  ]
}
```
