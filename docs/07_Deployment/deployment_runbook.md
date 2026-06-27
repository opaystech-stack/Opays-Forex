# Runbook de déploiement — Agency Operations Expansion

Procédure complète de déploiement de la plateforme multi-agences (migrations Supabase
`0003` + `0004`, Edge Functions, front Vercel) avec vérifications avant/après.

> **Principe** : tout est idempotent et réversible jusqu'à la prod. On valide en local,
> puis dev → staging → prod. On ne passe une phase que si la précédente est verte.

---

## 0. Pré-requis outils

| Outil | Vérification |
|-------|--------------|
| Node ≥ 20 | `node -v` |
| npm | `npm -v` |
| Supabase CLI | `supabase --version` |
| Vercel CLI (optionnel) | `vercel --version` |
| Accès projets Supabase (dev/staging/prod) | `supabase projects list` |

Connexion CLI : `supabase login` puis `vercel login` (si déploiement front en CLI).

---

## 1. Validation locale (obligatoire avant tout déploiement)

```bash
npm ci              # installation déterministe
npm test            # 413 tests doivent passer
npm run build       # build de production propre
npm run dev         # http://127.0.0.1:5173  (rendu navigateur à valider)
```

Checklist visuelle en local (mode démo, sans Supabase configuré) :
- [ ] Connexion / accès démo fonctionne.
- [ ] Dashboard, transactions, portefeuilles s'affichent.
- [ ] Onglets conditionnels visibles en démo : Employés, Admin plateforme, Transferts, Abonnements, Billets, Commandes.
- [ ] Paramètres → section « Modules fonctionnels » avec toggles.
- [ ] Agent vocal : ajustement des taux avant confirmation.
- [ ] Page publique de commande : `http://127.0.0.1:5173/commande/test` affiche « lien invalide » (comportement attendu sans jeton réel).

---

## 2. Variables d'environnement et configuration

Voir le tableau complet en section **Annexe A**. À configurer **avant** la phase 1 sur
chaque environnement.

- **Vercel** : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (+ `VITE_APP_URL` recommandé).
- **Supabase Edge Functions** (secrets) : `GEMINI_API_KEY`, `WHATSAPP_*`, `WEBHOOK_SECRET`.
- **Supabase DB** (GUC, pour le cron des relances) : `app.settings.edge_base_url`, `app.settings.service_role_key`.

---

## 3. Phase 1 — Supabase DEV

```bash
supabase link --project-ref <DEV_REF>

# Migrations dans l'ordre (0001 → 0002 si présent → 0003 → 0004)
supabase db push

# Edge Functions
supabase functions deploy agency-invite
supabase functions deploy scheduled-reminders
supabase functions deploy gemini-proxy
supabase functions deploy whatsapp-send
supabase functions deploy whatsapp-webhook
```

Vérifications DEV (SQL Editor) :
```sql
-- Backfill complet (doit retourner 0)
SELECT count(*) FROM transactions WHERE agency_id IS NULL;

-- Policies clés présentes
SELECT policyname FROM pg_policies
WHERE tablename = 'objects' AND policyname IN ('op_read_member','op_insert_valid_link');

-- Fonctions de sécurité
SELECT proname FROM pg_proc
WHERE proname IN ('is_agency_member','is_platform_editor','submit_remote_order','is_valid_order_proof_path');
```

Smoke test fonctionnel :
- [ ] Créer un `order_links` de test, ouvrir `/commande/<lien>`, uploader une preuve → succès.
- [ ] Un membre de l'agence A ne voit aucune donnée de l'agence B.

---

## 4. Phase 2 — Supabase STAGING + preview Vercel

```bash
supabase link --project-ref <STAGING_REF>
supabase db push
supabase functions deploy agency-invite scheduled-reminders gemini-proxy whatsapp-send whatsapp-webhook
```

Front : déployer une preview Vercel pointant vers staging.
```bash
vercel pull --environment=preview
vercel deploy
```

Tests bout-en-bout (staging) :
- [ ] Invitation employé (e-mail reçu via `agency-invite`).
- [ ] Activation d'un module par le propriétaire.
- [ ] Vente transfert / abonnement / billet.
- [ ] Commande à distance + dépôt de preuve, puis confirmation côté agent.
- [ ] Suspension d'agence → accès bloqué ; réactivation → accès rétabli.

---

## 5. Phase 3 — Supabase PROD

```bash
# 1. SAUVEGARDE préalable (snapshot Supabase Dashboard → Database → Backups)

supabase link --project-ref <PROD_REF>
supabase db push     # 0003 puis 0004 (idempotents)

supabase functions deploy agency-invite scheduled-reminders gemini-proxy whatsapp-send whatsapp-webhook
```

Vérifications PROD : rejouer les requêtes SQL de la phase 1 (backfill = 0, policies, fonctions).

Configuration du cron (si pas déjà fait) :
```sql
ALTER DATABASE postgres SET app.settings.edge_base_url    = 'https://<PROD_REF>.supabase.co/functions/v1';
ALTER DATABASE postgres SET app.settings.service_role_key = '<service_role_jwt>';
-- Puis ré-exécuter le bloc cron de 0003 (ou réappliquer la migration) pour planifier le job.
SELECT * FROM cron.job;   -- doit lister 'scheduled-reminders-15min'
```

---

## 6. Phase 4 — Vercel (front prod)

- [ ] Variables d'env Vercel (Production) renseignées (Annexe A).
- [ ] Merge sur la branche de production → build automatique.
- [ ] Le build exécute `node scripts/update-version.js && vite build` ; vérifier `public/version.json`.

---

## 7. Phase 5 — Vérifications post-déploiement

- [ ] App accessible, connexion réelle OK.
- [ ] Service worker sert la nouvelle version (`/version.json` à jour ; vider le cache si besoin).
- [ ] Parcours critique : connexion → dashboard → vente service → lien commande public → preuve visible côté agent.
- [ ] Isolation RLS réelle : agence A ne lit pas l'agence B.
- [ ] Cron `scheduled-reminders-15min` actif (`SELECT * FROM cron.job;`).
- [ ] Logs Edge Functions sans erreur (Supabase Dashboard → Edge Functions → Logs).

---

## 8. Rollback

| Cas | Action |
|-----|--------|
| Front KO | Vercel → Deployments → *Promote* le déploiement précédent. |
| Edge Function KO | Redéployer la version précédente (`git checkout <tag> -- supabase/functions/...` puis `functions deploy`). |
| Migration KO en prod | Restaurer le snapshot pris en phase 3 (les migrations étant additives/idempotentes, un re-`db push` corrige généralement sans restauration). |

---

## Blocages critiques (à surveiller)

1. **GUC du cron non configurés** → relances/rappels automatiques inactifs (migration OK, fonctionnalité dormante).
2. **Edge Functions non déployées** → invitation e-mail et relances programmées HS (Vercel ne les livre pas).
3. **Ordre des migrations** → `0004` dépend de `0003` (table `order_links`, bucket `order-proofs`). Appliquer `0004` seul échoue.
4. **Variables Vercel manquantes** → `BootGuard` bloque le démarrage en production (écran « Configuration requise »).

---

## Annexe A — Variables d'environnement et configuration

### A.1 Vercel (front — build-time, préfixe `VITE_`)

| Variable | Obligatoire | Rôle |
|----------|-------------|------|
| `VITE_SUPABASE_URL` | ✅ | URL du projet Supabase. Sans elle, `BootGuard` bloque la prod. |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Clé anonyme Supabase (client). |
| `VITE_APP_URL` | ⚠️ recommandé | URL publique de l'app, utilisée pour les redirections d'e-mail d'auth (`getAppBaseUrl`). À défaut, `window.location.origin`. |
| `VITE_PUBLIC_SITE_URL` / `VITE_SITE_URL` / `VITE_DOMAIN` | ⬜ alternatives | Repli pour l'URL publique si `VITE_APP_URL` absente. |

### A.2 Supabase — Edge Functions (secrets : `supabase secrets set KEY=val`)

| Variable | Obligatoire | Utilisée par |
|----------|-------------|--------------|
| `SUPABASE_URL` | auto | Injectée par la plateforme Supabase (ne pas définir manuellement). |
| `SUPABASE_ANON_KEY` | auto | Idem (utilisée par `agency-invite`). |
| `SUPABASE_SERVICE_ROLE_KEY` | auto | Idem (`agency-invite`, `scheduled-reminders`, `whatsapp-webhook`). |
| `GEMINI_API_KEY` | ✅ (IA) | `gemini-proxy`, `whatsapp-webhook`. Sans elle, l'OCR/vocal bascule en mode simulé. |
| `WHATSAPP_SEND_GATEWAY_URL` (ou `WHATSAPP_GATEWAY_URL`) | ✅ (WhatsApp) | `whatsapp-send`. Sans elle, envoi WhatsApp HS. |
| `WHATSAPP_API_SECRET` | ✅ (WhatsApp) | `whatsapp-send`, en-tête d'authentification passerelle. |
| `WHATSAPP_SEND_TIMEOUT_MS` | ⬜ | `whatsapp-send` (défaut interne). |
| `WEBHOOK_SECRET` | ⚠️ recommandé | `whatsapp-webhook`, validation des appels entrants. |
| `MEDIA_TIMEOUT_MS` / `GEMINI_TIMEOUT_MS` | ⬜ | `whatsapp-webhook` (défaut 10000 ms). |

> Les trois variables `SUPABASE_*` sont fournies automatiquement au runtime des Edge
> Functions par Supabase — **ne pas** les définir comme secrets manuels.

### A.3 Supabase — Base de données (GUC, `ALTER DATABASE`)

| Paramètre | Obligatoire | Rôle |
|-----------|-------------|------|
| `app.settings.edge_base_url` | ✅ (cron) | URL de base des Edge Functions, pour l'appel `pg_net` du cron `scheduled-reminders`. |
| `app.settings.service_role_key` | ✅ (cron) | JWT service-role utilisé par le cron pour invoquer l'Edge Function. |

```sql
ALTER DATABASE postgres SET app.settings.edge_base_url    = 'https://<REF>.supabase.co/functions/v1';
ALTER DATABASE postgres SET app.settings.service_role_key = '<service_role_jwt>';
```

Extensions requises (Dashboard → Database → Extensions) : `pg_cron`, `pg_net`.
