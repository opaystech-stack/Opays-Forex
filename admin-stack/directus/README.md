# Directus — Espace Admin Unifié OpaysFox

Directus s'introspecte sur la base PostgreSQL **existante** d'OpaysFox et expose
une UI d'administration (CRM, abonnements, modules premium) avec RBAC, sans
réécrire de backend.

## Pourquoi Directus (vs alternatives)
- **Directus (recommandé)** : se branche en lecture/écriture sur un schéma
  Postgres existant, RBAC fin par collection/champ, Flows (automatisations),
  REST/GraphQL auto, UI moderne. Idéal pour un schéma déjà modélisé.
- **NocoDB** (alternative) : excellente UI tableur sur base existante, RBAC plus
  simple ; bon choix si l'on privilégie la saisie type tableur.
- **PocketBase** : écarté ici — embarque sa propre base SQLite, ne se branche pas
  sur un Postgres externe existant.

## Premier démarrage
1. `docker compose up -d directus` (voir `../docker-compose.yml`).
2. Directus introspecte les tables. Connectez-vous avec `DIRECTUS_ADMIN_EMAIL` /
   `DIRECTUS_ADMIN_PASSWORD`.
3. Dans Settings → Data Model, rendez visibles les collections utiles
   (`customers`, `agencies`, `subscriptions`, `payment_proofs`, `uploads`,
   `module_states`, `module_entitlements`, `transactions`, `debts`).

## Rôles & permissions (gabarit)
Voir `permissions.md`. Principe : **moindre privilège**, isolation par agence
via filtres de permission Directus (`agency_id` = agence de l'utilisateur), et
collections financières en **lecture seule** pour les rôles non-éditeurs.

## Cas d'usage couverts
- **CRM 360°** : collection `customers` + panneaux liés (transactions récentes,
  récence, notes via champ `metadata`/note).
- **Validation des abonnements** : collection `subscriptions` + `payment_proofs`
  (recherche, prévisualisation du reçu via l'URL de l'upload, passage du statut
  `en_attente` → `valide`).
- **Modules premium** : collections `module_states` / `module_entitlements`
  (activation/désactivation par agence).
