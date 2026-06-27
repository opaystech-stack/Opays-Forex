# Rapport_Audit — Audit d'intégrité financière

> Livrable généré automatiquement par `scripts/audit/runAudit.js` (spec financial-ops-audit-voice-agent, tâche 13.6).

_Généré le : 2026-06-14T12:07:09.669Z_

Ce rapport agrège les quatre axes d'audit (calculs, sécurité, schéma, erreurs). Chaque écart précise le fichier, la ligne, la sévérité, la valeur attendue vs constatée et une description. Un fichier source illisible interrompt uniquement l'audit concerné : son erreur est consignée et les autres axes se poursuivent.

## Sommaire global

| Axe | Écarts | Détail |
|-----|--------|--------|
| calculs | 0 | Intégrité des calculs |
| securite | 0 | Navigation, contrôleurs et sécurité (RLS) |
| schema | 0 | Cohérence du schéma de données (verdict : cohérent) |
| erreurs | 2 | Recensement des erreurs financières non gérées |
| agentshield | 9 | Sécurité et intégrité opérationnelle (AgentShield) |
| **Total** | **11** | Tous axes confondus |

Répartition par sévérité : mineur : **2** · Élevée : **9**

---

## Axe « calculs » — Intégrité des calculs

Nombre d'écarts : **0**

_Aucun écart détecté pour cet axe._

## Axe « securite » — Navigation, contrôleurs et sécurité (RLS)

Nombre d'écarts : **0**

_Aucun écart détecté pour cet axe._

## Axe « schema » — Cohérence du schéma de données

Nombre d'écarts : **0**

**Récapitulatif schéma** : 0 écart(s) — verdict **cohérent**.

_Aucun écart détecté pour cet axe._

## Axe « erreurs » — Recensement des erreurs financières non gérées

Nombre d'écarts : **2**

| # | Fichier | Ligne | Sévérité | Attendu | Constaté | Description |
|---|---------|-------|----------|---------|----------|-------------|
| 1 | src/pages/Transactions.jsx | 309 | mineur | — | — | Cas d'erreur financière non couvert au niveau UI/agents (Transactions.jsx) : Montant invalide. Pris en charge côté contexte (AppContext.jsx) ; vérifier la remontée explicite du message à l'Opérateur. |
| 2 | src/pages/Transactions.jsx | 309 | mineur | — | — | Cas d'erreur financière non couvert au niveau UI/agents (Transactions.jsx) : Doublon par transaction_id réseau. Pris en charge côté contexte (AppContext.jsx) ; vérifier la remontée explicite du message à l'Opérateur. |

## Axe « agentshield » — Sécurité et intégrité opérationnelle (AgentShield)

Nombre d'écarts : **9**

| # | Fichier | Ligne | Sévérité | Attendu | Constaté | Description |
|---|---------|-------|----------|---------|----------|-------------|
| 1 | supabase_schema.sql | 241 | Élevée | Politique RLS Supabase restrictive pour le rôle anonyme | Accès total (FOR ALL) autorisé pour le rôle anonyme | Politique de sécurité permissive détectée à la ligne 241 : les utilisateurs anonymes ont un accès complet (lecture/écriture/suppression) sans restriction d'identité. Recommandé uniquement pour le prototypage V1 privée. |
| 2 | supabase_schema.sql | 244 | Élevée | Politique RLS Supabase restrictive pour le rôle anonyme | Accès total (FOR ALL) autorisé pour le rôle anonyme | Politique de sécurité permissive détectée à la ligne 244 : les utilisateurs anonymes ont un accès complet (lecture/écriture/suppression) sans restriction d'identité. Recommandé uniquement pour le prototypage V1 privée. |
| 3 | supabase_schema.sql | 247 | Élevée | Politique RLS Supabase restrictive pour le rôle anonyme | Accès total (FOR ALL) autorisé pour le rôle anonyme | Politique de sécurité permissive détectée à la ligne 247 : les utilisateurs anonymes ont un accès complet (lecture/écriture/suppression) sans restriction d'identité. Recommandé uniquement pour le prototypage V1 privée. |
| 4 | supabase_schema.sql | 250 | Élevée | Politique RLS Supabase restrictive pour le rôle anonyme | Accès total (FOR ALL) autorisé pour le rôle anonyme | Politique de sécurité permissive détectée à la ligne 250 : les utilisateurs anonymes ont un accès complet (lecture/écriture/suppression) sans restriction d'identité. Recommandé uniquement pour le prototypage V1 privée. |
| 5 | supabase_schema.sql | 253 | Élevée | Politique RLS Supabase restrictive pour le rôle anonyme | Accès total (FOR ALL) autorisé pour le rôle anonyme | Politique de sécurité permissive détectée à la ligne 253 : les utilisateurs anonymes ont un accès complet (lecture/écriture/suppression) sans restriction d'identité. Recommandé uniquement pour le prototypage V1 privée. |
| 6 | supabase_schema.sql | 256 | Élevée | Politique RLS Supabase restrictive pour le rôle anonyme | Accès total (FOR ALL) autorisé pour le rôle anonyme | Politique de sécurité permissive détectée à la ligne 256 : les utilisateurs anonymes ont un accès complet (lecture/écriture/suppression) sans restriction d'identité. Recommandé uniquement pour le prototypage V1 privée. |
| 7 | supabase_schema.sql | 279 | Élevée | Politique RLS Supabase restrictive pour le rôle anonyme | Accès total (FOR ALL) autorisé pour le rôle anonyme | Politique de sécurité permissive détectée à la ligne 279 : les utilisateurs anonymes ont un accès complet (lecture/écriture/suppression) sans restriction d'identité. Recommandé uniquement pour le prototypage V1 privée. |
| 8 | supabase_schema.sql | 329 | Élevée | Politique RLS Supabase restrictive pour le rôle anonyme | Accès total (FOR ALL) autorisé pour le rôle anonyme | Politique de sécurité permissive détectée à la ligne 329 : les utilisateurs anonymes ont un accès complet (lecture/écriture/suppression) sans restriction d'identité. Recommandé uniquement pour le prototypage V1 privée. |
| 9 | supabase_schema.sql | 332 | Élevée | Politique RLS Supabase restrictive pour le rôle anonyme | Accès total (FOR ALL) autorisé pour le rôle anonyme | Politique de sécurité permissive détectée à la ligne 332 : les utilisateurs anonymes ont un accès complet (lecture/écriture/suppression) sans restriction d'identité. Recommandé uniquement pour le prototypage V1 privée. |

