# Requirements Document

## Introduction

Ce document décrit les exigences pour un chantier en cinq axes portant sur l'application OpaysFox (PWA React + Vite de suivi forex/trésorerie multi-devises, données Supabase) :

1. **Audit d'intégrité** des opérations financières (Transactions d'échange, Renforcement de capital, Prélèvements) couvrant la navigation/sécurité, les schémas de données, l'exactitude des calculs et la gestion des erreurs.
2. **Audit des trois agents IA existants** : saisie vocale, capture photo (OCR de reçu/facture) et capture de fichier (PDF/Image).
3. **Corrections et fiabilisation** : déduplication/rattachement client avant enregistrement, et historique détaillé par client.
4. **Nouvelle fonctionnalité** : un bouton « Agent vocal » dans le tableau de bord, positionné de façon responsive, intégré sans régression ni rupture de la charte graphique.
5. **Validation finale** : critères d'acceptation testables couvrant la capture vocale, l'extraction photo/fichier, la mise à jour de l'historique client et l'intégration non-régressive du bouton.

Le périmètre respecte l'architecture existante : logique financière dans `src/utils/finance.js`, contexte global dans `src/context/AppContext.jsx` (dont `findOrCreateCustomer`), page des opérations `src/pages/Transactions.jsx`, tableau de bord `src/pages/Dashboard.jsx`, et fonctions edge `gemini-proxy` / `whatsapp-webhook`.

## Glossary

- **Système** : L'application OpaysFox (front-end React/Vite et fonctions edge Supabase associées).
- **Operation_Financiere** : Toute opération enregistrée dans la table `transactions` de type `exchange` (échange/transfert), `deposit` (renforcement de capital) ou `withdrawal` (prélèvement), ainsi que les dépenses (`expenses`) et prêts (`loans`).
- **Portefeuille** : Compte ou caisse (`wallets`) caractérisé par une devise, un type (`cash` ou `mobile_money`) et un solde.
- **Agent_Vocal** : Composant IA qui capture un enregistrement audio, le transcrit et en extrait une intention d'opération ou de recherche.
- **Agent_Photo** : Composant IA qui analyse une photo de reçu/facture et en extrait les données structurées.
- **Agent_Fichier** : Composant IA qui traite un fichier PDF ou image téléchargé et en extrait les données structurées.
- **Gemini_Proxy** : Fonction edge Supabase `gemini-proxy` qui relaie les appels au modèle Gemini selon le `kind` (`ocr`, `audio`, etc.).
- **Mode_Simule** : Comportement de repli (fallback) activé quand Supabase ou la clé Gemini sont indisponibles, retournant des données factices.
- **Client** : Enregistrement de la table `customers` (nom, téléphone), rattachable à une opération via `customer_id`.
- **Fiche_Client** : Vue agrégée d'un client comprenant ses données d'identité, la liste détaillée de ses opérations et le nombre total d'opérations.
- **Rattachement_Client** : Action de relier une opération à un client existant ou nouvellement créé via `findOrCreateCustomer`.
- **Transcription** : Texte produit par l'Agent_Vocal à partir de l'audio capté.
- **Confirmation** : Étape durant laquelle le Système présente à l'opérateur les données extraites avant enregistrement définitif.
- **Barre_Actions_Dashboard** : Barre de boutons du tableau de bord (en haut à droite sur mobile, sur la barre latérale gauche sur PC) contenant les actions existantes dont « Paramètres ».
- **Charte_Graphique** : Ensemble des variables de style existantes (couleurs `var(--...)`, espacements, typographie) définies dans les feuilles de style de l'application.
- **Operateur** : Utilisateur authentifié du kiosque qui réalise les opérations.
- **Rapport_Audit** : Document livrable consignant les constats de l'audit (axes 1 et 2) avec sévérité et localisation.

## Requirements

### Exigence 1 : Audit de l'intégrité des calculs des opérations financières

**User Story:** En tant qu'Opérateur, je veux que les calculs des opérations financières (taux, frais, soldes, profit) soient exacts et cohérents, afin que ma trésorerie reflète fidèlement la réalité.

#### Acceptance Criteria

1. WHEN une opération de type `exchange` est enregistrée avec un `source_amount` strictement positif (supérieur à 0), THE Système SHALL calculer le `exchange_rate` égal à `dest_amount` divisé par `source_amount`, arrondi à 6 décimales (arrondi au plus proche, demi vers le haut).
2. IF une opération de type `exchange` est enregistrée avec un `source_amount` inférieur ou égal à 0, THEN THE Système SHALL rejeter l'opération, ne calculer aucun `exchange_rate`, laisser inchangés tous les soldes de Portefeuilles et retourner un message d'erreur indiquant que le montant source doit être strictement positif.
3. WHEN une opération de type `exchange` est enregistrée, THE Système SHALL calculer le `profit_usd` égal à la valeur USD du `source_amount` moins la valeur USD du `dest_amount`, chaque valeur USD étant obtenue à partir du taux `rate_to_usd` stocké pour la devise concernée au moment de l'enregistrement, le résultat étant arrondi à 2 décimales (arrondi au plus proche, demi vers le haut).
4. WHEN une opération de type `exchange` au statut `completed` est enregistrée, THE Système SHALL débiter le Portefeuille source de `source_amount` et créditer le Portefeuille destination de `dest_amount`, chaque solde résultant étant arrondi à 2 décimales.
5. WHEN une opération de type `deposit` au statut `completed` est enregistrée, THE Système SHALL créditer uniquement le Portefeuille destination du montant déposé, arrondi à 2 décimales, sans modifier aucun Portefeuille source.
6. WHEN une opération de type `withdrawal` au statut `completed` est enregistrée, THE Système SHALL débiter uniquement le Portefeuille source du montant prélevé, arrondi à 2 décimales, sans modifier aucun Portefeuille destination.
7. IF une opération au statut `completed` entraînerait un solde de Portefeuille source strictement négatif (inférieur à 0), THEN THE Système SHALL rejeter l'opération, laisser inchangés tous les soldes de Portefeuilles et retourner un message d'erreur indiquant que le solde disponible est insuffisant.
8. WHEN une opération comporte des frais strictement positifs (supérieurs à 0) associés à un Portefeuille de frais, THE Système SHALL débiter ce Portefeuille de frais du montant des frais, arrondi à 2 décimales.
9. WHILE une opération est au statut `draft`, THE Système SHALL laisser inchangés les soldes de tous les Portefeuilles.
10. WHEN une devise possède un taux de change `rate_to_usd` défini et strictement positif (supérieur à 0), THE Système SHALL convertir un montant vers l'USD en divisant le montant par `rate_to_usd`, le résultat étant arrondi à 2 décimales (arrondi au plus proche, demi vers le haut).
11. IF une devise impliquée dans une conversion possède un `rate_to_usd` nul, négatif ou non défini, THEN THE Système SHALL ne produire aucune valeur USD pour cette devise et retourner un message d'erreur indiquant que le taux de change de la devise est invalide ou manquant.
12. THE Système SHALL produire un Rapport_Audit recensant chaque écart constaté entre la logique implémentée dans `src/utils/finance.js` ou `src/context/AppContext.jsx` et les règles de calcul attendues, un écart étant constaté lorsque la différence absolue entre la valeur calculée par le code et la valeur attendue dépasse 0,01 unité monétaire, chaque entrée précisant le chemin du fichier, le numéro de ligne et un niveau de sévérité parmi `critique` (écart sur solde ou profit), `majeur` (écart sur taux ou frais) ou `mineur` (écart d'arrondi inférieur ou égal à 0,01).

### Exigence 2 : Audit de la navigation, des contrôleurs et de la sécurité

**User Story:** En tant qu'Opérateur, je veux que chaque écran d'opération financière soit correctement relié à sa logique et protégé, afin d'éviter les accès non autorisés et les actions incohérentes.

#### Acceptance Criteria

1. THE Système SHALL recenser dans le Rapport_Audit, pour chaque route/écran d'opération financière rattaché aux tables `wallets`, `transactions`, `expenses`, `loans`, `customers` et `debts`, l'identifiant de la route et le nom de la fonction du contexte applicatif qui traite ses actions.
2. IF une route d'opération financière déclenche une action sans fonction de traitement correspondante, THEN THE Système SHALL consigner cet écart dans le Rapport_Audit avec l'identifiant de la route concernée et une sévérité prise dans l'ensemble fini {Critique, Élevée, Moyenne, Faible}.
3. WHILE l'Operateur n'est pas authentifié et que Supabase est configuré, THE Système SHALL empêcher l'accès aux données des opérations financières en redirigeant vers l'écran d'authentification et en ne renvoyant aucune donnée financière.
4. THE Système SHALL consigner dans le Rapport_Audit, pour chacune des tables `wallets`, `transactions`, `expenses`, `loans`, `customers` et `debts`, l'état des politiques de sécurité au niveau des lignes (RLS) sous la forme d'une valeur prise dans l'ensemble fini {Activée, Désactivée, Indéterminée}.
5. WHERE une table financière parmi `wallets`, `transactions`, `expenses`, `loans`, `customers` et `debts` est dépourvue de politique de sécurité au niveau des lignes (RLS), THE Système SHALL signaler cette absence dans le Rapport_Audit avec le nom de la table et une sévérité Critique.
6. IF le Système ne parvient pas à déterminer l'état RLS d'une table financière, THEN THE Système SHALL consigner dans le Rapport_Audit l'état Indéterminée pour cette table avec une indication d'échec de vérification, sans interrompre l'audit des autres tables.

### Exigence 3 : Audit de la cohérence du schéma de données

**User Story:** En tant qu'Opérateur, je veux que les modèles de données et leurs relations soient valides et cohérents entre le code et le schéma, afin de prévenir les incohérences d'enregistrement.

#### Acceptance Criteria

1. THE Système SHALL comparer, pour chaque champ d'opération manipulé dans `src/context/AppContext.jsx`, sa présence parmi les colonnes définies dans `supabase_schema.sql` et dans `docs/03_Architecture/db_schema.md`, et SHALL consigner pour chaque champ comparé un résultat de correspondance explicite (présent dans les deux sources / absent d'au moins une source) dans le Rapport_Audit.
2. IF un champ d'opération utilisé dans le code est absent de `supabase_schema.sql` ou de `docs/03_Architecture/db_schema.md`, THEN THE Système SHALL consigner dans le Rapport_Audit un écart identifiant le nom du champ, le fichier source (`src/context/AppContext.jsx`) et le fichier de référence dans lequel la colonne est manquante.
3. THE Système SHALL vérifier que chaque clé étrangère d'opération (`source_wallet_id`, `dest_wallet_id`, `fee_wallet_id`, `customer_id`) référence une table existante définie dans `supabase_schema.sql`.
4. IF une contrainte du schéma — contrôle de montant strictement positif (`source_amount > 0`, `dest_amount > 0`, `amount > 0`), frais non négatifs (`fee >= 0`), statut limité aux valeurs `completed` ou `draft`, ou unicité du couple (`currency`, `date`) — est absente ou divergente entre `supabase_schema.sql` et `docs/03_Architecture/db_schema.md`, THEN THE Système SHALL consigner dans le Rapport_Audit un écart identifiant la contrainte concernée, sa valeur attendue et la source divergente.
5. IF une clé étrangère d'opération ne référence aucune table existante dans `supabase_schema.sql`, THEN THE Système SHALL consigner dans le Rapport_Audit un écart identifiant le nom de la clé étrangère et la table cible attendue.
6. IF un fichier source ou de référence (`src/context/AppContext.jsx`, `supabase_schema.sql`, `docs/03_Architecture/db_schema.md`) est introuvable ou illisible, THEN THE Système SHALL interrompre l'audit concerné et consigner dans le Rapport_Audit une erreur indiquant le fichier en cause, sans produire de résultat de correspondance pour ce fichier.
7. WHEN l'audit de cohérence du schéma est terminé, THE Système SHALL consigner dans le Rapport_Audit un récapitulatif indiquant le nombre total d'écarts détectés et un verdict global (cohérent si zéro écart, sinon incohérent).

### Exigence 4 : Gestion des erreurs des opérations financières

**User Story:** En tant qu'Opérateur, je veux que les cas d'erreur financière soient détectés et signalés clairement, afin d'éviter des enregistrements erronés ou des doublons.

#### Acceptance Criteria

1. IF une opération de type `exchange` ou `withdrawal` au statut `completed` débiterait un Portefeuille source au-delà de son solde disponible, THEN THE Système SHALL afficher un message d'erreur indiquant des fonds insuffisants ainsi que le solde disponible et le montant demandé, SHALL refuser d'enregistrer l'opération et SHALL conserver inchangé le solde du Portefeuille source.
2. IF un montant `source_amount` ou `dest_amount` requis est absent, nul, négatif, non numérique, inférieur à 0,01 ou supérieur à 999 999 999,99, THEN THE Système SHALL afficher un message d'erreur de validation identifiant le champ concerné et SHALL refuser d'enregistrer l'opération.
3. IF une opération de type `exchange` désigne le même Portefeuille en source et en destination, THEN THE Système SHALL afficher un message d'erreur indiquant que les Portefeuilles source et destination doivent être distincts et SHALL refuser d'enregistrer l'opération.
4. IF une opération comporte un `transaction_id` réseau identique à celui d'une opération déjà enregistrée, THEN THE Système SHALL afficher à l'Opérateur un avertissement de doublon potentiel mentionnant l'opération existante et SHALL suspendre l'enregistrement jusqu'à confirmation ou annulation explicite par l'Opérateur.
5. WHILE l'enregistrement d'une opération en doublon est suspendu, IF l'Opérateur annule l'opération, THEN THE Système SHALL refuser l'enregistrement et SHALL conserver inchangée l'opération existante.
6. IF un appel au Gemini_Proxy dépasse un délai d'attente de 10 secondes ou retourne une erreur, THEN THE Système SHALL afficher un message d'erreur indiquant l'échec de la communication avec le Gemini_Proxy et SHALL basculer en Mode_Simule sans interrompre la session en cours.
7. THE Système SHALL recenser dans le Rapport_Audit chaque cas d'erreur financière non géré (fonds insuffisants, montant invalide, Portefeuilles identiques, doublon, dépassement de délai) identifié dans le code existant, en indiquant pour chacun la localisation dans le code et le type d'erreur.

### Exigence 5 : Agent de saisie vocale (audit + fiabilisation)

**User Story:** En tant qu'Operateur, je veux dicter une commande vocale en contexte forex et qu'elle soit transcrite et convertie en action d'opération, afin de saisir une opération sans clavier.

#### Acceptance Criteria

1. WHEN l'Operateur termine un enregistrement vocal d'une durée comprise entre 1 et 120 secondes, THE Agent_Vocal SHALL transmettre l'audio au Gemini_Proxy avec le `kind` `audio` dans un délai maximal de 2 secondes après la fin de l'enregistrement et SHALL produire une Transcription.
2. IF la réponse de transcription du Gemini_Proxy n'est pas reçue dans un délai de 30 secondes, THEN THE Système SHALL interrompre l'attente, SHALL afficher un message d'erreur indiquant l'expiration du délai de transcription et SHALL basculer en Mode_Simule sans enregistrer d'opération.
3. WHEN le Gemini_Proxy retourne des données d'opération structurées, THE Agent_Vocal SHALL renseigner le type d'opération, les Portefeuilles source et destination, les montants (valeurs comprises entre 0,01 et 999 999 999,99), les frais (valeur comprise entre 0 et 999 999 999,99) et l'identifiant réseau dans le formulaire d'opération.
4. IF une ou plusieurs des données d'opération obligatoires (type d'opération, Portefeuille source, Portefeuille destination, montant source, montant destination) sont absentes ou hors des bornes définies, THEN THE Système SHALL laisser le champ concerné vide, SHALL signaler visuellement chaque champ manquant ou invalide et SHALL exiger une correction manuelle avant toute Confirmation.
5. WHEN l'Agent_Vocal a extrait des données d'opération, THE Système SHALL présenter une Confirmation à l'Operateur affichant l'intégralité des champs pré-remplis et SHALL conditionner tout enregistrement définitif à une validation explicite de l'Operateur.
6. IF l'accès au microphone est refusé, THEN THE Système SHALL afficher un message explicite indiquant l'absence d'autorisation du microphone et SHALL basculer en Mode_Simule.
7. IF le Gemini_Proxy retourne une réponse vide ou non analysable, THEN THE Système SHALL afficher un message d'erreur indiquant l'échec de l'analyse de la réponse, SHALL conserver la Transcription disponible pour consultation et SHALL basculer en Mode_Simule sans enregistrer d'opération.
8. WHEN l'Agent_Vocal détecte exactement un nom ou un numéro de téléphone de Client correspondant à une fiche unique dans la Transcription, THE Système SHALL exécuter le Rattachement_Client avant l'enregistrement de l'opération.
9. IF la détection d'un Client dans la Transcription ne correspond à aucune fiche ou correspond à plusieurs fiches, THEN THE Système SHALL afficher un message indiquant l'absence de correspondance unique et SHALL demander à l'Operateur de sélectionner ou de confirmer manuellement le Client avant l'enregistrement de l'opération.

### Exigence 6 : Agent de capture photo (audit + fiabilisation)

**User Story:** En tant qu'Operateur, je veux photographier une facture ou un reçu et voir les données extraites automatiquement, afin d'enregistrer une opération sans saisie manuelle.

#### Acceptance Criteria

1. WHEN l'Operateur capture une photo de reçu/facture au format JPEG ou PNG d'une taille maximale de 10 Mo, THE Agent_Photo SHALL transmettre l'image au Gemini_Proxy avec le `kind` `ocr` dans un délai maximal de 30 secondes.
2. IF l'image capturée n'est pas au format JPEG ou PNG, ou dépasse 10 Mo, THEN THE Agent_Photo SHALL rejeter la capture et SHALL afficher un message d'erreur indiquant le format et la taille maximale acceptés, sans transmission au Gemini_Proxy.
3. WHEN le Gemini_Proxy retourne des données structurées, THE Agent_Photo SHALL extraire le nom du Client, le numéro de téléphone du Client et l'identifiant de transaction.
4. IF le Gemini_Proxy ne retourne aucune réponse dans un délai de 30 secondes, THEN THE Système SHALL afficher un message d'erreur indiquant l'expiration du délai et SHALL basculer en Mode_Simule.
5. WHEN l'Agent_Photo a extrait un nom ou un numéro de téléphone de Client, THE Système SHALL exécuter le Rattachement_Client avant l'enregistrement de l'opération.
6. WHEN l'Agent_Photo a extrait les données d'opération, THE Système SHALL présenter une Confirmation à l'Operateur, et SHALL permettre à l'Operateur de valider, modifier ou rejeter ces données avant l'enregistrement définitif.
7. IF l'Operateur rejette les données présentées dans la Confirmation, THEN THE Système SHALL annuler l'enregistrement de l'opération et SHALL conserver les données extraites pour modification, sans aucune écriture définitive.
8. IF la réponse du Gemini_Proxy est entourée de balises markdown, THEN THE Système SHALL retirer ces balises avant l'analyse du JSON.
9. IF le Gemini_Proxy retourne une erreur ou une réponse non analysable, THEN THE Système SHALL afficher un message d'erreur indiquant l'échec de l'extraction et SHALL basculer en Mode_Simule.

### Exigence 7 : Agent de capture de fichier (audit + fiabilisation)

**User Story:** En tant qu'Operateur, je veux téléverser un fichier PDF ou image de reçu et voir les données extraites, afin d'enregistrer une opération à partir d'un document existant.

#### Acceptance Criteria

1. WHEN l'Operateur téléverse un fichier dont le type MIME est application/pdf, image/jpeg ou image/png et dont la taille n'excède pas 10 Mo, THE Agent_Fichier SHALL transmettre le fichier au Gemini_Proxy avec le type MIME correspondant au fichier.
2. WHEN le Gemini_Proxy retourne des données structurées, THE Agent_Fichier SHALL extraire le nom du Client, le numéro de téléphone du Client et l'identifiant de transaction selon le même format que l'Agent_Photo, et SHALL laisser vide tout champ absent de la réponse.
3. WHEN l'Agent_Fichier a extrait un nom ou un numéro de téléphone de Client, THE Système SHALL exécuter le Rattachement_Client avant l'enregistrement de l'opération.
4. WHEN l'Agent_Fichier a extrait les données d'opération, THE Système SHALL présenter une Confirmation à l'Operateur avant l'enregistrement définitif.
5. IF la réponse du Gemini_Proxy est entourée de balises markdown, THEN THE Système SHALL retirer ces balises avant l'analyse du JSON.
6. IF le fichier téléversé a un type MIME différent de application/pdf, image/jpeg et image/png, ou si sa taille dépasse 10 Mo, THEN THE Système SHALL afficher un message d'erreur indiquant le format ou la taille non pris en charge, SHALL refuser le traitement et SHALL conserver la session sans transmettre le fichier au Gemini_Proxy.
7. IF le Gemini_Proxy dépasse un délai d'attente de 30 secondes, retourne une erreur ou retourne une réponse non analysable, THEN THE Système SHALL afficher un message d'erreur explicite et SHALL basculer en Mode_Simule sans interrompre la session.

### Exigence 8 : Déduplication et rattachement client avant enregistrement

**User Story:** En tant qu'Operateur, je veux que le Système vérifie l'existence d'un Client avant d'enregistrer une opération, afin de regrouper les opérations sous un dossier unique sans doublon.

#### Acceptance Criteria

1. WHEN une opération est sur le point d'être enregistrée avec un nom ou un numéro de téléphone de Client, THE Système SHALL rechercher un Client existant correspondant en comparant d'abord par numéro de téléphone normalisé, puis, en l'absence de correspondance par téléphone, par nom normalisé.
2. WHEN un seul Client existant correspondant est trouvé, THE Système SHALL rattacher l'opération à ce Client existant sans créer de nouvel enregistrement Client.
3. WHEN aucun Client correspondant n'est trouvé et qu'un nom ou un numéro de téléphone est fourni, THE Système SHALL créer un nouveau Client puis rattacher l'opération à ce Client.
4. IF ni nom ni numéro de téléphone de Client ne sont fournis, THEN THE Système SHALL enregistrer l'opération sans rattachement de Client.
5. WHEN la comparaison des numéros de téléphone est effectuée, THE Système SHALL supprimer tous les caractères d'espacement des deux numéros avant comparaison, de sorte que deux numéros ne différant que par leurs espaces soient considérés comme identiques.
6. WHEN la comparaison des noms est effectuée, THE Système SHALL ignorer la casse et supprimer les espaces de début et de fin des deux noms avant comparaison.
7. IF plusieurs Clients existants correspondent au critère de recherche, THEN THE Système SHALL rattacher l'opération au Client correspondant par numéro de téléphone normalisé en priorité, et à défaut au Client dont la date de création est la plus ancienne, sans créer de nouvel enregistrement Client.
8. IF la création d'un nouveau Client échoue, THEN THE Système SHALL annuler l'enregistrement de l'opération, conserver les données saisies sans perte, et présenter un message d'erreur indiquant l'échec de la création du Client.

### Exigence 9 : Historique détaillé par client

**User Story:** En tant qu'Operateur, je veux consulter pour chaque Client la liste détaillée de ses opérations et leur nombre total, afin de suivre la relation commerciale.

#### Acceptance Criteria

1. WHEN une opération rattachée à un Client est enregistrée, THE Système SHALL ajouter cette opération à l'historique de la Fiche_Client correspondante en moins de 2 secondes après l'enregistrement.
2. THE Fiche_Client SHALL présenter, pour chaque opération, sa date au format JJ/MM/AAAA, son montant avec deux décimales et son type.
3. THE Fiche_Client SHALL afficher le nombre total d'opérations rattachées au Client sous forme d'un entier compris entre 0 et 999 999.
4. IF un Client ne possède aucune opération rattachée, THEN THE Fiche_Client SHALL afficher un nombre total égal à 0 et un message indiquant l'absence d'opération.
5. WHEN une opération est enregistrée via l'Agent_Vocal pour un Client identifié, THE Système SHALL mettre à jour l'historique et le nombre total d'opérations de la Fiche_Client de ce Client en moins de 2 secondes après l'enregistrement.
6. IF une opération est enregistrée via l'Agent_Vocal sans Client identifié, THEN THE Système SHALL ne modifier aucune Fiche_Client et signaler un message indiquant que le Client n'a pas été identifié.
7. THE Fiche_Client SHALL présenter les opérations triées par date décroissante, de la plus récente à la plus ancienne, les opérations de même date étant départagées par leur ordre d'enregistrement décroissant.

### Exigence 10 : Bouton « Agent vocal » du tableau de bord — intégration et positionnement responsive

**User Story:** En tant qu'Operateur, je veux un bouton « Agent vocal » dans le tableau de bord à côté des actions existantes, afin de lancer l'agent vocal directement depuis l'accueil.

#### Acceptance Criteria

1. THE Système SHALL afficher un bouton « Agent vocal » portant le libellé visible « Agent vocal » dans la Barre_Actions_Dashboard du tableau de bord, sur tout type d'affichage.
2. WHILE la largeur de la fenêtre d'affichage est strictement inférieure à 768 pixels (mode mobile), THE Système SHALL positionner le bouton « Agent vocal » dans la zone supérieure droite de la Barre_Actions_Dashboard, immédiatement adjacent au bouton « Paramètres » et aux autres boutons existants, sans en chevaucher aucun.
3. WHILE la largeur de la fenêtre d'affichage est supérieure ou égale à 768 pixels (mode bureau), THE Système SHALL positionner le bouton « Agent vocal » dans la barre latérale gauche de la Barre_Actions_Dashboard, dans la liste des boutons existants, sans en chevaucher aucun.
4. WHEN l'Operateur active le bouton « Agent vocal », THE Système SHALL démarrer l'Agent_Vocal en mode écoute en 2 secondes ou moins, l'Agent_Vocal permettant de dicter une opération ou une recherche d'historique.
5. IF l'Agent_Vocal ne peut pas démarrer dans le délai de 2 secondes ou si l'autorisation d'accès au microphone est refusée, THEN THE Système SHALL afficher à l'Operateur un message d'erreur indiquant la cause de l'échec et SHALL conserver le tableau de bord dans son état antérieur sans interruption.
6. WHEN l'Agent_Vocal lancé depuis le tableau de bord produit une Transcription, THE Système SHALL afficher la Transcription textuelle à l'Operateur, puis SHALL afficher une Confirmation présentant l'action interprétée et attendant une réponse explicite (validation ou annulation) de l'Operateur avant toute exécution.
7. THE bouton « Agent vocal » SHALL utiliser les variables de la Charte_Graphique (couleurs, espacements, typographie) employées par les boutons existants de la Barre_Actions_Dashboard.

### Exigence 11 : Barre d'actions fixe au défilement et non-régression du tableau de bord

**User Story:** En tant qu'Operateur, je veux que les boutons du haut restent accessibles et que le tableau de bord existant continue de fonctionner, afin de ne perdre ni ergonomie ni fonctionnalité.

#### Acceptance Criteria

1. WHILE l'Operateur fait défiler le contenu du tableau de bord sur n'importe quelle position de défilement (du début à la fin du contenu), THE Système SHALL maintenir la Barre_Actions_Dashboard ancrée en haut de la zone d'affichage (viewport) sans qu'elle disparaisse ni ne se déplace hors de l'écran.
2. WHILE la Barre_Actions_Dashboard est affichée pendant le défilement, THE Système SHALL conserver l'ensemble de ses boutons entièrement visibles et activables (cliquables) sans chevauchement avec le contenu défilant du tableau de bord.
3. THE Système SHALL conserver le fonctionnement de l'ensemble des fonctionnalités existantes du tableau de bord (patrimoine, gains, soldes des Portefeuilles, brouillons, recherche, détail d'opération) à l'identique de leur comportement avant l'ajout du bouton « Agent vocal », sans suppression ni altération d'une de ces fonctionnalités.
4. WHEN le bouton « Agent vocal » est ajouté à la Barre_Actions_Dashboard, THE Système SHALL conserver inchangés la position, l'ordre et le comportement des boutons existants, dont « Paramètres ».
5. THE Système SHALL terminer la commande `npm run build` avec un code de sortie 0 (succès, sans erreur) après l'ajout du bouton « Agent vocal ».
6. THE Système SHALL terminer l'exécution de `npm test` avec la totalité des tests existants réussis (zéro test en échec) après les modifications.

### Exigence 12 : Validation finale des critères d'acceptation

**User Story:** En tant qu'Operateur, je veux une validation finale vérifiable des quatre comportements clés, afin de confirmer que le chantier atteint ses objectifs.

#### Acceptance Criteria

1. WHEN une commande vocale d'opération est dictée à l'Agent_Vocal, THE Système SHALL produire dans un délai maximum de 10 secondes une Transcription textuelle et un enregistrement de données d'opération dont les champs (type d'opération, montant, devise) correspondent aux valeurs énoncées dans la dictée.
2. IF la Transcription présente un indice de confiance inférieur à 80 % ou si un champ obligatoire (type d'opération, montant, devise) est absent, THEN THE Système SHALL rejeter l'enregistrement automatique et SHALL afficher une indication d'erreur signalant le champ manquant ou incertain, en conservant la Transcription brute pour correction.
3. WHEN un reçu est traité par l'Agent_Photo ou l'Agent_Fichier, THE Système SHALL extraire le nom du Client, le numéro de téléphone et l'identifiant de transaction, puis SHALL vérifier l'existence du Client via le Rattachement_Client.
4. IF l'un des champs (nom du Client, numéro de téléphone, identifiant de transaction) ne peut être extrait, ou si le Rattachement_Client ne trouve aucun Client correspondant, THEN THE Système SHALL afficher une indication d'erreur précisant la cause (champ illisible ou Client introuvable) et SHALL conserver le reçu sans créer d'opération rattachée.
5. WHEN une opération rattachée à un Client est enregistrée, THE Système SHALL refléter dans la Fiche_Client, dans un délai maximum de 5 secondes, cette opération ainsi que le nombre total d'opérations mis à jour (incrémenté de 1 par opération enregistrée).
6. WHEN le bouton « Agent vocal » est présent dans le tableau de bord, THE Système SHALL conserver le design conforme à la Charte_Graphique et l'ensemble des fonctionnalités existantes, sans suppression ni régression des composants déjà disponibles.
