# Matrice de rôles & permissions (Directus)

À reproduire dans Settings → Roles & Permissions. Objectif : moindre privilège,
isolation par agence, données financières non altérables hors éditeur.

## Rôles
| Rôle | Description |
|------|-------------|
| `Administrator` (intégré) | Accès total (réservé à l'exploitant plateforme). |
| `Editeur_Plateforme` | Supervise toutes les agences : modules, abonnements, CRM. |
| `Support_Agence` | Lecture CRM + validation des preuves, **limité à son agence**. |
| `Observateur` | Lecture seule (reporting). |

## Permissions par collection (résumé)
| Collection | Editeur_Plateforme | Support_Agence | Observateur |
|------------|--------------------|----------------|-------------|
| `customers` | CRUD | Read/Update (agence) | Read |
| `subscriptions` | CRUD | Read/Update statut (agence) | Read |
| `payment_proofs` | CRUD | Read/Update statut (agence) | Read |
| `module_states` | CRUD | — | Read |
| `module_entitlements` | CRUD | — | — |
| `transactions` | **Read only** | Read (agence) | Read (agence) |
| `wallets` | **Read only** | Read (agence) | Read (agence) |
| `debts` | Read | Read (agence) | Read (agence) |
| `uploads` | Read | Read (agence) | — |
| `users` / `agencies` | CRUD (plateforme) | — | — |

## Filtre d'isolation par agence (Support_Agence / Observateur)
Sur chaque collection portant `agency_id`, ajouter un **filtre de permission** :

```
agency_id = $CURRENT_USER.agency_id
```

(le champ `agency_id` doit exister sur l'utilisateur Directus ou être mappé
depuis le profil). Cela réplique, côté admin, l'étanchéité R1/R2 garantie par
l'API Fastify (`tenant.js`).

## Bonnes pratiques
- Ne jamais exposer `password_hash` (refuser la lecture du champ).
- Collections financières en lecture seule : la mutation passe par l'API Fastify
  (recalcul serveur R4/R5), pas par l'admin, pour préserver l'intégrité.
- Activer 2FA sur les comptes `Administrator` / `Editeur_Plateforme`.
