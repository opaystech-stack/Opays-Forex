# Requirements Document

## Introduction

Cette fonctionnalité restreint l'accès à l'application OpaysFox aux seuls utilisateurs dont l'accès a été **activé manuellement par l'administrateur** après réception et vérification d'un paiement. L'application étant un PWA React + Vite adossé à Supabase (authentification + base de données + stockage), l'authentification existante (e-mail/mot de passe, Google) est conservée : un utilisateur peut toujours créer un compte et se connecter, mais ne peut **utiliser** l'application qu'une fois son accès autorisé.

Les contraintes du projet imposent des solutions open source et l'absence d'API payantes. Les paiements sont donc traités **manuellement** au démarrage :

- L'utilisateur consulte une page indiquant les coordonnées de paiement (Bitcoin/Lightning, USDT, Mobile Money).
- L'utilisateur effectue le paiement par le canal de son choix, puis soumet une **preuve de paiement** (capture/reçu) via l'application.
- L'administrateur vérifie la preuve depuis une interface d'administration, puis **active ou désactive** l'accès.
- Tant que l'accès n'est pas activé, l'utilisateur voit une page « Accès restreint » avec les instructions de paiement.

Référence d'inspiration analysée : [getlago/lago](https://github.com/getlago/lago) est une plateforme de facturation open source orientée *metering* et facturation automatisée à grande échelle (event-based billing, gestion d'abonnements, intégrations PSP). Elle dépasse largement le besoin actuel — activation manuelle binaire d'un petit nombre de comptes — et nécessiterait un déploiement de services additionnels (API Ruby, base dédiée). Pour la V1, Lago est donc **écarté**. Ses concepts (statut d'abonnement, table de comptes facturables) restent une référence utile pour une future automatisation lorsque l'application sera rentable.

Cette fonctionnalité couvre exclusivement le **contrôle d'accès par activation manuelle** et la **collecte de preuves de paiement**. Elle ne traite pas la vérification automatique des paiements on-chain ni l'intégration de passerelles Visa, reportées à une phase ultérieure.

## Glossary

- **Application** : le PWA OpaysFox de suivi forex/trésorerie (front React + Vite, données Supabase).
- **Utilisateur** : personne authentifiée disposant d'un compte Supabase Auth, qui souhaite utiliser l'Application.
- **Administrateur** : l'unique propriétaire/exploitant de l'Application, identifié par un rôle privilégié, qui valide les paiements et gère les accès.
- **Profil_Accès** : enregistrement en base associé à un Utilisateur, contenant notamment le champ `acces_autorise`, le rôle et l'horodatage d'activation.
- **Acces_Autorise** : champ booléen du Profil_Accès indiquant si l'Utilisateur peut utiliser l'Application (`true`) ou non (`false`).
- **Preuve_Paiement** : enregistrement soumis par l'Utilisateur attestant d'un paiement, comprenant le mode de paiement, une référence optionnelle et un fichier reçu téléversé.
- **Reçu** : fichier image ou PDF téléversé par l'Utilisateur dans Supabase Storage comme justificatif de paiement.
- **Page_Paiement** : page affichant les coordonnées de paiement et la procédure de soumission de preuve.
- **Page_Acces_Restreint** : page affichée à un Utilisateur authentifié dont `acces_autorise` vaut `false`.
- **Page_Connexion** : page de connexion existante de l'Application.
- **Console_Admin** : interface réservée à l'Administrateur pour consulter les preuves et activer/désactiver les accès.
- **Coordonnées_Paiement** : ensemble des informations de paiement configurées (adresse Bitcoin, adresse/invoice Lightning, adresse USDT, numéros Mobile Money).
- **Mode_Paiement** : canal de paiement choisi parmi `bitcoin`, `lightning`, `usdt`, `mobile_money`.
- **Statut_Preuve** : état d'une Preuve_Paiement parmi `en_attente`, `validee`, `rejetee`.
- **Stockage_Reçus** : bucket Supabase Storage dédié aux fichiers Reçu.
- **RLS** : Row Level Security de PostgreSQL/Supabase, utilisé pour contrôler l'accès aux données par utilisateur et par rôle.

## Requirements

### Requirement 1: Modèle de données du Profil_Accès

**User Story:** En tant qu'Administrateur, je veux que chaque Utilisateur dispose d'un champ d'autorisation d'accès en base, afin de pouvoir contrôler qui peut utiliser l'Application.

#### Acceptance Criteria

1. WHEN un Utilisateur est créé dans Supabase Auth, THE Application SHALL créer, dans un délai maximal de 5 secondes, un Profil_Accès unique associé à l'identifiant de cet Utilisateur.
2. WHEN un Profil_Accès est créé, THE Application SHALL initialiser le champ `acces_autorise` à la valeur `false`.
3. WHEN un Profil_Accès est créé, THE Application SHALL initialiser le champ rôle à la valeur `user`.
4. THE Profil_Accès SHALL contenir l'identifiant de l'Utilisateur, le champ `acces_autorise` (valeur booléenne `true` ou `false`), le champ rôle (valeur unique parmi l'ensemble fermé `user` ou `admin`), l'horodatage de création et l'horodatage de dernière activation, chaque horodatage étant exprimé au format ISO 8601 en UTC.
5. WHERE un Profil_Accès a son champ `acces_autorise` à `true`, THE Profil_Accès SHALL contenir l'identifiant de l'Administrateur ayant réalisé l'activation ainsi que l'horodatage de dernière activation renseigné.
6. THE Application SHALL appliquer une politique RLS autorisant un Utilisateur à lire uniquement le Profil_Accès dont l'identifiant d'Utilisateur correspond à son propre identifiant, et refusant en lecture tout autre Profil_Accès.
7. IF un Utilisateur de rôle `user` tente de modifier le champ `acces_autorise` de tout Profil_Accès, THEN THE Application SHALL refuser l'opération via une politique RLS, conserver la valeur existante du champ inchangée et retourner une indication de refus d'accès à l'appelant.
8. IF un enregistrement de Profil_Accès présente `acces_autorise` à `true` sans identifiant d'Administrateur associé, THEN THE Application SHALL refuser l'enregistrement, conserver l'état antérieur du Profil_Accès inchangé et retourner une indication d'erreur de validation à l'appelant.
9. IF la création du Profil_Accès échoue après la création de l'Utilisateur dans Supabase Auth, THEN THE Application SHALL maintenir l'Utilisateur sans accès (champ `acces_autorise` considéré comme `false`) et retourner une indication d'erreur signalant l'échec de création du Profil_Accès.

### Requirement 2: Restriction d'accès à l'Application (gating)

**User Story:** En tant qu'Administrateur, je veux que seuls les Utilisateurs activés accèdent aux fonctionnalités, afin que l'usage soit réservé aux Utilisateurs ayant payé.

#### Acceptance Criteria

1. WHEN un Utilisateur authentifié dont `acces_autorise` vaut `true` ouvre l'Application, THE Application SHALL afficher les fonctionnalités de trésorerie de l'Application.
2. IF un Utilisateur authentifié dont `acces_autorise` vaut `false` tente d'accéder à une fonctionnalité de trésorerie, THEN THE Application SHALL afficher la Page_Acces_Restreint à la place et n'afficher aucune donnée de trésorerie.
3. WHILE le Profil_Accès d'un Utilisateur authentifié est en cours de chargement, THE Application SHALL masquer les fonctionnalités de trésorerie et afficher un indicateur de chargement.
4. IF le chargement du Profil_Accès échoue ou dépasse un délai de 10 secondes, THEN THE Application SHALL considérer l'Utilisateur comme non autorisé, afficher la Page_Acces_Restreint et n'afficher aucune donnée de trésorerie.
5. IF un Utilisateur n'est pas authentifié, THEN THE Application SHALL rediriger l'Utilisateur vers la Page_Connexion existante.
6. WHEN l'Administrateur passe `acces_autorise` à `false` pour un Utilisateur, THE Application SHALL afficher la Page_Acces_Restreint à cet Utilisateur au plus tard lors de sa première requête de données de trésorerie suivant ce changement.
7. THE Application SHALL appliquer la restriction d'accès côté base de données via une politique RLS exigeant `acces_autorise` à `true` pour lire ou écrire les données de trésorerie.
8. IF une politique RLS refuse une opération de lecture ou d'écriture de données de trésorerie, THEN THE Application SHALL afficher un message de restriction d'accès et ne modifier aucune donnée de trésorerie.

### Requirement 3: Page « Accès restreint »

**User Story:** En tant qu'Utilisateur non encore activé, je veux comprendre pourquoi je n'ai pas accès et savoir comment payer, afin d'obtenir l'activation de mon compte.

#### Acceptance Criteria

1. WHEN la Page_Acces_Restreint s'affiche, THE Application SHALL afficher un message indiquant que l'accès au compte nécessite un paiement validé par l'Administrateur.
2. THE Page_Acces_Restreint SHALL afficher un unique élément interactif (lien ou bouton) menant à la Page_Paiement.
3. WHEN l'Utilisateur active l'élément interactif menant à la Page_Paiement, THE Application SHALL rediriger l'Utilisateur vers la Page_Paiement.
4. WHERE l'Utilisateur a déjà soumis au moins une Preuve_Paiement, THE Page_Acces_Restreint SHALL afficher le Statut_Preuve (parmi : `en_attente`, `validee`, `rejetee`) le plus récent de cet Utilisateur.
5. WHERE l'Utilisateur n'a soumis aucune Preuve_Paiement, THE Page_Acces_Restreint SHALL afficher une indication signalant qu'aucune Preuve_Paiement n'a encore été soumise.
6. THE Page_Acces_Restreint SHALL afficher une action de déconnexion.
7. WHEN l'Utilisateur active l'action de déconnexion, THE Application SHALL clôturer la session de l'Utilisateur et le rediriger vers la Page_Connexion.
8. THE Page_Acces_Restreint SHALL afficher son contenu dans la langue sélectionnée par l'Utilisateur, conformément au système d'internationalisation existant.

### Requirement 4: Page de paiement et coordonnées

**User Story:** En tant qu'Utilisateur non encore activé, je veux consulter les coordonnées de paiement et la procédure, afin de payer par le moyen de mon choix.

#### Acceptance Criteria

1. THE Page_Paiement SHALL afficher l'adresse Bitcoin configurée dans les Coordonnées_Paiement.
2. THE Page_Paiement SHALL afficher l'adresse ou l'invoice Lightning configurée dans les Coordonnées_Paiement.
3. THE Page_Paiement SHALL afficher l'adresse USDT configurée ainsi que le réseau associé.
4. THE Page_Paiement SHALL afficher les numéros Mobile Money configurés avec leur devise et leur libellé.
5. WHERE une adresse de cryptomonnaie est affichée, THE Page_Paiement SHALL fournir un bouton de copie associé à cette adresse.
6. WHEN l'Utilisateur active le bouton de copie d'une adresse affichée, THE Page_Paiement SHALL copier l'intégralité de cette adresse dans le presse-papiers et afficher une confirmation visuelle de copie pendant 2 à 5 secondes.
7. IF la copie d'une adresse dans le presse-papiers échoue, THEN THE Page_Paiement SHALL afficher une indication d'erreur invitant à copier l'adresse manuellement et SHALL conserver l'adresse affichée et sélectionnable.
8. THE Page_Paiement SHALL afficher la procédure d'envoi de la Preuve_Paiement en cinq étapes au maximum.
9. WHERE un Mode_Paiement n'a pas de Coordonnée_Paiement configurée, THE Page_Paiement SHALL masquer uniquement l'option de paiement correspondante et afficher les autres Modes_Paiement configurés.
10. IF aucun Mode_Paiement n'a de Coordonnée_Paiement configurée, THEN THE Page_Paiement SHALL afficher un message indiquant qu'aucun moyen de paiement n'est actuellement disponible.
11. THE Page_Paiement SHALL afficher son contenu dans la langue sélectionnée par l'Utilisateur conformément au système d'internationalisation existant, et SHALL utiliser la langue par défaut du système pour tout élément dépourvu de traduction dans la langue sélectionnée.

### Requirement 5: Soumission d'une preuve de paiement

**User Story:** En tant qu'Utilisateur ayant payé, je veux soumettre un reçu via l'Application, afin que l'Administrateur puisse vérifier mon paiement.

#### Acceptance Criteria

1. WHEN l'Utilisateur soumet une Preuve_Paiement avec un Mode_Paiement appartenant à la liste des modes acceptés et un Reçu satisfaisant les contraintes de format et de taille définies aux critères 4 et 5, THE Application SHALL enregistrer la Preuve_Paiement avec le Statut_Preuve `en_attente` en moins de 5 secondes.
2. WHEN l'Utilisateur soumet un Reçu valide, THE Application SHALL téléverser le fichier dans le Stockage_Reçus et associer son chemin à la Preuve_Paiement.
3. IF l'Utilisateur soumet une Preuve_Paiement sans Reçu, THEN THE Application SHALL refuser la soumission, n'enregistrer aucune Preuve_Paiement et afficher un message indiquant qu'un Reçu est requis.
4. IF l'Utilisateur soumet un Reçu dont le type n'est pas une image (PNG, JPEG, WEBP) ou un PDF, THEN THE Application SHALL refuser la soumission, n'enregistrer aucune Preuve_Paiement et afficher un message indiquant les formats acceptés.
5. IF l'Utilisateur soumet un Reçu dont la taille est nulle (0 octet) ou dépasse 5 mégaoctets, THEN THE Application SHALL refuser la soumission, n'enregistrer aucune Preuve_Paiement et afficher un message indiquant la plage de taille autorisée (supérieure à 0 octet et au plus 5 mégaoctets).
6. IF l'Utilisateur soumet une Preuve_Paiement avec un Mode_Paiement n'appartenant pas à la liste des modes acceptés, THEN THE Application SHALL refuser la soumission, n'enregistrer aucune Preuve_Paiement et afficher un message indiquant les modes de paiement acceptés.
7. IF le téléversement du Reçu dans le Stockage_Reçus échoue, THEN THE Application SHALL refuser la soumission, n'enregistrer aucune Preuve_Paiement ni chemin de Reçu et afficher un message indiquant que l'enregistrement du Reçu a échoué et invitant à réessayer.
8. WHEN une Preuve_Paiement est enregistrée, THE Application SHALL associer l'identifiant de l'Utilisateur, le Mode_Paiement, la référence optionnelle, le chemin du Reçu et l'horodatage de soumission.
9. WHEN une Preuve_Paiement est enregistrée avec succès, THE Application SHALL afficher à l'Utilisateur une confirmation de réception en moins de 5 secondes.
10. THE Application SHALL appliquer une politique RLS autorisant un Utilisateur à créer et lire uniquement ses propres Preuves_Paiement.

### Requirement 6: Console d'administration des accès

**User Story:** En tant qu'Administrateur, je veux consulter les Utilisateurs et leurs preuves de paiement et activer ou désactiver leur accès, afin de donner l'accès après vérification d'un paiement.

#### Acceptance Criteria

1. WHEN l'Administrateur ouvre la Console_Admin, THE Application SHALL afficher la liste des Utilisateurs, triée par horodatage de soumission de Preuve_Paiement la plus récente en premier, avec au maximum 50 Utilisateurs par page, en affichant pour chaque Utilisateur son e-mail, sa valeur `acces_autorise` et son Statut_Preuve le plus récent.
2. WHERE aucun Utilisateur ne correspond aux critères affichés, THE Console_Admin SHALL afficher une indication signalant l'absence d'Utilisateur à afficher.
3. WHEN l'Administrateur sélectionne une Preuve_Paiement, THE Application SHALL afficher le Mode_Paiement, la référence, l'horodatage de soumission et un aperçu du Reçu.
4. WHEN l'Administrateur active l'accès d'un Utilisateur, THE Application SHALL passer le champ `acces_autorise` de cet Utilisateur à `true` et enregistrer l'horodatage d'activation et l'identifiant de l'Administrateur.
5. WHEN l'Administrateur désactive l'accès d'un Utilisateur, THE Application SHALL passer le champ `acces_autorise` de cet Utilisateur à `false` et enregistrer l'horodatage de l'opération et l'identifiant de l'Administrateur.
6. WHEN l'Administrateur valide une Preuve_Paiement, THE Application SHALL passer le Statut_Preuve à `validee` et enregistrer l'horodatage de l'opération et l'identifiant de l'Administrateur.
7. WHEN l'Administrateur rejette une Preuve_Paiement, THE Application SHALL passer le Statut_Preuve à `rejetee` et enregistrer l'horodatage de l'opération et l'identifiant de l'Administrateur.
8. IF la mise à jour du champ `acces_autorise` échoue, THEN THE Application SHALL conserver la valeur précédente du champ et afficher un message d'erreur signalant l'échec de l'opération.
9. IF un Utilisateur de rôle `user` tente d'accéder à la Console_Admin, THEN THE Application SHALL refuser l'accès et afficher la Page_Acces_Restreint.
10. THE Application SHALL appliquer une politique RLS autorisant uniquement un Utilisateur de rôle `admin` à lire l'ensemble des Profils_Accès et des Preuves_Paiement et à modifier le champ `acces_autorise`.
11. WHERE l'Administrateur consulte un Reçu, THE Application SHALL générer une URL signée d'une durée de validité maximale de 300 secondes pour afficher le fichier depuis le Stockage_Reçus.
12. IF le Reçu associé à une Preuve_Paiement est introuvable ou indisponible, THEN THE Application SHALL afficher une indication signalant que le Reçu est indisponible.

### Requirement 7: Sécurité du stockage des reçus

**User Story:** En tant qu'Administrateur, je veux que les reçus soient stockés de manière privée, afin de protéger les données de paiement des Utilisateurs.

#### Acceptance Criteria

1. THE Stockage_Reçus SHALL être configuré comme bucket privé, de sorte que toute requête de lecture ou d'écriture non authentifiée soit refusée et qu'aucun Reçu ne soit accessible via une URL publique directe.
2. WHEN un Utilisateur authentifié téléverse un Reçu valide (format image ou PDF, taille inférieure ou égale à 5 mégaoctets), THE Application SHALL stocker le fichier dans un dossier dont le nom correspond à l'identifiant unique de cet Utilisateur.
3. IF un Utilisateur téléverse un fichier dont le format n'est pas une image ou un PDF, ou dont la taille dépasse 5 mégaoctets, THEN THE Application SHALL rejeter le téléversement, ne stocker aucun fichier et afficher un message d'erreur indiquant le format et la taille maximale autorisés.
4. THE Application SHALL appliquer une politique de stockage autorisant un Utilisateur à téléverser et lire uniquement les Reçus situés dans son propre dossier.
5. IF un Utilisateur de rôle non `admin` tente de lire ou de téléverser un Reçu situé dans le dossier d'un autre Utilisateur, THEN THE Application SHALL refuser l'opération et ne retourner aucun contenu du fichier demandé.
6. WHERE l'Utilisateur possède le rôle `admin`, THE Application SHALL appliquer une politique de stockage autorisant la lecture de l'ensemble des Reçus de tous les Utilisateurs.
