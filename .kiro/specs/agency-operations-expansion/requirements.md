# Requirements Document

## Introduction

Cette fonctionnalité étend l'application OpaysFox (PWA React + Vite de suivi forex/trésorerie multi-devises, données Supabase) afin de couvrir l'ensemble de l'activité d'une agence de change, quelle que soit sa taille (du changeur individuel à l'agence à plusieurs guichets). Au-delà des besoins métier immédiats, cette version pose les fondations d'une **plateforme SaaS multi-clients évolutive** : le comportement de la V1 reste volontairement simple (une seule Agence active par Propriétaire_Agence, un point de vente et une caisse implicites), mais le modèle de données et l'architecture sont conçus dès maintenant pour absorber, sans réécriture complète, plusieurs agences par propriétaire, plusieurs points de vente et caisses par agence, et plusieurs numéros WhatsApp par agence.

Cette fonctionnalité regroupe des chantiers complémentaires :

1. **Administration, invitation et comptes employés** : permettre au propriétaire d'une agence d'inviter des collaborateurs par e-mail, de leur attribuer un rôle et des permissions granulaires dès l'invitation, de gérer leurs comptes, et d'adapter les fonctionnalités visibles à la taille et aux besoins de l'agence (activation/désactivation de modules).
2. **Administration et supervision de la plateforme** : réserver à un éditeur de plateforme (super-administrateur), distinct du propriétaire d'agence, l'habilitation des modules additionnels (`transfert_argent`, `abonnements`, `billets_avion`), la supervision de toutes les agences, la suspension et la réactivation d'une agence, l'administration des listes de référence, et une structure anticipant le suivi des abonnements à la plateforme (formules tarifaires) et des statistiques globales.
3. **Taux flexibles et taux de service** : en plus du taux de change saisi manuellement (jamais imposé par une source externe), introduire un « taux de service » optionnel (commission en pourcentage prélevée avant conversion), activable par l'administration, modifiable à chaque opération, et paramétrable par défaut au niveau d'un client. Le taux de change reste toujours modifiable, y compris via l'agent vocal existant.
4. **WhatsApp centralisé, publication et commande à distance** : faire reposer l'ensemble des communications WhatsApp (publication d'offre, commande à distance, relances d'abonnement, rappels de vol, campagnes marketing) sur une infrastructure d'envoi unique et partagée, et permettre à un client distant d'ouvrir un lien partageable, de passer une commande simple et d'envoyer une preuve. Il ne s'agit pas d'une plateforme d'échange transactionnelle : la portée reste volontairement simple.
5. **Services additionnels, abonnements et billets d'avion** : permettre d'enregistrer les opérations de transfert d'argent (méthode choisie dans un catalogue administrable), la vente d'abonnements TV (fournisseurs administrables) avec relances de renouvellement et marketing par WhatsApp, et la réservation de billets d'avion enrichie (numéro de billet, compagnie, aéroports, contact WhatsApp, historique des rappels) avec suivi de la marge et rappel de vol automatique et paramétrable.
6. **Agents IA et anticipation d'automatisation** : concevoir l'architecture pour héberger plusieurs agents IA spécialisés (forex, comptabilité, service client, WhatsApp, analyse financière, marketing), dont aucune action critique n'est exécutée sans validation humaine explicite.
7. **Conception, expérience utilisateur premium et performance** : offrir une interface moderne, professionnelle et premium comparable aux meilleures applications fintech, claire, responsive (mobile, tablette, PC), tactile et apprenable en quelques minutes par un caissier, tout en restant fluide avec plusieurs années d'historique et plusieurs dizaines de milliers de transactions. Cette première version est en thème clair uniquement (aucun mode sombre).

Cette fonctionnalité s'appuie sur les travaux existants et **ne les duplique pas** :

- Le contrôle d'accès payant et le modèle `access_profiles` (rôles `user`/`admin`) défini dans la spec **paid-access-control** est étendu, et non remplacé, par un modèle de rôles/permissions plus fin, une notion d'agence, un rôle d'éditeur de plateforme et un cloisonnement multi-tenant.
- Le canal WhatsApp sortant (`Service_Envoi`, passerelle OpenWA) et l'historique de relances de la spec **whatsapp-client-reminders** constituent l'infrastructure WhatsApp **unique et centralisée** réutilisée pour la publication, la commande à distance, les relances d'abonnement, les rappels de vol et les campagnes marketing.
- L'agent vocal et la logique d'opération (`src/pages/Transactions.jsx`, `src/utils/finance.js`) de la spec **financial-ops-audit-voice-agent** sont réutilisés pour la saisie des opérations, l'ajustement du taux et le calcul des commissions et bénéfices, et servent de socle au registre d'agents IA.

Le périmètre respecte l'architecture existante : logique financière dans `src/utils/finance.js` (et tests dans `src/utils/finance.test.js`), pages dans `src/pages/`, migrations Supabase dans `supabase/migrations/`, agent vocal dans `src/components/VoiceAgentModal.jsx`, internationalisation dans `src/i18n.js`.

## Hypothèses et Questions Ouvertes

Ces points sont documentés pour clarification ultérieure ; ils ne bloquent pas la rédaction des exigences mais peuvent en ajuster certaines lors de la conception. Ils distinguent ce que la V1 **doit faire** (comportement testable, exprimé en exigences EARS) de ce que l'architecture **doit anticiper** (contraintes d'extensibilité structurelle).

- **Q1 — Portée multi-agences (anticipation structurelle)** : le comportement de cette version se limite à une seule Agence active par Propriétaire_Agence, un Point_De_Vente implicite, une Caisse implicite et un Numero_WhatsApp_Agence par défaut. Le modèle de données et les clés étrangères sont toutefois conçus pour autoriser ultérieurement plusieurs Agences par Propriétaire_Agence, plusieurs Point_De_Vente et Caisse par Agence, et plusieurs Numero_WhatsApp_Agence par Agence, sans réécriture complète ni rupture de schéma. À confirmer en conception.
- **Q2 — Mapping des rôles existants** : le rôle `admin` actuel de `access_profiles` correspond au Propriétaire_Agence ; le rôle `user` correspond à un Compte_Employé sans permission privilégiée. À confirmer.
- **Q3 — Calcul du taux de service** : l'hypothèse retenue est que le Taux_Service est un pourcentage prélevé sur le montant source avant conversion, le montant prélevé étant conservé par l'Agence (et donc compté en bénéfice). À confirmer.
- **Q4 — Infrastructure WhatsApp** : la publication, la commande à distance, les relances et les rappels réutilisent l'unique Service_Envoi et la Passerelle_WhatsApp configurés dans whatsapp-client-reminders, avec un Historique_Messages_WhatsApp partagé. À confirmer.
- **Q5 — Authentification des commandes à distance** : un client distant n'a pas de compte ; il accède via un Lien_Commande public. La sécurité repose sur un jeton non devinable dans le lien. À confirmer.
- **Q6 — Rôle Editeur_Plateforme** : l'Editeur_Plateforme est un rôle de super-administration plateforme, distinct des rôles d'agence, matérialisé par un indicateur dédié dans `access_profiles` ou une table d'administration plateforme. Le mapping technique exact est à confirmer en conception.
- **Q7 — Seuil de relance des abonnements** : le seuil par défaut de relance avant renouvellement est fixé à 3 jours, configurable entre 1 et 30 jours. À confirmer.
- **Q8 — Formules tarifaires et statistiques globales (structure prévue)** : la gestion fine des Plan_Tarifaire, la facturation des Abonnement_Plateforme et les statistiques globales avancées ne sont pas réalisées dans cette version ; seules leur structure de données (rattachement d'une Agence à un Plan_Tarifaire par défaut) et une statistique minimale (dénombrement des Agences par Etat_Agence) sont mises en œuvre. À confirmer.
- **Q9 — Portée d'administration des catalogues de référence** : le Catalogue_Methodes_Transfert et le Catalogue_Fournisseurs_Abonnement sont administrés au niveau plateforme (initialisés avec une liste validée par défaut) par l'Editeur_Plateforme. La possibilité d'ajouts propres à une Agence est anticipée structurellement mais hors comportement de cette version. À confirmer.
- **Q10 — Registre d'agents IA (structure prévue)** : le Registre_Agents énumère six types d'Agent_IA anticipés (`forex`, `comptabilite`, `service_client`, `whatsapp`, `analyse_financiere`, `marketing`) et reste extensible. L'implémentation effective de chaque agent est progressive ; le principe « validation humaine avant toute action critique » s'applique dès maintenant à tout agent. À confirmer.
- **Q11 — Délai de rappel de vol** : le délai de déclenchement du rappel de vol est paramétrable entre 1 et 168 heures et vaut 48 heures par défaut. À confirmer.

## Glossary

- **Application** : la PWA OpaysFox (front React + Vite, données Supabase) de suivi forex/trésorerie.
- **Plateforme** : l'ensemble du service SaaS OpaysFox hébergeant les Agences, exploité par l'Editeur_Plateforme.
- **Agence** : entité métier regroupant les données de trésorerie (portefeuilles, transactions, clients) exploitées par un Propriétaire_Agence et ses Comptes_Employés ; chaque Agence est rattachée à un Propriétaire_Agence par une clé étrangère autorisant structurellement une relation un-à-plusieurs (un Propriétaire_Agence par Agence dans cette version).
- **Etat_Agence** : état de cycle de vie d'une Agence appartenant à l'ensemble fermé `active` ou `suspendue`, géré par l'Editeur_Plateforme.
- **Point_De_Vente** : lieu d'exploitation rattaché à une Agence par une clé étrangère autorisant structurellement plusieurs Point_De_Vente par Agence ; un Point_De_Vente par défaut implicite unique est utilisé dans cette version.
- **Caisse** : guichet d'encaissement rattaché à un Point_De_Vente par une clé étrangère autorisant structurellement plusieurs Caisse par Point_De_Vente ; une Caisse par défaut implicite unique est utilisée dans cette version.
- **Propriétaire_Agence** : Utilisateur disposant du rôle privilégié sur une Agence (correspond au rôle `admin` de `access_profiles`), qui invite les Comptes_Employés et configure l'Agence.
- **Compte_Employé** : compte d'Utilisateur rattaché à l'Agence et porteur d'un Rôle, créé à la suite d'une Invitation_Collaborateur.
- **Invitation_Collaborateur** : demande d'adhésion adressée par le Propriétaire_Agence à un collaborateur via une adresse e-mail, portant un Rôle et un ensemble de Permissions, et dont l'état appartient à l'ensemble fermé `en_attente`, `acceptée` ou `expirée`.
- **Utilisateur** : personne authentifiée disposant d'un compte Supabase Auth (Propriétaire_Agence, Compte_Employé ou Editeur_Plateforme).
- **Editeur_Plateforme** : rôle de super-administration de la Plateforme OpaysFox, distinct du Propriétaire_Agence et des Comptes_Employés, seul habilité à accorder ou révoquer les Droits_Module des Agences, à superviser, suspendre ou réactiver les Agences et à administrer les catalogues de référence depuis l'Espace_Administration_Plateforme.
- **Espace_Administration_Plateforme** : interface d'administration centrale de la Plateforme, réservée à l'Editeur_Plateforme, permettant de gérer les Droits_Module, de superviser le cycle de vie des Agences et d'administrer les catalogues de référence.
- **Droit_Module** : habilitation accordée au niveau plateforme par l'Editeur_Plateforme autorisant une Agence à utiliser un Module_Additionnel donné. Un Droit_Module est requis avant toute activation du Module_Additionnel correspondant par le Propriétaire_Agence.
- **Plan_Tarifaire** : formule d'abonnement d'une Agence à la Plateforme, rattachée à l'Agence par une clé étrangère ; un Plan_Tarifaire par défaut unique est appliqué dans cette version, la gestion de formules multiples étant anticipée structurellement.
- **Abonnement_Plateforme** : souscription d'une Agence à un Plan_Tarifaire ; sa structure est prévue pour anticiper le suivi des abonnements à la Plateforme, sans facturation réalisée dans cette version.
- **Rôle** : ensemble nommé de Permissions attribué à un Compte_Employé. L'ensemble fermé des rôles par défaut est `proprietaire`, `gerant`, `caissier`, `observateur`.
- **Permission** : capacité unitaire vérifiable autorisant ou interdisant une action (ex. `transactions.creer`, `taux.modifier`, `employes.gerer`, `services.vendre`).
- **Module_Fonctionnel** : ensemble de fonctionnalités activable ou désactivable pour une Agence. Comprend les Modules_Base et des modules optionnels (`prets`, `dettes`, `taux_service`, `publication_whatsapp`, `commande_distance`) ainsi que les Modules_Additionnels.
- **Module_Base** : Module_Fonctionnel de trésorerie de base (`portefeuilles`, `transactions`, `depenses`, `clients`), activé par défaut et ne nécessitant aucun Droit_Module.
- **Module_Additionnel** : Module_Fonctionnel appartenant à l'ensemble fermé `transfert_argent`, `abonnements`, `billets_avion`, désactivé et non habilité par défaut, dont l'activation par le Propriétaire_Agence exige un Droit_Module accordé au niveau plateforme.
- **Taux_Change** : nombre d'unités de devise destination obtenues pour une unité de devise source, saisi manuellement par l'Utilisateur pour une opération.
- **Taux_Service** : pourcentage (de 0 à 100) prélevé sur le montant source d'une opération avant conversion, à titre de commission de service de l'Agence.
- **Montant_Service** : montant absolu prélevé, égal au montant source multiplié par le Taux_Service divisé par 100, arrondi à 2 décimales.
- **Operation** : enregistrement de la table `transactions` (type `exchange`, `deposit` ou `withdrawal`) ou d'un service additionnel.
- **Client** : enregistrement de la table `customers` (nom, téléphone), rattachable à une Operation.
- **Service_Additionnel** : prestation vendue par l'Agence autre que le change de devises (transfert d'argent, abonnement TV, etc.).
- **Catalogue_Services** : liste configurable des Services_Additionnels proposés par une Agence.
- **Catalogue_Methodes_Transfert** : liste de référence, administrable au niveau plateforme par l'Editeur_Plateforme, des méthodes de transfert d'argent disponibles ; initialisée avec une liste par défaut et éditable (ajout, modification, désactivation) sans déploiement de code.
- **Methode_Transfert** : entrée du Catalogue_Methodes_Transfert sélectionnée pour une opération de transfert ; la valeur `Autre` est conservée comme option permanente accompagnée d'un libellé personnalisé en texte libre de 1 à 60 caractères.
- **Catalogue_Fournisseurs_Abonnement** : liste de référence, administrable au niveau plateforme par l'Editeur_Plateforme, des fournisseurs d'abonnement TV disponibles ; initialisée avec une liste par défaut et éditable (ajout, modification, désactivation) sans déploiement de code.
- **Fournisseur_Abonnement** : entrée du Catalogue_Fournisseurs_Abonnement à laquelle est rattaché un Abonnement.
- **Abonnement** : enregistrement d'une vente d'abonnement TV, rattaché à un Fournisseur_Abonnement et à un Client, comportant une formule, un montant payé, une date de renouvellement et une commission.
- **Reservation_Billet** : enregistrement d'une réservation de billet d'avion comportant le nom du client, le numéro de billet, la compagnie aérienne, l'aéroport de départ, l'aéroport d'arrivée, la destination, la date du vol, le prix réel payé par l'Agence, le prix payé par le client, le bénéfice réalisé, le numéro WhatsApp du client, un Historique_Rappels et un statut.
- **Passerelle_WhatsApp** : la passerelle OpenWA décrite dans la spec whatsapp-client-reminders, exposant une API REST.
- **Service_Envoi** : composant unique d'envoi de messages WhatsApp sortants défini dans la spec whatsapp-client-reminders, s'appuyant sur la Passerelle_WhatsApp et partagé par toutes les fonctionnalités WhatsApp de l'Application.
- **Historique_Messages_WhatsApp** : journal partagé consignant chaque message WhatsApp sortant transmis par l'Application, quel que soit la fonctionnalité émettrice.
- **Numero_WhatsApp_Agence** : numéro WhatsApp émetteur rattaché à une Agence par une clé étrangère autorisant structurellement plusieurs Numero_WhatsApp_Agence par Agence ; un Numero_WhatsApp_Agence par défaut unique est utilisé dans cette version.
- **Historique_Rappels** : liste horodatée des rappels et relances transmis ou tentés pour un Abonnement ou une Reservation_Billet, consignant pour chaque entrée l'horodatage, le type et le résultat.
- **Limite_de_Debit** : limite de fréquence d'envoi imposée par la Passerelle_WhatsApp, définie dans la spec whatsapp-client-reminders.
- **Lien_Commande** : URL partageable, contenant un jeton non devinable, permettant à un client distant d'ouvrir un Formulaire_Commande pour une Agence.
- **Formulaire_Commande** : page publique permettant à un client distant de saisir une commande et de joindre une preuve.
- **Commande_Distante** : demande de service soumise par un client via le Formulaire_Commande, en attente de traitement par l'Agence.
- **Agent_Vocal** : l'agent vocal existant (`src/components/VoiceAgentModal.jsx`).
- **Agent_IA** : composant logiciel d'assistance automatisée recensé dans le Registre_Agents, proposant des données ou des actions soumises à validation humaine.
- **Registre_Agents** : ensemble extensible recensant les types d'Agent_IA disponibles dans l'Application.
- **Action_Critique** : action produisant un effet persistant ou externe, à savoir la création, la modification ou la suppression d'une Operation, d'un Service_Additionnel, d'un Abonnement, d'une Reservation_Billet ou d'une Commande_Distante, la modification d'un solde, l'envoi d'un message WhatsApp sortant, ou la modification d'un Droit_Module, d'un Module_Fonctionnel ou d'un Etat_Agence.
- **Confirmation** : validation explicite, par un Utilisateur disposant de la Permission requise, de données ou d'une action proposées par un Agent_IA ou l'Agent_Vocal, préalable à tout enregistrement définitif ou exécution.
- **Cible_Tactile** : zone interactive d'un élément d'interface (bouton, lien ou contrôle de saisie) activable par appui tactile ou par clic.
- **Fichiers_Traduction** : `src/i18n.js` contenant les dictionnaires `fr` et `en`.
- **Theme_Clair** : thème visuel clair (light mode), unique thème visuel de cette version.
- **Systeme_Design** : ensemble des conventions de composants, de styles, d'espacements et de mise en page existantes de l'Application (`src/components/`, `src/pages/`) réutilisées pour les nouveaux écrans.
- **Seuil_Relance_Abonnement** : délai, exprimé en jours, séparant l'envoi d'une relance de renouvellement de la date de renouvellement d'un Abonnement ; valeur par défaut de 3 jours, configurable de 1 à 30 jours.
- **Delai_Rappel_Vol** : délai, exprimé en heures, séparant l'envoi d'un rappel de vol de l'instant du vol d'une Reservation_Billet ; valeur par défaut de 48 heures, configurable de 1 à 168 heures.
- **Campagne_Marketing** : message promotionnel transmis à un ou plusieurs Clients via le Service_Envoi partagé.
- **Publication_Offre** : message d'offre commerciale diffusé par l'Agence via le Service_Envoi partagé.
- **Preuve** : pièce jointe (image ou document) transmise par un client distant à l'appui d'une Commande_Distante.
- **Operation_Courante** : opération métier fréquente réalisée au guichet, à savoir l'enregistrement d'une Operation de change, d'une opération de transfert d'argent, d'un Abonnement ou d'une Reservation_Billet.
- **RLS** : Row Level Security de PostgreSQL/Supabase.

---

## Requirements

### Requirement 1: Gestion des comptes employés et invitation de collaborateurs

**User Story:** En tant que Propriétaire_Agence, je veux inviter des collaborateurs par e-mail, leur attribuer un Rôle et des accès dès l'invitation, et gérer leurs comptes, afin que chaque employé dispose de son propre accès à l'Agence.

#### Acceptance Criteria

1. WHERE l'Utilisateur possède la permission `employes.gerer`, THE Application SHALL afficher une interface de gestion des Comptes_Employés et des Invitations_Collaborateur de l'Agence.
2. WHEN le Propriétaire_Agence invite un collaborateur en fournissant une adresse e-mail au format `partie-locale@domaine` d'au plus 254 caractères, un Rôle appartenant à l'ensemble fermé des rôles et un ensemble de Permissions, THE Application SHALL enregistrer une Invitation_Collaborateur à l'état `en_attente` rattachée à l'Agence et transmettre une invitation à l'adresse e-mail indiquée.
3. WHEN le collaborateur invité accepte une Invitation_Collaborateur à l'état `en_attente` non expirée, THE Application SHALL créer ou activer le Compte_Employé correspondant avec le Rôle et les Permissions définis lors de l'invitation, faire passer l'Invitation_Collaborateur à l'état `acceptée` et fixer l'état d'activation du Compte_Employé à `actif`.
4. IF le Propriétaire_Agence crée une Invitation_Collaborateur avec une adresse e-mail vide, malformée ou de plus de 254 caractères, THEN THE Application SHALL refuser la création, n'enregistrer aucune Invitation_Collaborateur et afficher un message indiquant que l'adresse e-mail est invalide.
5. IF le Propriétaire_Agence invite un collaborateur ou modifie un Compte_Employé avec un Rôle absent ou n'appartenant pas à l'ensemble fermé des rôles, THEN THE Application SHALL refuser l'opération, n'appliquer aucune modification et afficher un message indiquant que le Rôle est invalide.
6. IF le Propriétaire_Agence crée une Invitation_Collaborateur avec une adresse e-mail déjà rattachée à une Invitation_Collaborateur `en_attente` ou à un Compte_Employé actif de la même Agence, THEN THE Application SHALL refuser la création, n'enregistrer aucune Invitation_Collaborateur et afficher un message indiquant que l'adresse e-mail est déjà utilisée.
7. IF une Invitation_Collaborateur est acceptée plus de 168 heures après sa création, THEN THE Application SHALL considérer l'invitation comme expirée, faire passer son état à `expirée`, ne créer aucun Compte_Employé et afficher un message indiquant que l'invitation a expiré.
8. WHEN le Propriétaire_Agence modifie le Rôle d'un Compte_Employé existant pour un Rôle appartenant à l'ensemble fermé des rôles, THE Application SHALL enregistrer le nouveau Rôle et appliquer les Permissions correspondantes à la connexion suivante de ce Compte_Employé.
9. WHEN le Propriétaire_Agence désactive un Compte_Employé, THE Application SHALL enregistrer son état d'activation à `désactivé`, refuser toute connexion ultérieure de ce Compte_Employé et afficher à ce compte la même restriction d'accès que celle appliquée à un Utilisateur non autorisé.
10. THE Application SHALL afficher la liste des Comptes_Employés de l'Agence avec, pour chaque compte, son adresse e-mail, son Rôle et son état d'activation appartenant à l'ensemble fermé `actif` ou `désactivé`, et la liste des Invitations_Collaborateur avec leur état appartenant à l'ensemble fermé `en_attente`, `acceptée` ou `expirée`.
11. IF un Compte_Employé dépourvu de la permission `employes.gerer` tente d'accéder à l'interface de gestion des Comptes_Employés ou des Invitations_Collaborateur, THEN THE Application SHALL refuser l'accès et afficher un message indiquant que la permission est insuffisante.
12. THE Application SHALL appliquer une politique RLS garantissant qu'un Compte_Employé n'accède qu'aux données de l'Agence à laquelle il est rattaché.

### Requirement 2: Modèle de rôles et de permissions

**User Story:** En tant que Propriétaire_Agence, je veux attribuer des niveaux d'accès différents à mes employés, afin de limiter chaque employé aux actions correspondant à sa fonction.

#### Acceptance Criteria

1. THE Application SHALL définir un ensemble fermé de Rôles par défaut composé exactement des quatre valeurs `proprietaire`, `gerant`, `caissier` et `observateur`, et SHALL rejeter toute tentative d'attribution d'un Rôle ne figurant pas dans cet ensemble.
2. THE Application SHALL associer à chaque Rôle par défaut un ensemble de Permissions déterminé, le Rôle `proprietaire` disposant de l'ensemble des Permissions.
3. WHEN une action protégée est demandée par un Compte_Employé, THE Application SHALL rendre une décision d'autorisation en 1 seconde ou moins et SHALL autoriser l'action si et seulement si le Rôle du Compte_Employé inclut la Permission requise pour cette action et qu'aucune Permission individuelle de retrait ne s'applique à cette action.
4. IF un Compte_Employé demande une action dont la Permission requise n'est pas accordée, THEN THE Application SHALL refuser l'action, ne modifier aucune donnée et afficher un message indiquant que la permission est insuffisante.
5. WHERE le Propriétaire_Agence attribue une Permission individuelle d'octroi à un Compte_Employé, THE Application SHALL ajouter cette Permission aux Permissions issues du Rôle, l'ensemble effectif des Permissions étant l'union des Permissions du Rôle et des Permissions individuelles d'octroi.
6. WHERE le Propriétaire_Agence attribue une Permission individuelle de retrait à un Compte_Employé, THE Application SHALL refuser l'action correspondante même si le Rôle inclut cette Permission, le retrait individuel ayant priorité sur toute Permission d'octroi (deny-overrides).
7. WHEN le Propriétaire_Agence modifie le Rôle ou une Permission individuelle d'un Compte_Employé, THE Application SHALL appliquer la modification aux décisions d'autorisation suivantes de ce Compte_Employé en 5 secondes ou moins.
8. THE Application SHALL faire respecter chaque Permission protégeant une écriture de données de trésorerie au niveau de la base de données via une politique RLS, en complément de la vérification côté interface.
9. THE Application SHALL afficher dans l'interface uniquement les actions pour lesquelles le Compte_Employé connecté possède la Permission requise dans son ensemble effectif de Permissions.

### Requirement 3: Architecture multi-tenant évolutive (anticipation structurelle)

**User Story:** En tant qu'Editeur_Plateforme, je veux que le modèle de données anticipe une plateforme SaaS multi-clients, afin d'introduire ultérieurement plusieurs agences, points de vente, caisses et numéros WhatsApp sans réécriture complète ni rupture de schéma.

#### Acceptance Criteria

1. THE Application SHALL rattacher chaque Agence à un Propriétaire_Agence au moyen d'une clé étrangère autorisant structurellement une relation un-à-plusieurs entre Propriétaire_Agence et Agence, tout en limitant le comportement de cette version à une seule Agence active par Propriétaire_Agence.
2. THE Application SHALL rattacher chaque Operation, Client, Service_Additionnel, Abonnement, Reservation_Billet et Commande_Distante à un identifiant d'Agence explicite servant de clé de cloisonnement des données.
3. THE Application SHALL modéliser le Point_De_Vente et la Caisse au moyen d'identifiants et de clés étrangères autorisant structurellement une relation un-à-plusieurs entre Agence et Point_De_Vente et entre Point_De_Vente et Caisse.
4. WHERE aucun Point_De_Vente ni aucune Caisse n'a été défini explicitement pour une Agence, THE Application SHALL rattacher les opérations de cette Agence à un Point_De_Vente par défaut implicite unique et à une Caisse par défaut implicite unique.
5. THE Application SHALL modéliser le Numero_WhatsApp_Agence au moyen d'une clé étrangère autorisant structurellement une relation un-à-plusieurs entre Agence et Numero_WhatsApp_Agence, en utilisant un Numero_WhatsApp_Agence par défaut unique dans cette version.
6. THE Application SHALL appliquer une politique RLS de cloisonnement fondée sur l'identifiant d'Agence garantissant qu'une requête authentifiée n'accède qu'aux données des Agences auxquelles l'Utilisateur est rattaché.

### Requirement 4: Contrôle des droits de modules par l'éditeur de plateforme

**User Story:** En tant qu'Editeur_Plateforme, je veux accorder ou révoquer les modules additionnels d'une agence depuis un espace d'administration central, afin de contrôler quelles agences sont habilitées à utiliser ces modules.

#### Acceptance Criteria

1. THE Application SHALL définir un ensemble fermé de Modules_Additionnels composé exactement de `transfert_argent`, `abonnements` et `billets_avion`.
2. WHERE l'Utilisateur possède le rôle Editeur_Plateforme, THE Application SHALL afficher l'Espace_Administration_Plateforme permettant d'accorder ou de révoquer le Droit_Module de chaque Module_Additionnel pour chaque Agence.
3. WHERE aucun Droit_Module n'a été enregistré pour une Agence, THE Application SHALL considérer chaque Module_Additionnel comme non habilité et désactivé pour cette Agence.
4. WHEN l'Editeur_Plateforme accorde le Droit_Module d'un Module_Additionnel à une Agence, THE Application SHALL enregistrer ce droit de manière persistante et rendre ce Module_Additionnel activable par le Propriétaire_Agence.
5. WHEN l'Editeur_Plateforme révoque le Droit_Module d'un Module_Additionnel pour une Agence, THE Application SHALL enregistrer la révocation, désactiver ce Module_Additionnel pour l'Agence et masquer ses fonctionnalités et sa navigation dans un délai maximal de 5 secondes.
6. IF le Propriétaire_Agence tente d'activer un Module_Additionnel dont le Droit_Module n'a pas été accordé à son Agence, THEN THE Application SHALL refuser l'activation, conserver le module désactivé et afficher un message indiquant que le module doit être habilité par l'éditeur de la plateforme.
7. IF un Utilisateur dépourvu du rôle Editeur_Plateforme tente d'accéder à l'Espace_Administration_Plateforme ou de modifier un Droit_Module, THEN THE Application SHALL refuser l'accès, ne modifier aucun Droit_Module et afficher un message indiquant que la permission est insuffisante.
8. THE Application SHALL appliquer une politique RLS garantissant que seules les requêtes authentifiées avec le rôle Editeur_Plateforme peuvent créer, modifier ou supprimer un Droit_Module, et qu'une Agence ne peut lire que ses propres Droits_Module.
9. THE Application SHALL permettre l'enregistrement d'un Droit_Module aussi bien à la demande de l'Agence cliente qu'à l'initiative de l'Editeur_Plateforme.

### Requirement 5: Administration plateforme — supervision et cycle de vie des agences

**User Story:** En tant qu'Editeur_Plateforme, je veux superviser toutes les agences, suspendre ou réactiver une agence, et disposer d'une structure pour suivre les abonnements à la plateforme et les statistiques globales, afin de piloter la plateforme SaaS.

#### Acceptance Criteria

1. WHERE l'Utilisateur possède le rôle Editeur_Plateforme, THE Application SHALL afficher dans l'Espace_Administration_Plateforme la liste de toutes les Agences avec, pour chacune, son identifiant, son Propriétaire_Agence, son Etat_Agence appartenant à l'ensemble fermé `active` ou `suspendue` et ses Droits_Module.
2. WHEN l'Editeur_Plateforme suspend une Agence, THE Application SHALL enregistrer l'Etat_Agence `suspendue` et refuser, dans un délai maximal de 5 secondes, toute connexion et tout accès aux données de cette Agence par ses Comptes_Employés et son Propriétaire_Agence.
3. WHEN l'Editeur_Plateforme réactive une Agence dont l'Etat_Agence est `suspendue`, THE Application SHALL enregistrer l'Etat_Agence `active` et rétablir l'accès des Utilisateurs rattachés selon leurs Rôles et Permissions dans un délai maximal de 5 secondes.
4. WHILE une Agence est à l'état `suspendue`, THE Application SHALL afficher à ses Utilisateurs un message indiquant que l'accès de l'Agence est suspendu et SHALL n'exposer aucune donnée de trésorerie de cette Agence.
5. IF un Utilisateur dépourvu du rôle Editeur_Plateforme tente de suspendre ou de réactiver une Agence, THEN THE Application SHALL refuser l'opération, conserver l'Etat_Agence existant et afficher un message indiquant que la permission est insuffisante.
6. THE Application SHALL appliquer une politique RLS garantissant que seules les requêtes authentifiées avec le rôle Editeur_Plateforme peuvent lire la liste de l'ensemble des Agences et modifier un Etat_Agence.
7. THE Application SHALL rattacher chaque Agence à un Plan_Tarifaire au moyen d'une clé étrangère, en appliquant par défaut un Plan_Tarifaire unique dans cette version, afin d'anticiper structurellement la gestion de futures formules tarifaires et le suivi des Abonnements_Plateforme.
8. WHERE l'Utilisateur possède le rôle Editeur_Plateforme, THE Application SHALL afficher une statistique globale indiquant le nombre d'Agences par Etat_Agence.

### Requirement 6: Adaptabilité à la taille de l'agence (modules activables)

**User Story:** En tant que Propriétaire_Agence, je veux activer ou désactiver des modules selon la taille et les besoins de mon agence, afin que l'application reste simple pour une petite agence et complète pour une grande.

#### Acceptance Criteria

1. THE Application SHALL fournir un ensemble de Modules_Fonctionnels activables par Agence, composé des Modules_Base (`portefeuilles`, `transactions`, `depenses`, `clients`), de modules optionnels (`prets`, `dettes`, `taux_service`, `publication_whatsapp`, `commande_distance`) et des Modules_Additionnels (`transfert_argent`, `abonnements`, `billets_avion`).
2. WHERE un Module_Additionnel ne dispose pas d'un Droit_Module accordé à l'Agence, THE Application SHALL présenter ce module comme non disponible et empêcher son activation par le Propriétaire_Agence.
3. WHEN le Propriétaire_Agence active un Module_Fonctionnel dont l'activation est autorisée, THE Application SHALL rendre accessibles, dans un délai maximum de 5 secondes après confirmation de l'enregistrement, les fonctionnalités et la navigation associées à ce module pour les Comptes_Employés disposant des Permissions correspondantes.
4. WHEN le Propriétaire_Agence désactive un Module_Fonctionnel, THE Application SHALL masquer, dans un délai maximum de 5 secondes après confirmation de l'enregistrement, les fonctionnalités et la navigation associées à ce module pour l'ensemble des Comptes_Employés de l'Agence.
5. IF un Compte_Employé tente d'accéder à une fonctionnalité appartenant à un Module_Fonctionnel désactivé, THEN THE Application SHALL refuser l'accès, afficher un message indiquant que le module est désactivé, et conserver sans modification les données et l'état de la session en cours du Compte_Employé.
6. THE Application SHALL conserver l'état d'activation de chaque Module_Fonctionnel de manière persistante par Agence.
7. IF l'enregistrement persistant de l'état d'activation d'un Module_Fonctionnel échoue, THEN THE Application SHALL conserver l'état d'activation antérieur sans appliquer la modification et afficher un message indiquant l'échec de l'enregistrement.
8. WHERE aucun choix de modules n'a encore été enregistré pour une Agence, THE Application SHALL appliquer un ensemble par défaut dans lequel seuls les Modules_Base sont activés et tous les Modules_Additionnels sont désactivés.
9. IF un Compte_Employé autre que le Propriétaire_Agence tente d'activer ou de désactiver un Module_Fonctionnel, THEN THE Application SHALL refuser l'opération, conserver l'état d'activation antérieur et afficher un message indiquant que la permission est insuffisante.

### Requirement 7: Taux de change manuel et taux de service

**User Story:** En tant que Compte_Employé au guichet, je veux saisir manuellement le taux de change et appliquer un taux de service optionnel, afin de fixer librement mes conditions et de prélever une commission de service.

#### Acceptance Criteria

1. THE Application SHALL permettre la saisie manuelle du Taux_Change pour chaque Operation de change et SHALL n'imposer aucun Taux_Change issu d'une source externe.
2. WHERE le Module_Fonctionnel `taux_service` est activé pour l'Agence, THE Application SHALL permettre l'application à une Operation d'un Taux_Service compris entre 0 et 100.
3. WHEN un Taux_Service compris entre 0 et 100 est appliqué à une Operation dont le montant source est défini, THE Application SHALL calculer le Montant_Service égal au montant source multiplié par le Taux_Service divisé par 100, arrondi à 2 décimales, et déduire ce Montant_Service du montant source avant conversion au Taux_Change.
4. IF un Taux_Change inférieur ou égal à 0 ou non numérique est saisi pour une Operation, THEN THE Application SHALL refuser l'enregistrement, ne créer aucune Operation et afficher un message indiquant que le taux de change est invalide.
5. IF un Taux_Service strictement inférieur à 0 ou strictement supérieur à 100 est saisi pour une Operation, THEN THE Application SHALL refuser l'enregistrement, ne créer aucune Operation et afficher un message indiquant que le taux de service est invalide.
6. WHERE un Taux_Service par défaut est défini au niveau d'un Client, THE Application SHALL pré-renseigner le Taux_Service de chaque nouvelle Operation rattachée à ce Client avec cette valeur tout en permettant sa modification pour l'Operation en cours.
7. WHEN l'Utilisateur modifie le Taux_Change ou le Taux_Service proposé pour une Operation, y compris via l'Agent_Vocal, THE Application SHALL recalculer le Montant_Service et le montant converti à partir des valeurs modifiées avant Confirmation.
8. WHERE le Module_Fonctionnel `taux_service` est désactivé pour l'Agence, THE Application SHALL fixer le Montant_Service à 0 et n'appliquer aucune commission de service aux Operations.

### Requirement 8: Enregistrement des opérations de transfert d'argent

**User Story:** En tant que Compte_Employé disposant de la permission `services.vendre`, je veux enregistrer une opération de transfert d'argent en choisissant une méthode dans un catalogue, afin de suivre l'activité de transfert et sa commission.

#### Acceptance Criteria

1. WHERE le Module_Additionnel `transfert_argent` est activé pour l'Agence, THE Application SHALL afficher une interface d'enregistrement d'une opération de transfert d'argent.
2. WHEN un Compte_Employé disposant de la permission `services.vendre` enregistre une opération de transfert avec un montant strictement positif et une Methode_Transfert active du Catalogue_Methodes_Transfert, THE Application SHALL enregistrer l'opération rattachée à l'Agence avec la Methode_Transfert, le montant et la commission saisis.
3. WHEN la Methode_Transfert sélectionnée est `Autre`, THE Application SHALL exiger un libellé personnalisé en texte libre de 1 à 60 caractères et enregistrer ce libellé avec l'opération.
4. IF une opération de transfert est enregistrée sans Methode_Transfert, avec une Methode_Transfert désactivée ou avec un montant inférieur ou égal à 0, THEN THE Application SHALL refuser l'enregistrement, ne créer aucune opération et afficher un message indiquant le champ invalide.
5. IF la Methode_Transfert `Autre` est sélectionnée sans libellé personnalisé ou avec un libellé de plus de 60 caractères, THEN THE Application SHALL refuser l'enregistrement, ne créer aucune opération et afficher un message indiquant que le libellé est invalide.
6. THE Application SHALL inclure la commission de chaque opération de transfert dans le calcul du bénéfice de l'Agence.

### Requirement 9: Catalogue administrable des méthodes de transfert

**User Story:** En tant qu'Editeur_Plateforme, je veux administrer la liste des méthodes de transfert depuis l'administration de la plateforme, afin d'ajouter, modifier ou désactiver une méthode sans déploiement technique.

#### Acceptance Criteria

1. THE Application SHALL initialiser le Catalogue_Methodes_Transfert avec une liste de Methodes_Transfert par défaut validée et SHALL y inclure en permanence la valeur `Autre`.
2. WHERE l'Utilisateur possède le rôle Editeur_Plateforme, THE Application SHALL permettre d'ajouter une Methode_Transfert, d'en modifier le libellé et de l'activer ou la désactiver sans déploiement de code.
3. WHEN l'Editeur_Plateforme ajoute une Methode_Transfert avec un libellé unique de 1 à 60 caractères, THE Application SHALL enregistrer la nouvelle Methode_Transfert à l'état actif et la rendre disponible à la sélection.
4. WHEN l'Editeur_Plateforme désactive une Methode_Transfert, THE Application SHALL la retirer des choix proposés pour les nouvelles opérations et SHALL conserver inchangées les opérations existantes l'ayant déjà utilisée.
5. IF l'Editeur_Plateforme ajoute ou modifie une Methode_Transfert avec un libellé vide, de plus de 60 caractères ou identique à une Methode_Transfert existante, THEN THE Application SHALL refuser l'opération, ne modifier aucune entrée et afficher un message indiquant que le libellé est invalide.
6. IF un Utilisateur dépourvu du rôle Editeur_Plateforme tente de modifier le Catalogue_Methodes_Transfert, THEN THE Application SHALL refuser l'opération, ne modifier aucune entrée et afficher un message indiquant que la permission est insuffisante.
7. THE Application SHALL conserver la valeur `Autre` du Catalogue_Methodes_Transfert non supprimable.

### Requirement 10: Vente d'abonnements TV, relances et campagnes

**User Story:** En tant que Compte_Employé disposant de la permission `services.vendre`, je veux vendre des abonnements TV et relancer les clients avant renouvellement, afin de fidéliser les clients et de suivre les commissions.

#### Acceptance Criteria

1. WHERE le Module_Additionnel `abonnements` est activé pour l'Agence, THE Application SHALL afficher une interface de vente d'Abonnement rattachée à un Fournisseur_Abonnement actif et à un Client.
2. WHEN un Compte_Employé disposant de la permission `services.vendre` enregistre un Abonnement avec un Fournisseur_Abonnement actif, une formule, un montant payé strictement positif et une date de renouvellement postérieure à la date du jour, THE Application SHALL enregistrer l'Abonnement rattaché à l'Agence et au Client.
3. IF un Abonnement est enregistré sans Fournisseur_Abonnement actif, sans date de renouvellement, avec une date de renouvellement antérieure ou égale à la date du jour, ou avec un montant payé inférieur ou égal à 0, THEN THE Application SHALL refuser l'enregistrement, ne créer aucun Abonnement et afficher un message indiquant le champ invalide.
4. WHEN la date courante atteint la date de renouvellement d'un Abonnement diminuée du Seuil_Relance_Abonnement, THE Application SHALL transmettre une relance de renouvellement au numéro WhatsApp du Client via le Service_Envoi et consigner l'envoi dans l'Historique_Rappels de l'Abonnement.
5. THE Application SHALL appliquer un Seuil_Relance_Abonnement par défaut de 3 jours, configurable de 1 à 30 jours.
6. IF une valeur de Seuil_Relance_Abonnement hors de l'intervalle de 1 à 30 jours est saisie, THEN THE Application SHALL refuser la modification, conserver la valeur antérieure et afficher un message indiquant que le seuil est invalide.
7. WHERE un Client a consenti à recevoir des Campagne_Marketing, THE Application SHALL permettre l'envoi d'une Campagne_Marketing au numéro WhatsApp du Client via le Service_Envoi.
8. THE Application SHALL consigner chaque relance de renouvellement transmise ou tentée dans l'Historique_Rappels de l'Abonnement avec horodatage, type et résultat.

### Requirement 11: Catalogue administrable des fournisseurs d'abonnement

**User Story:** En tant qu'Editeur_Plateforme, je veux administrer la liste des fournisseurs d'abonnement, afin d'étendre l'offre sans modification de code.

#### Acceptance Criteria

1. THE Application SHALL initialiser le Catalogue_Fournisseurs_Abonnement avec les Fournisseurs_Abonnement par défaut `Canal+`, `Access`, `Évasion` et `DStv`.
2. WHERE l'Utilisateur possède le rôle Editeur_Plateforme, THE Application SHALL permettre d'ajouter un Fournisseur_Abonnement, d'en modifier le libellé et de l'activer ou la désactiver sans déploiement de code.
3. THE Application SHALL modéliser le rattachement d'un Fournisseur_Abonnement à une Agence au moyen d'une clé étrangère nullable autorisant structurellement des ajouts propres à une Agence, ces ajouts au niveau Agence restant hors comportement de cette version.
4. WHEN l'Editeur_Plateforme ajoute un Fournisseur_Abonnement avec un libellé unique de 1 à 60 caractères, THE Application SHALL l'enregistrer à l'état actif et le rendre disponible à la sélection.
5. WHEN l'Editeur_Plateforme désactive un Fournisseur_Abonnement, THE Application SHALL le retirer des choix proposés pour les nouvelles ventes et SHALL conserver inchangés les Abonnements existants qui lui sont rattachés.
6. IF un libellé de Fournisseur_Abonnement est vide, de plus de 60 caractères ou identique à un Fournisseur_Abonnement existant, THEN THE Application SHALL refuser l'opération, ne modifier aucune entrée et afficher un message indiquant que le libellé est invalide.
7. IF un Utilisateur dépourvu du rôle Editeur_Plateforme tente de modifier le Catalogue_Fournisseurs_Abonnement, THEN THE Application SHALL refuser l'opération, ne modifier aucune entrée et afficher un message indiquant que la permission est insuffisante.

### Requirement 12: Réservation de billets d'avion enrichie et rappel de vol paramétrable

**User Story:** En tant que Compte_Employé disposant de la permission `services.vendre`, je veux enregistrer des réservations de billets d'avion détaillées et déclencher un rappel de vol automatique, afin de suivre la marge et de prévenir le client à temps.

#### Acceptance Criteria

1. WHERE le Module_Additionnel `billets_avion` est activé pour l'Agence, THE Application SHALL afficher une interface de saisie d'une Reservation_Billet.
2. WHEN un Compte_Employé disposant de la permission `services.vendre` enregistre une Reservation_Billet, THE Application SHALL enregistrer le nom du client, le numéro de billet, la compagnie aérienne, l'aéroport de départ, l'aéroport d'arrivée, la destination, la date du vol, le prix réel payé par l'Agence, le prix payé par le client, le numéro WhatsApp du client et le statut.
3. WHEN le prix réel payé par l'Agence et le prix payé par le client sont renseignés pour une Reservation_Billet, THE Application SHALL calculer le bénéfice égal au prix payé par le client diminué du prix réel payé par l'Agence.
4. IF une Reservation_Billet est enregistrée avec une date du vol antérieure à la date du jour, un numéro de billet vide, un prix payé par le client négatif ou un prix réel payé par l'Agence négatif, THEN THE Application SHALL refuser l'enregistrement, ne créer aucune Reservation_Billet et afficher un message indiquant le champ invalide.
5. WHEN l'instant courant atteint l'instant du vol d'une Reservation_Billet diminué du Delai_Rappel_Vol, THE Application SHALL transmettre un rappel de vol au numéro WhatsApp du client via le Service_Envoi et consigner l'envoi dans l'Historique_Rappels de la Reservation_Billet.
6. THE Application SHALL appliquer un Delai_Rappel_Vol par défaut de 48 heures, configurable de 1 à 168 heures.
7. IF une valeur de Delai_Rappel_Vol hors de l'intervalle de 1 à 168 heures est saisie, THEN THE Application SHALL refuser la modification, conserver la valeur antérieure et afficher un message indiquant que le délai est invalide.
8. THE Application SHALL consigner dans l'Historique_Rappels de chaque Reservation_Billet une entrée horodatée par rappel transmis ou tenté, indiquant le type et le résultat.

### Requirement 13: Infrastructure WhatsApp centralisée et partagée

**User Story:** En tant que responsable technique, je veux que toutes les communications WhatsApp reposent sur une infrastructure d'envoi unique, afin d'éviter la duplication et de centraliser l'historique des messages.

#### Acceptance Criteria

1. THE Application SHALL transmettre tout message WhatsApp sortant — Publication_Offre, échange lié à une Commande_Distante, relance d'abonnement, rappel de vol et Campagne_Marketing — au moyen de l'unique Service_Envoi et de la Passerelle_WhatsApp définis dans la spec whatsapp-client-reminders.
2. THE Application SHALL consigner chaque message WhatsApp sortant dans l'Historique_Messages_WhatsApp partagé en indiquant la fonctionnalité émettrice, l'horodatage, le destinataire et le résultat.
3. THE Application SHALL n'employer aucun autre canal d'envoi de messages WhatsApp que le Service_Envoi partagé.
4. WHEN un message WhatsApp sortant est demandé, THE Application SHALL respecter la Limite_de_Debit imposée par la Passerelle_WhatsApp.
5. IF la Passerelle_WhatsApp est indisponible ou retourne une erreur lors d'un envoi, THEN THE Application SHALL consigner l'échec dans l'Historique_Messages_WhatsApp et programmer une nouvelle tentative sans interrompre les autres fonctionnalités.
6. THE Application SHALL rattacher chaque message WhatsApp sortant à un Numero_WhatsApp_Agence émetteur au moyen d'un modèle autorisant structurellement plusieurs Numero_WhatsApp_Agence par Agence, en utilisant le Numero_WhatsApp_Agence par défaut dans cette version.

### Requirement 14: Publication d'offre et commande à distance

**User Story:** En tant que Propriétaire_Agence, je veux publier une offre et permettre à un client distant de passer une commande simple avec une preuve, afin de capter des demandes sans présence au guichet.

#### Acceptance Criteria

1. WHERE le Module_Fonctionnel `publication_whatsapp` est activé pour l'Agence, THE Application SHALL permettre la diffusion d'une Publication_Offre via le Service_Envoi.
2. WHERE le Module_Fonctionnel `commande_distance` est activé pour l'Agence, THE Application SHALL générer un Lien_Commande contenant un jeton non devinable d'au moins 128 bits d'entropie donnant accès au Formulaire_Commande de l'Agence.
3. WHEN un client distant ouvre un Lien_Commande valide, THE Application SHALL afficher le Formulaire_Commande sans exiger de compte authentifié.
4. WHEN un client distant soumet le Formulaire_Commande avec l'ensemble des champs requis et joint une Preuve, THE Application SHALL enregistrer une Commande_Distante à traiter rattachée à l'Agence et consigner la Preuve.
5. IF un Lien_Commande comporte un jeton inconnu, révoqué ou expiré, THEN THE Application SHALL refuser l'accès au Formulaire_Commande et afficher un message indiquant que le lien est invalide.
6. IF le Formulaire_Commande est soumis avec un champ requis manquant, THEN THE Application SHALL refuser l'enregistrement, ne créer aucune Commande_Distante et afficher un message indiquant le champ manquant.
7. THE Application SHALL traiter une Commande_Distante comme une proposition exigeant une Confirmation par un Utilisateur disposant de la Permission requise avant tout enregistrement définitif en Operation ou en Service_Additionnel.

### Requirement 15: Registre d'agents IA et validation humaine systématique

**User Story:** En tant que Propriétaire_Agence, je veux que les agents IA proposent mais n'exécutent jamais d'action critique sans ma validation, afin de garder le contrôle sur les effets persistants et externes.

#### Acceptance Criteria

1. THE Application SHALL tenir un Registre_Agents extensible recensant les types d'Agent_IA disponibles.
2. THE Application SHALL initialiser le Registre_Agents avec exactement les six types d'Agent_IA anticipés `forex`, `comptabilite`, `service_client`, `whatsapp`, `analyse_financiere` et `marketing`, et SHALL autoriser l'ajout ultérieur de nouveaux types.
3. WHEN un Agent_IA propose une Action_Critique, THE Application SHALL exiger une Confirmation explicite par un Utilisateur disposant de la Permission requise avant toute exécution ou tout enregistrement définitif.
4. IF une Action_Critique proposée par un Agent_IA n'a pas reçu de Confirmation, THEN THE Application SHALL n'exécuter aucun effet persistant ou externe associé à cette action.
5. THE Application SHALL consigner, pour chaque Action_Critique exécutée à la suite d'une proposition d'un Agent_IA, l'identité de l'Utilisateur ayant donné la Confirmation et l'horodatage.
6. THE Application SHALL appliquer l'exigence de Confirmation préalable à toute Action_Critique proposée par tout type d'Agent_IA du Registre_Agents, y compris les types ajoutés ultérieurement.

### Requirement 16: Conception et expérience utilisateur premium

**User Story:** En tant que caissier, je veux une interface moderne, claire et tactile que j'apprends en quelques minutes, afin de réaliser mes opérations rapidement et sans erreur.

#### Acceptance Criteria

1. THE Application SHALL présenter l'ensemble des écrans en Theme_Clair uniquement et SHALL n'offrir aucun mode sombre dans cette version.
2. THE Application SHALL adapter sa mise en page de manière responsive aux largeurs d'affichage mobile (au plus 480 pixels CSS), tablette (de 481 à 1024 pixels CSS) et ordinateur (plus de 1024 pixels CSS), sans perte de fonctionnalité ni défilement horizontal.
3. THE Application SHALL dimensionner chaque Cible_Tactile à au moins 44 × 44 pixels CSS.
4. THE Application SHALL permettre la réalisation d'une Operation_Courante en au plus 5 interactions principales, hors saisie des valeurs propres à l'opération.
5. THE Application SHALL réutiliser le Systeme_Design existant pour les nouveaux écrans afin d'assurer des tableaux lisibles et des boutons d'action de grande taille.
6. THE Application SHALL appliquer un rapport de contraste d'au moins 4,5:1 entre le texte de taille normale et son arrière-plan.
7. THE Application SHALL afficher l'ensemble des libellés d'interface des nouveaux écrans via les Fichiers_Traduction `fr` et `en`.

### Requirement 17: Performance et scalabilité

**User Story:** En tant qu'utilisateur d'une agence active depuis plusieurs années, je veux que l'application reste fluide malgré un historique volumineux et plusieurs employés connectés, afin de travailler sans ralentissement.

#### Acceptance Criteria

1. WHERE une vue affiche une liste d'Operations, de Clients, d'Abonnements ou de Reservations_Billet, THE Application SHALL paginer cette liste avec une taille de page d'au plus 50 éléments.
2. WHEN une vue de liste paginée est ouverte pour une Agence comportant jusqu'à 50 000 Operations réparties sur plusieurs années, THE Application SHALL afficher la première page en 2 secondes ou moins dans des conditions réseau nominales.
3. THE Application SHALL définir des index de base de données sur les colonnes de filtrage et de tri des listes paginées, dont l'identifiant d'Agence et la date.
4. THE Application SHALL charger les données des listes de manière progressive, par pagination ou chargement à la demande, plutôt que de charger l'intégralité de l'historique en une seule requête.
5. WHEN un filtre ou un tri est appliqué à une liste paginée d'une Agence comportant jusqu'à 50 000 Operations, THE Application SHALL retourner la page filtrée ou triée en 2 secondes ou moins dans des conditions réseau nominales.
6. WHILE plusieurs Comptes_Employés d'une même Agence sont connectés simultanément, THE Application SHALL traiter leurs lectures et écritures sans corruption de données ni perte de mise à jour.

### Requirement 18: Non-régression des fonctionnalités existantes

**User Story:** En tant que mainteneur, je veux que l'extension préserve les comportements existants, afin d'éviter toute régression des fonctionnalités déjà livrées.

#### Acceptance Criteria

1. THE Application SHALL préserver le comportement existant de saisie d'Operation, d'ajustement du Taux_Change et de calcul des commissions et bénéfices défini dans `src/utils/finance.js` et vérifié par `src/utils/finance.test.js`.
2. THE Application SHALL préserver le contrôle d'accès payant et le modèle `access_profiles` de la spec paid-access-control, en l'étendant sans en supprimer le comportement.
3. THE Application SHALL réutiliser, sans le dupliquer, le canal WhatsApp sortant et l'historique de relances de la spec whatsapp-client-reminders comme infrastructure d'envoi unique.
4. THE Application SHALL préserver le fonctionnement de l'Agent_Vocal existant (`src/components/VoiceAgentModal.jsx`) pour la saisie des opérations et l'ajustement du Taux_Change.
5. WHEN les suites de tests existantes sont exécutées après l'intégration de cette fonctionnalité, THE Application SHALL réussir l'ensemble de ces tests sans régression.
6. WHEN la migration de cette fonctionnalité est appliquée, THE Application SHALL conserver les Operations, Clients et données existantes accessibles en les rattachant à l'Agence par défaut de leur Propriétaire_Agence.
