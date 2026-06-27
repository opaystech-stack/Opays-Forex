# Requirements Document

## Introduction

Cette fonctionnalité couvre quatre volets liés à l'intégration WhatsApp open-source (OpenWA) de l'application Opays Forex (PWA React + Vite, backend Supabase) :

1. **Audit de l'intégration WhatsApp existante** (entrante) : analyser le comportement actuel (connexion, réception, fiabilité), vérifier la route/le contrôleur et le schéma de la fonction Edge `whatsapp-webhook`, identifier les bugs potentiels (timeout, blocage, files d'attente) et proposer des corrections.
2. **Relances clients via WhatsApp** (nouvelle fonctionnalité centrale) : permettre l'envoi de messages de relance/suivi sortants, déclenchés par commande vocale ou manuellement depuis le tableau de bord, pour trois scénarios (recouvrement de créance, annonces, relances personnalisées), tout en respectant les limites de débit de l'outil open-source et en journalisant chaque envoi dans l'historique du client.
3. **Amélioration de la terminologie bilingue** (français + anglais) : réviser le vocabulaire de l'application pour le secteur Forex / transfert d'argent, remplacer les termes inappropriés (ex. « kiosque » → « point de service », « guichet » ou « agence »), garantir la cohérence entre les deux langues, et appliquer les changements dans `src/i18n.js` et les composants.
4. **Validation finale et non-régression** : garantir que l'outil WhatsApp open-source fonctionne toujours, que les relances déclenchent bien l'envoi, que l'historique est enregistré par client, que les termes inappropriés sont remplacés, et que le tableau de bord et le reste de l'application ne sont pas altérés.

Le système actuel ne dispose d'**aucun mécanisme d'envoi sortant** : l'intégration est entrante uniquement (réception de reçus → extraction Gemini → brouillon de transaction). La nouvelle fonctionnalité introduit ce canal sortant.

## Hypothèses et Questions Ouvertes

Ces points sont documentés pour clarification ultérieure avec l'utilisateur ; ils ne bloquent pas la rédaction des exigences mais peuvent en ajuster certaines.

- **Q1 — Numéro WhatsApp d'envoi** : utiliser le même numéro WhatsApp que la réception entrante, ou un numéro distinct dédié aux relances ? *(Hypothèse par défaut : même numéro/passerelle OpenWA, configurable.)* À confirmer.
- **Q2 — Table `customers`** : l'application possède déjà une table `customers` (id, name, phone) utilisée par les pages Prêts/Clients. L'historique des relances s'y rattachera via une nouvelle table dédiée. À confirmer.
- **Q3 — Recouvrement de créance** : les créances proviennent des tables `loans`/`debts` existantes (champ `due_date`, `status`). À confirmer.
- **Q4 — Termes ciblés du glossaire de remplacement** : la liste exacte des termes à remplacer (au-delà de « kiosque ») sera validée durant la conception.

## Glossary

- **Application** : la PWA Opays Forex (React + Vite) consommée par l'opérateur via le tableau de bord.
- **Passerelle_WhatsApp** : le conteneur Docker OpenWA (`rmyndharis/OpenWA`) hébergé sur un VPS, authentifié par QR code, exposant une API REST et émettant des webhooks.
- **Fonction_Webhook** : la fonction Supabase Edge `supabase/functions/whatsapp-webhook/index.ts` qui reçoit les notifications entrantes d'OpenWA.
- **Service_Envoi** : le nouveau composant sortant chargé d'envoyer des messages via l'API REST de la Passerelle_WhatsApp.
- **Service_Relance** : le composant orchestrant la création, la planification et l'exécution des relances clients.
- **Client** : une entrée de la table `customers` (id, nom, téléphone) destinataire d'une relance.
- **Relance** : un message WhatsApp sortant adressé à un Client (recouvrement, annonce ou message personnalisé).
- **Modele_Message** : un gabarit de texte paramétrable contenant des variables (ex. nom du client, montant dû) résolues à l'envoi.
- **Historique_Relance** : l'enregistrement persistant de chaque Relance envoyée, rattaché à un Client.
- **Agent_Vocal** : l'agent vocal existant (spec `financial-ops-audit-voice-agent`) permettant des commandes par la voix.
- **Tableau_de_Bord** : l'interface utilisateur principale de l'Application (pages dans `src/pages/`).
- **Limite_de_Debit** : le nombre maximal de messages sortants autorisés par unité de temps pour éviter un bannissement WhatsApp.
- **Fichiers_Traduction** : `src/i18n.js` contenant les dictionnaires `fr` et `en`.

---

## Requirements

### Requirement 1: Audit du comportement de l'intégration WhatsApp entrante

**User Story:** En tant que développeur mainteneur, je veux un audit documenté de l'intégration WhatsApp entrante existante, afin de connaître son comportement réel et ses points de fragilité avant d'ajouter le canal sortant.

#### Acceptance Criteria

1. THE Application SHALL produire un rapport d'audit décrivant le flux entrant actuel : réception du webhook, extraction Gemini, et insertion de transaction au statut `draft`.
2. THE Application SHALL documenter la route, le contrôleur et le schéma de données associés à la Fonction_Webhook, en référençant `supabase/functions/whatsapp-webhook/index.ts` et la table `transactions`.
3. THE Application SHALL recenser les mécanismes d'authentification de la Fonction_Webhook, incluant l'usage de `WEBHOOK_SECRET` et de l'en-tête `Authorization`.
4. THE Application SHALL lister les dépendances externes du flux entrant : Passerelle_WhatsApp OpenWA, API Gemini, et Supabase.

### Requirement 2: Identification des bugs et risques de l'intégration entrante

**User Story:** En tant que développeur mainteneur, je veux identifier les bugs et risques de fiabilité de l'intégration entrante, afin de proposer des corrections ciblées.

#### Acceptance Criteria

1. THE Application SHALL identifier les risques de timeout liés aux appels réseau séquentiels (téléchargement de média, appel Gemini, insertion Supabase) de la Fonction_Webhook.
2. IF la vérification du `WEBHOOK_SECRET` est effectivement absente de la Fonction_Webhook, THEN THE Application SHALL signaler cette absence comme risque de sécurité dans le rapport d'audit.
3. IF la Fonction_Webhook reçoit une charge utile (payload) ne correspondant à aucun portefeuille actif, THEN THE Fonction_Webhook SHALL retourner un code d'erreur explicite sans interrompre le traitement des requêtes ultérieures.
4. THE Application SHALL documenter le comportement de la Fonction_Webhook en cas d'erreur Gemini ou d'absence de portefeuille, en précisant le code de réponse retourné.
5. WHERE un bug ou un risque est identifié, THE Application SHALL proposer une correction décrite dans le rapport d'audit.

### Requirement 3: Canal d'envoi WhatsApp sortant

**User Story:** En tant qu'opérateur, je veux que l'application puisse envoyer des messages WhatsApp sortants via la passerelle OpenWA, afin de communiquer avec mes clients.

#### Acceptance Criteria

1. THE Service_Envoi SHALL envoyer un message texte à un numéro de Client via l'API REST de la Passerelle_WhatsApp.
2. WHEN un envoi est demandé, THE Service_Envoi SHALL valider que le numéro de téléphone du Client est présent et au format international avant l'appel à la Passerelle_WhatsApp.
3. IF le numéro de téléphone du Client est absent ou invalide, THEN THE Service_Envoi SHALL rejeter l'envoi et retourner un message d'erreur descriptif.
4. WHEN la Passerelle_WhatsApp confirme l'envoi, THE Service_Envoi SHALL retourner un statut de succès incluant l'identifiant de message fourni par la Passerelle_WhatsApp.
5. IF la Passerelle_WhatsApp confirme l'envoi sans fournir d'identifiant de message, THEN THE Service_Envoi SHALL retourner un statut d'échec.
6. IF la Passerelle_WhatsApp retourne une erreur ou est injoignable, THEN THE Service_Envoi SHALL retourner un statut d'échec incluant la cause de l'erreur.
7. THE Service_Envoi SHALL utiliser un secret d'authentification pour ses appels à la Passerelle_WhatsApp.

### Requirement 4: Respect des limites de débit pour éviter le bannissement

**User Story:** En tant qu'opérateur, je veux que les envois respectent une limite de débit, afin d'éviter que le numéro WhatsApp soit banni par WhatsApp.

#### Acceptance Criteria

1. THE Service_Envoi SHALL limiter le nombre de messages sortants à une Limite_de_Debit configurable par intervalle de temps.
2. WHILE la Limite_de_Debit est atteinte, THE Service_Relance SHALL mettre les envois supplémentaires en file d'attente plutôt que de les rejeter.
3. WHEN un envoi est différé pour cause de Limite_de_Debit, THE Service_Relance SHALL conserver l'ordre de soumission des relances en attente.
4. THE Service_Relance SHALL espacer les envois consécutifs d'un délai minimal configurable.
5. IF un envoi en file d'attente échoue de manière transitoire, THEN THE Service_Relance SHALL le réessayer dans la limite d'un nombre maximal de tentatives configurable.

### Requirement 5: Déclenchement manuel d'une relance depuis le tableau de bord

**User Story:** En tant qu'opérateur, je veux déclencher manuellement une relance vers un client depuis le tableau de bord, afin de relancer un client précis au moment de mon choix.

#### Acceptance Criteria

1. THE Tableau_de_Bord SHALL afficher une action de relance sur un Client.
2. WHEN l'opérateur déclenche une relance manuelle pour un Client, THE Service_Relance SHALL composer le message à partir du Modele_Message ou du texte libre fourni, puis demander l'envoi au Service_Envoi.
3. WHERE l'opérateur saisit un texte libre, THE Service_Relance SHALL envoyer ce texte sans modification de contenu autre que la résolution des variables de Modele_Message.
4. WHERE l'opérateur saisit un texte libre contenant une syntaxe ressemblant à une variable (ex. `{{customer_name}}`), THE Service_Relance SHALL conserver cette syntaxe telle quelle sans la résoudre.
5. WHEN l'envoi manuel aboutit, THE Tableau_de_Bord SHALL afficher une confirmation visuelle à l'opérateur.
6. IF l'envoi manuel échoue, THEN THE Tableau_de_Bord SHALL afficher un message d'erreur indiquant la cause.

### Requirement 6: Déclenchement d'une relance par commande vocale

**User Story:** En tant qu'opérateur, je veux déclencher une relance par commande vocale via l'agent vocal existant, afin de relancer un client sans utiliser les mains.

#### Acceptance Criteria

1. WHEN l'Agent_Vocal interprète une commande de relance désignant un Client, THE Service_Relance SHALL composer la Relance correspondante et demander l'envoi au Service_Envoi.
2. IF la commande vocale ne permet pas de rattacher un Client unique, THEN THE Service_Relance SHALL ne pas envoyer de Relance et signaler l'ambiguïté à l'opérateur.
3. WHEN une Relance déclenchée par la voix est envoyée, THE Service_Relance SHALL enregistrer la source de déclenchement comme « vocale » dans l'Historique_Relance.
4. THE Service_Relance SHALL appliquer aux relances vocales la même Limite_de_Debit que celle appliquée aux relances manuelles.
5. WHEN une commande vocale de relance échoue à cause d'une ambiguïté de Client, THE Service_Relance SHALL comptabiliser cette tentative dans la Limite_de_Debit.

### Requirement 7: Scénario de recouvrement de créance

**User Story:** En tant qu'opérateur, je veux relancer un client pour le recouvrement d'une créance, afin de lui demander un délai de paiement.

#### Acceptance Criteria

1. WHEN une relance de recouvrement est déclenchée pour un Client ayant une créance, THE Service_Relance SHALL résoudre dans le message le nom du Client et le montant dû.
2. THE Service_Relance SHALL rattacher la relance de recouvrement à la créance concernée issue des données `loans`/`debts`.
3. IF aucun montant dû n'est disponible pour le Client, THEN THE Service_Relance SHALL ne pas envoyer une relance de recouvrement référençant un montant.

### Requirement 8: Scénario d'annonce collective

**User Story:** En tant qu'opérateur, je veux envoyer une annonce à plusieurs clients (promotions, changements de tarif, informations collectives), afin de diffuser une information commune.

#### Acceptance Criteria

1. WHEN l'opérateur déclenche une annonce vers un ensemble de Clients sélectionnés, THE Service_Relance SHALL créer une Relance pour chaque Client de l'ensemble.
2. THE Service_Relance SHALL soumettre les relances d'annonce au Service_Envoi en respectant la Limite_de_Debit.
3. THE Service_Relance SHALL enregistrer une entrée d'Historique_Relance distincte pour chaque Client destinataire de l'annonce.
4. IF l'envoi à un Client de l'ensemble échoue, THEN THE Service_Relance SHALL poursuivre l'envoi aux autres Clients de l'ensemble.

### Requirement 9: Scénario de relance personnalisée

**User Story:** En tant qu'opérateur, je veux envoyer une relance personnalisée adaptée à un client, afin que le message intègre ses informations propres (nom, montant, etc.).

#### Acceptance Criteria

1. THE Modele_Message SHALL prendre en charge des variables incluant au minimum le nom du Client et le montant dû.
2. WHEN une Relance personnalisée est composée, THE Service_Relance SHALL remplacer chaque variable du Modele_Message par la valeur correspondante du Client.
3. IF une variable optionnelle du Modele_Message n'a pas de valeur correspondante pour le Client, THEN THE Service_Relance SHALL remplacer cette variable par une valeur de repli définie plutôt que d'envoyer le marqueur de variable brut.

### Requirement 10: Configuration des messages (modèle ou texte libre)

**User Story:** En tant qu'opérateur, je veux configurer les messages de relance par modèle réutilisable ou par texte libre, afin d'adapter la communication à chaque situation.

#### Acceptance Criteria

1. THE Application SHALL permettre à l'opérateur de choisir entre un Modele_Message prédéfini et un texte libre lors de la composition d'une Relance.
2. THE Application SHALL permettre à l'opérateur de créer et d'enregistrer un Modele_Message réutilisable.
3. WHERE un Modele_Message est sélectionné, THE Service_Relance SHALL résoudre ses variables avant l'envoi.
4. IF la résolution d'une variable obligatoire d'un Modele_Message échoue par manque de données ou erreur système, THEN THE Service_Relance SHALL bloquer l'envoi tant que toutes les variables ne sont pas résolues.
5. THE Application SHALL prendre en charge les Modele_Message en français et en anglais.

### Requirement 11: Journalisation de l'historique des relances par client

**User Story:** En tant qu'opérateur, je veux que chaque envoi de relance soit journalisé dans l'historique du client, afin de garder une trace de toutes les communications.

#### Acceptance Criteria

1. WHEN une Relance est envoyée, THE Service_Relance SHALL créer une entrée d'Historique_Relance rattachée au Client.
2. THE Historique_Relance SHALL enregistrer pour chaque Relance : l'identifiant du Client, le contenu du message envoyé, l'horodatage, la source de déclenchement (manuelle ou vocale) et le statut d'envoi.
3. WHEN un envoi échoue, THE Service_Relance SHALL enregistrer une entrée d'Historique_Relance avec le statut d'échec et la cause.
4. IF l'enregistrement de l'Historique_Relance échoue, THEN THE Service_Relance SHALL tout de même procéder à l'envoi de la Relance.
5. THE Tableau_de_Bord SHALL afficher l'Historique_Relance d'un Client donné.
6. THE Historique_Relance SHALL appliquer les politiques RLS de Supabase cohérentes avec les autres tables de l'Application.

### Requirement 12: Choix du numéro WhatsApp d'envoi

**User Story:** En tant qu'opérateur, je veux paramétrer quel numéro WhatsApp est utilisé pour les relances, afin de séparer ou non les communications entrantes et sortantes.

#### Acceptance Criteria

1. THE Application SHALL permettre de configurer l'adresse de la Passerelle_WhatsApp utilisée par le Service_Envoi via une variable d'environnement.
2. WHERE une passerelle d'envoi distincte de la passerelle entrante est configurée, THE Service_Envoi SHALL utiliser la passerelle d'envoi configurée.
3. WHERE aucune passerelle d'envoi distincte n'est configurée, THE Service_Envoi SHALL utiliser la même Passerelle_WhatsApp que le flux entrant.

### Requirement 13: Amélioration de la terminologie bilingue

**User Story:** En tant qu'utilisateur, je veux un vocabulaire simple et professionnel adapté au secteur Forex / transfert d'argent, afin de mieux comprendre l'application dans les deux langues.

#### Acceptance Criteria

1. THE Application SHALL remplacer le terme « kiosque » par un terme professionnel adapté au contexte (« point de service », « guichet » ou « agence ») dans les Fichiers_Traduction.
2. THE Fichiers_Traduction SHALL fournir une traduction française et une traduction anglaise pour chaque clé de texte visible.
3. THE Fichiers_Traduction SHALL utiliser une terminologie cohérente entre le français et l'anglais pour un même concept.
4. WHERE un terme technique inapproprié est identifié, THE Application SHALL le remplacer par un terme plus simple conservant le sens métier.
5. THE Application SHALL appliquer les changements de terminologie dans les Fichiers_Traduction et dans les composants affichant ces textes.

### Requirement 14: Non-régression de l'application existante

**User Story:** En tant qu'opérateur, je veux que les fonctionnalités existantes restent intactes, afin que l'ajout des relances et les changements de terminologie ne cassent rien.

#### Acceptance Criteria

1. WHEN un message WhatsApp entrant est reçu après la mise en œuvre de la fonctionnalité, THE Fonction_Webhook SHALL continuer à créer une transaction au statut `draft` comme avant.
2. THE Tableau_de_Bord SHALL conserver la structure et la navigation des pages existantes dans `src/pages/`.
3. THE Application SHALL conserver le comportement des soldes de portefeuilles et des calculs financiers existants définis dans `src/utils/finance.js`.
4. WHEN la suite de tests unitaires existante est exécutée, THE Application SHALL passer tous les tests qui passaient avant la mise en œuvre de la fonctionnalité.
5. THE Application SHALL conserver le fonctionnement de l'Agent_Vocal pour ses commandes existantes hors relances.

### Requirement 15: Critères de validation finale

**User Story:** En tant que responsable produit, je veux des critères de validation finale clairs, afin de confirmer que l'ensemble de la fonctionnalité est conforme.

#### Acceptance Criteria

1. WHEN la validation finale est exécutée, THE Application SHALL démontrer que l'intégration WhatsApp entrante open-source fonctionne correctement.
2. WHEN une relance manuelle ou vocale est déclenchée durant la validation, THE Service_Relance SHALL déclencher l'envoi du message WhatsApp via le Service_Envoi.
3. WHEN une relance est envoyée durant la validation, THE Historique_Relance SHALL contenir l'enregistrement correspondant rattaché au Client.
4. WHEN la validation finale est exécutée, THE Application SHALL démontrer que les termes inappropriés identifiés ont été remplacés par des termes plus simples et professionnels.
5. WHEN la validation finale est exécutée, THE Tableau_de_Bord et les autres fonctionnalités existantes SHALL fonctionner sans régression.
