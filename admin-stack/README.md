# OpaysFox — Espace Admin Unifié (Directus + Hermes Agent)

Stack d'administration **low-code + agents IA** pour OpaysFox, déployable sur
Dokploy et branchée sur la **base PostgreSQL existante** (la même que l'API
Fastify). Elle n'introduit aucune base parallèle : zéro divergence de données.

## Composants
| Service | Rôle | Image / Build |
|---------|------|---------------|
| `directus` | UI admin / CRM / RBAC sur le schéma Postgres existant | `directus/directus:11` |
| `hermes` | Agents IA planifiés (Comptable, CRM, Sécurité) | build `./hermes` |

## Architecture
```
                ┌──────────────┐        introspection / RBAC
   Admins  ───▶ │   Directus   │ ───────────────────────────┐
                └──────────────┘                             ▼
                                                   ┌────────────────────┐
   Cron ──▶  ┌──────────────┐   requêtes SQL  ───▶ │  PostgreSQL Dokploy │
             │ Hermes Agent │ ◀──────────────────  │  (base OpaysFox)    │
             └──────────────┘                       └────────────────────┘
              (Comptable / CRM / Sécurité)             ▲
                                                       │ API Fastify (app)
```

## 1. Prérequis
- La base PostgreSQL OpaysFox est déployée et le schéma `api/schema.sql` appliqué.
- Le réseau Docker/Dokploy permet à `directus` et `hermes` d'atteindre la base
  (renseigner `DB_HOST` / `DATABASE_URL`).

## 2. Configuration
```bash
cp .env.example .env
# Renseignez DB_*, DATABASE_URL, DIRECTUS_KEY/SECRET (openssl rand -hex 32),
# l'admin Directus, et (optionnel) GEMINI_API_KEY / WhatsApp.
```

## 3. Déploiement (Dokploy ou local)
```bash
docker compose up -d            # directus + hermes
docker compose logs -f hermes   # vérifier la planification des agents
```
Directus est disponible sur `:8055` (ou `DIRECTUS_PUBLIC_URL`). Voir
`directus/README.md` pour la configuration des collections et `directus/permissions.md`
pour les rôles.

## 4. Agents Hermes
| Agent | Fichier | Planif. défaut | Effet |
|-------|---------|----------------|-------|
| Comptable | `hermes/agents/accountant.js` | `0 22 * * *` | mémo de clôture + bénéfice USD → `closing_memos` |
| CRM | `hermes/agents/crm.js` | `0 9 * * *` | relances clients inactifs (>15 j) → `reminder_history` (queued) |
| Sécurité | `hermes/agents/security.js` | `0 * * * *` | anomalies `audit_logs` → `security_alerts` |

**Sécurité d'exécution** : `HERMES_DRY_RUN=true` par défaut → les agents
**calculent et journalisent en console sans aucune écriture** en base. Passez à
`false` une fois les résultats validés. Exécution manuelle :
```bash
docker compose exec hermes npm run agent:accountant
docker compose exec hermes npm run agent:crm
docker compose exec hermes npm run agent:security
# ou, au démarrage : RUN_ON_BOOT=true
```

## 5. Tables créées par les agents (idempotent, hors DRY_RUN)
- `closing_memos` (Comptable)
- `security_alerts` (Sécurité)
- `reminder_history` est réutilisée (déjà au schéma applicatif).

## 6. Sécurité & bonnes pratiques
- Secrets forts obligatoires (Directus KEY/SECRET, mot de passe admin).
- Isolation par agence via filtres de permission Directus (`agency_id`).
- Collections financières en **lecture seule** côté admin : toute mutation
  monétaire passe par l'API Fastify (recalcul serveur R4/R5).
- Gemini et WhatsApp sont **optionnels** : sans clé, l'agent CRM utilise un
  gabarit local et ne fait aucun envoi.

## 7. Limites connues
- Les agents sont des **gabarits** : adaptez les seuils et les requêtes à vos
  données réelles avant de désactiver `DRY_RUN`.
- Validez les permissions Directus en staging avant production (les filtres
  d'agence dépendent du mapping `agency_id` sur les comptes admin).
