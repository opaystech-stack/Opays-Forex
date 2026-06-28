# Plan de migration — Front React : Supabase Cloud → API Fastify (Dokploy)

> Statut : ✅ **MIGRATION ACHEVÉE (v2.8.2)** — L0+L1+L3+L4 livrés. Abstraction
> `dataProvider`, flag `VITE_DATA_BACKEND`, auth Fastify, recalcul financier
> serveur (R4/R5), entités secondaires ET résiduelles (dettes, taux, modèles,
> relances, modules, billets, liens de commande, méthodes de transfert,
> fournisseurs, invitations/membres) et **médias** (upload + streaming protégé
> sur volume Dokploy). En mode `api`, le client ne dépend plus de Supabase.
> **499 tests verts**, build OK. Isolation R1/R2 scellée (tenant + filtres
> `agency_id` + streaming médias contrôlé). Reste opérationnel : `npm install`
> dans `api/`, montage du volume `UPLOAD_DIR`, et validation E2E sur Dokploy (L5).
> Objectif : router le client React vers l'API Fastify multi-tenant, fermant
> définitivement les risques d'isolation de données **R1/R2**, sans régression
> fonctionnelle, visuelle ni de tests (476 tests au vert à préserver).

---

## 0. Principe directeur

La migration ne réécrit pas l'application : elle **interpose une couche d'accès
aux données** entre `AppContext.jsx` et le backend, pilotée par un **flag
d'environnement**. On peut ainsi basculer Supabase ↔ API Fastify ↔ mode démo
sans toucher aux pages ni aux composants, et revenir en arrière instantanément.

Trois constats du code actuel structurent tout le plan :

1. **Un client Fastify existe déjà** : `src/services/api.js` expose `apiClient`
   (fetch `credentials: 'include'`, base `VITE_API_URL`) et des modules typés
   (`authApi`, `walletApi`, `transactionApi`, `customerApi`, `employeeApi`,
   `transferApi`, `subscriptionApi`, `ticketApi`, `remoteOrderApi`,
   `expenseApi`, `loanApi`, `agencyApi`, `userApi`). La tuyauterie réseau est
   donc en grande partie là.
2. **Le mode « démo/mock » est déjà un second backend** : `AppContext` bascule
   entre Supabase et des données `localStorage` via `hasCredentials`. On
   généralise ce mécanisme binaire en **sélecteur à trois voies**.
3. **Deux écarts de contrat** devront être traités explicitement (voir §8) :
   le **nommage des champs** (Supabase `snake_case` vs `mapTransaction` Fastify
   `camelCase`) et les **entités non encore couvertes** par les routes/clients.

---

## 1. État des lieux (inventaire réel)

### 1.1 Points de contact Supabase dans le front
- `src/services/supabase.js` : création du client (`VITE_SUPABASE_URL/ANON_KEY`).
- `src/context/AppContext.jsx` (cœur, ~2850 lignes) :
  - **Données** : `supabase.from('wallets'|'exchange_rates'|'transactions'|
    'expenses'|'customers'|'loans'|'debts'|'message_templates'|
    'reminder_history'|'agencies'|'agency_members'|'agency_invitations'|
    'module_states'|'module_entitlements'|'transfer_methods'|
    'subscription_providers'|'transfers'|'subscriptions'|'flight_bookings'|
    'remote_orders'|'order_links')`.
  - **Auth** : `supabase.auth.signUp/signInWithPassword/signInWithOAuth/
    signOut/getSession/onAuthStateChange`.
  - **Profil d'accès** : `supabase.from('access_profiles')` (spec paid-access).
  - **Stockage** : `submitPaymentProof` → `supabase.storage.from('receipts')`.
- `src/pages/FormulaireCommande.jsx` : `supabase.storage` (preuves de commande,
  cf. migration `0004_order_proofs_upload_policy`).
- `src/services/reminderService.js`, `whatsappClient.js` : appels Edge/Supabase
  (relances WhatsApp) — **hors périmètre data** mais à recenser (§8.4).

### 1.2 Routes Fastify existantes (`api/routes/`)
`auth, agencies, wallets, transactions, customers, employees, transfers,
subscriptions, tickets, remote-orders, expenses, loans, dashboard`.
Toutes protégées par `app.authenticate` + `app.requireAgency`, filtrage
`WHERE agency_id = $1` systématique → **isolation R1/R2 garantie côté serveur**.

### 1.3 Écarts à combler (manques côté API/clients)
Entités utilisées par le front **sans** route Fastify ni méthode `api.js` :
`debts`, `exchange_rates`/`currencies`, `message_templates`, `reminder_history`,
`module_states`, `module_entitlements`, `transfer_methods`,
`subscription_providers`, `order_links`, `flight_bookings`, `agency_members`,
`agency_invitations`, `access_profiles`, et l'**upload de médias** (reçus +
preuves de commande).

---

## 2. Architecture cible : couche d'accès aux données (Data Provider)

On introduit une abstraction unique consommée par `AppContext`, avec deux
implémentations interchangeables et un sélecteur :

```
src/services/
  dataProvider/
    index.js          # choisit l'implémentation selon le flag
    supabaseProvider.js  # extrait l'existant (from/auth/storage)
    apiProvider.js       # s'appuie sur services/api.js (+ nouvelles méthodes)
    types.js          # contrat commun (formes d'E/S normalisées en snake_case)
```

Contrat commun (exemple) :

```js
// Toutes les méthodes renvoient des objets normalisés en snake_case
// (forme actuellement consommée par les pages) et un { data, error }.
dataProvider.transactions.list()         // -> { data: Txn[], error }
dataProvider.transactions.create(txn)     // -> { data: Txn, error }
dataProvider.transactions.confirmDraft(id)
dataProvider.debts.list() / create() / updateStatus(id, status)
dataProvider.auth.getSession() / signIn() / signOut() / ...
dataProvider.storage.uploadReceipt(path, file) / getPreviewUrl(path)
```

`AppContext` n'appelle plus jamais `supabase.*` ni `apiClient.*` directement :
il passe par `dataProvider.*`. C'est le **seul fichier applicatif réécrit en
profondeur** ; pages et composants restent inchangés.

Sélecteur (`dataProvider/index.js`) :

```js
const BACKEND = import.meta.env.VITE_DATA_BACKEND // 'api' | 'supabase' | 'mock'
  ?? (import.meta.env.VITE_SUPABASE_URL ? 'supabase' : 'mock');
export const dataProvider =
  BACKEND === 'api' ? apiProvider :
  BACKEND === 'supabase' ? supabaseProvider :
  mockProvider; // ou laisser AppContext gérer le repli localStorage existant
```

---

## 3. Mapping des services (Supabase → Fastify → client)

| Entité (table) | Op. front | Route Fastify | `api.js` | Statut |
|----------------|-----------|---------------|----------|--------|
| wallets | list/create/update/delete | `/wallets` | `walletApi` | ✅ prêt |
| transactions | list/create | `/transactions` | `transactionApi` | ✅ prêt |
| transactions (draft) | confirm | `/transactions/:id/confirm` | `transactionApi.confirm` | ✅ prêt |
| customers | list/create/update/delete | `/customers` | `customerApi` | ✅ prêt |
| expenses | list/create | `/expenses` | `expenseApi` | ✅ prêt |
| loans | list/create/update | `/loans` | `loanApi` | ✅ prêt |
| transfers | list/create/complete | `/transfers` | `transferApi` | ✅ prêt |
| subscriptions | list/create/update | `/subscriptions` | `subscriptionApi` | ✅ prêt |
| tickets | list/create/update | `/tickets` | `ticketApi` | ✅ prêt |
| remote_orders | list/create/update | `/remote-orders` | `remoteOrderApi` | ✅ prêt |
| agencies | list/mine/update | `/agencies` | `agencyApi` | ✅ prêt |
| **debts** | list/create/updateStatus | `/debts` | `debtApi` | ✅ **livré (L3)** |
| **exchange_rates** | list/upsert | `/rates` (table `currencies`) | `rateApi` | ✅ **livré (L3)** |
| **message_templates** | CRUD | `/templates` | `templateApi` | ✅ **livré (L3)** |
| **reminder_history** | list/append | `/reminders` | `reminderApi` | ✅ **livré (L3)** |
| **module_states / entitlements** | list/upsert | `/modules` | `moduleApi` | ✅ **livré (L3)** |
| **flight_bookings** | list/create | `/flight-bookings` | `flightApi` | ✅ **livré (L3)** |
| **transfer_methods** | list/CRUD | `/transfer-methods` | — | ⛔ **à créer** |
| **subscription_providers** | list/CRUD | `/subscription-providers` | — | ⛔ **à créer** |
| **order_links** | create/revoke | `/order-links` | — | ⛔ **à créer** |
| **agency_members / invitations** | list/CRUD | `/employees` (partiel) + `/invitations` | partiel | ⚠️ **à compléter** |
| **access_profiles** | read | `/auth/me` (fusionner) | `authApi.me` | ⚠️ **à fusionner** |
| **storage (reçus/preuves)** | upload/preview | `/uploads` | `storageApi` | ⛔ **L4** (§5) |

Chaque nouvelle route reprend le **patron existant** (hooks `authenticate` +
`requireAgency`, `WHERE agency_id`, schéma `zod`, `BEGIN/COMMIT/ROLLBACK` pour
les écritures touchant les soldes). La logique financière reste centralisée sur
`src/utils/finance.js` (à appeler aussi côté serveur, cf. recommandation R4/R5
de l'audit, pour ne pas faire confiance aux montants du client).

> **Point de contrat à trancher (bloquant) :** `mapTransaction` (Fastify)
> renvoie du **camelCase** (`sourceWalletId`, `profitUsd`) alors que les pages
> consomment du **snake_case** (`source_wallet_id`, `profit_usd`). Deux options :
> **(A, recommandée)** faire renvoyer du snake_case par l'API (mappers serveur)
> pour zéro churn côté front ; **(B)** normaliser dans `apiProvider.js`. Choisir
> A pour minimiser le risque de régression visuelle/logique.

---

## 4. Authentification & gestion de session

### 4.1 Cible
- Le serveur émet déjà un **JWT en cookie httpOnly** (`api/routes/auth.js` :
  `/register`, `/login`, `/me`, `/logout`, `/switch-agency`, `/create-agency`).
- Le front s'authentifie via `authApi` (déjà présent) ; le cookie est transmis
  automatiquement grâce à `credentials: 'include'` (CORS allowlist + cookies
  durcis posés au sprint précédent).

### 4.2 Bascule dans `AppContext`
| Aujourd'hui (Supabase) | Cible (API) |
|------------------------|-------------|
| `supabase.auth.getSession()` au montage | `authApi.me()` au montage → `{ user }` ou 401 |
| `onAuthStateChange` (listener) | état local `user` + ré-appel `me()` après login/logout |
| `signUp(email,pwd,meta)` | `authApi.register({ email, password, firstName, lastName, agencyName })` |
| `signIn(email,pwd)` | `authApi.login({ email, password })` |
| `signInWithGoogle()` | **non couvert nativement** → §8.5 (OAuth à prévoir ou différer) |
| `logOut()` | `authApi.logout()` puis `setUser(null)` |
| `profilAcces` via `access_profiles` | exposer `acces_autorise`/`role` dans `/auth/me` |

`evaluateAccess` / `isRlsDenied` (logique pure `accessControl.js`) **restent
valables** : il suffit de mapper un **401/403 de l'API** sur le même chemin que
le refus RLS actuel (la fonction `isRlsDenied` reconnaît déjà `status 401/403`).
Le gating React est ainsi préservé sans réécriture.

### 4.3 Préservation du mode démo
`user?.isDemo` et le repli `localStorage` restent intacts : en backend `mock`,
`dataProvider.auth` renvoie une session démo locale, sans réseau.

---

## 5. Médias : téléversement & URLs de prévisualisation

Aujourd'hui : `supabase.storage.from('receipts'|'order-proofs')` pour l'upload,
et des URLs (signées ou publiques) pour la prévisualisation. La logique **pure**
de validation et de chemin est déjà isolée dans `src/utils/paymentProof.js`
(`validateProofSubmission`, `buildReceiptPath`, `buildProofRecord`) — **elle est
réutilisée telle quelle**, indépendante du backend.

### 5.1 Côté serveur Fastify (Dokploy)
1. Ajouter `@fastify/multipart` pour recevoir les fichiers (limite 5 Mo, types
   PNG/JPEG/WEBP/PDF — déjà les bornes de `paymentProof.js`).
2. **Stockage physique** : un **volume persistant Dokploy** monté (ex.
   `/data/uploads`), arborescence confinée `{agency_id}/{user_id}/{timestamp}-{nom}`
   (réutilise `buildReceiptPath`, préfixé par `agency_id` pour l'isolation).
   *(Alternative : un service S3/MinIO compatible si l'objet-store est préféré ;
   le contrat `storageApi` reste identique.)*
3. **Endpoints** :
   - `POST /uploads/receipts` (multipart) → valide, écrit le fichier sur le
     volume, insère l'enregistrement de preuve (`buildProofRecord`), renvoie un
     identifiant/chemin opaque. Jamais le chemin disque brut.
   - `GET /uploads/:id` → **streaming protégé** : vérifie `authenticate` +
     `agency_id` du fichier == agence de l'utilisateur, puis renvoie le binaire.
     C'est l'équivalent « URL de prévisualisation sécurisée » sans exposer le
     système de fichiers (pas de fuite inter-agences).
   - (Option) `GET /uploads/:id/signed` → jeton court (HMAC, TTL ~5 min) si l'on
     veut des URLs directes utilisables dans `<img src>` sans en-tête Auth.
4. **Sauvegarde** : inclure `/data/uploads` dans la stratégie de backup Dokploy
   (les binaires ne sont pas dans Postgres).

### 5.2 Côté front
`dataProvider.storage.uploadReceipt(file)` encapsule l'appel multipart ;
`getPreviewUrl(id)` renvoie soit l'URL `GET /uploads/:id` (avec cookie), soit
l'URL signée. `submitPaymentProof` et `FormulaireCommande` n'appellent plus que
`dataProvider.storage`, la validation pure restant en amont.

---

## 6. Préservation des tests unitaires & d'intégration

Cartographie actuelle des mocks (vérifiée) :
- **Tests de pages** (`Transactions`, `Transferts`, `Billets`, `Abonnements`,
  `Employes`, `EspaceAdminPlateforme`, `Settings.modules`…) : mockent
  `../context/AppContext` (`useApp`). **Aucun impact** : ils ne voient pas le
  backend.
- **Tests App / AppShell** (`App.integration`, `AppShell.integration`) : mockent
  `./context/AppContext` entièrement. **Aucun impact**.
- **Tests qui touchent la couche data** : `AppContext.integration.test.jsx`,
  `AppContext.agency.test.jsx`, `App.rls.integration.test.jsx`,
  `context/debts.test.jsx`, `FormulaireCommande.test.jsx` (storage),
  `VoiceAgentModal*.test.jsx` → mockent `../services/supabase` (souvent
  `supabase: null` pour forcer le mode démo, ou un double chaînable).

### Stratégie
1. **Introduire le mock au niveau `dataProvider`**, pas au niveau du transport.
   Les tests qui forçaient `supabase: null` forceront `VITE_DATA_BACKEND='mock'`
   (ou mockeront `services/dataProvider`). La logique testée (réducteurs,
   gating, simulations OCR/voix) est inchangée.
2. **Ajouter des doubles `apiProvider`** pour les cas qui simulaient des
   réponses Supabase : un double chaînable équivalent renvoyant `{ data, error }`
   (même forme), réutilisant les fixtures existantes.
3. **Tests d'intégration réseau de l'API** (nouveau, côté `api/`) : ajouter une
   petite suite (Fastify `inject()` + Postgres de test/conteneur) validant
   l'isolation `agency_id` (un utilisateur d'agence A ne lit jamais les données
   de B) — c'est la **preuve directe de fermeture de R1/R2**.
4. **Règle de non-régression** : `npm test` doit rester à 476+ au vert à chaque
   lot ; on n'avance au lot suivant que si le précédent est vert.

> Les tests de **logique pure** (finance, authorization, accessControl,
> paymentProof, validations) sont **agnostiques du backend** et ne changent pas.

---

## 7. Stratégie de bascule (dual mode + rollback)

### 7.1 Flag de sélection
`VITE_DATA_BACKEND ∈ { 'mock', 'supabase', 'api' }`. Défaut rétro-compatible :
`supabase` si `VITE_SUPABASE_URL` présent, sinon `mock`. La bascule production
se fait en posant `VITE_DATA_BACKEND=api` + `VITE_API_URL=https://.../api` dans
Dokploy — **aucune recompilation de logique**, seulement les variables.

### 7.2 Déroulé progressif (par environnement)
1. **Dev local** : API Fastify + Postgres local, `VITE_DATA_BACKEND=api`.
   Comparer écran par écran avec le mode `supabase`.
2. **Staging Dokploy** : bascule `api`, jeu de données de test, exécution de la
   checklist de non-régression (§7.4).
3. **Production** : bascule `api` une fois staging validé ; Supabase reste
   disponible en repli immédiat (changer le flag) tant qu'il n'est pas retiré.

### 7.3 Rollback
Le flag étant runtime-config (variable d'env), un retour `api → supabase` est
**immédiat** (redeploy/restart), sans rollback de code, tant que les deux
implémentations coexistent. On ne supprime `supabaseProvider` et la dépendance
`@supabase/supabase-js` qu'après une période de stabilisation validée.

### 7.4 Checklist de non-régression (extrait)
- [ ] Connexion / inscription / déconnexion (cookie JWT).
- [ ] Liste + création de transaction (soldes mis à jour, profit correct).
- [ ] Confirmation d'un brouillon (ledger non altéré avant validation).
- [ ] Dettes : création, totaux, règlement.
- [ ] Upload reçu + prévisualisation (isolation agence).
- [ ] **Isolement** : compte agence A ne voit aucune donnée de B (test dédié).
- [ ] Mode démo intact (sans backend).
- [ ] `npm test` (476+) et `npm run build` au vert.

---

## 8. Découpage en lots & points ouverts

### 8.1 Lots (séquentiels, chacun livré vert)
1. **L0 — Abstraction** : créer `dataProvider` + `supabaseProvider` (extraction
   pure de l'existant) + flag. Comportement identique, filet de sécurité.
2. **L1 — Auth/session** sur API (`apiProvider.auth`, fusion `access_profiles`
   dans `/auth/me`).
3. **L2 — Entités déjà couvertes** (wallets, transactions, customers, expenses,
   loans, transfers, subscriptions, tickets, remote_orders, agencies) +
   alignement **snake_case** des mappers serveur (option A).
4. **L3 — Entités manquantes** (debts, rates, templates, reminders, modules,
   transfer_methods, subscription_providers, order_links, flight_bookings,
   members/invitations) : routes + clients.
5. **L4 — Médias** (multipart + volume + endpoints protégés).
6. **L5 — Tests d'isolation API** + checklist + bascule staging→prod.
7. **L6 — Décommissionnement Supabase** (après stabilisation).

### 8.2 Points ouverts à arbitrer
- **snake_case vs camelCase** (option A recommandée — cf. §3).
- **OAuth Google** : non couvert par l'API Fastify actuelle. Décider de
  l'implémenter (passport/oauth) ou de le différer (email+mot de passe d'abord).
- **WhatsApp / relances** (`reminderService`, Edge Functions) : restent-elles
  sur une brique séparée (`whatsapp-gateway/`) ou intégrées à Fastify ? À
  cadrer dans un lot dédié, hors périmètre data.
- **Recalcul serveur des montants** (R4/R5 de l'audit) : à intégrer dans L2/L3
  pour ne pas faire confiance à `profit_usd`/`dest_amount` envoyés par le client.
- **Migrations SQL** : `api/schema.sql` doit accueillir les tables manquantes
  (debts, templates, reminders, modules, order_links, flight_bookings, preuves)
  et corriger l'ordre de création `agencies`↔`users` relevé à l'audit.

### 8.3 Ce que la migration ferme définitivement
Toutes les lectures/écritures passent par des endpoints **authentifiés** et
**filtrés par `agency_id`** côté serveur, avec un secret JWT obligatoire et un
CORS en liste blanche (sprint précédent). La clé publique `anon` exposant
aujourd'hui toutes les données disparaît du chemin de données → **R1 et R2
clos**.

---

## 9. Prochaine étape proposée
Valider ensemble : (a) l'option de nommage (A/B), (b) le périmètre OAuth, (c) la
stratégie de stockage (volume Dokploy vs MinIO). Sur accord, je formalise le
**lot L0** (abstraction + flag) en spec d'implémentation testée, sans toucher au
comportement actuel.

---

## 10. Espace Admin Unifié (post-migration) — `admin-stack/`

Une fois la stack Fastify + Postgres en place, l'**Espace Admin Unifié** est
fourni par le dossier `admin-stack/` (déployable sur Dokploy), branché sur la
**même base PostgreSQL** (aucune base parallèle) :

- **Directus** (`directus/directus:11`) : UI admin / CRM / RBAC introspectée sur
  le schéma existant — fiches clients 360°, validation des abonnements et des
  preuves de paiement, activation/désactivation des modules premium par agence.
  Rôles et filtres d'isolation par `agency_id` documentés dans
  `admin-stack/directus/permissions.md`.
- **Hermes Agent** (service Node + `node-cron`) : 3 agents IA branchés sur
  Postgres —
  - *Comptable* (clôture quotidienne, bénéfice USD, mémo → `closing_memos`),
  - *CRM* (récence > 15 j, relances WhatsApp via Gemini → `reminder_history`),
  - *Sécurité* (anomalies `audit_logs` → `security_alerts`).
  Garde `HERMES_DRY_RUN=true` par défaut (aucune écriture/envoi tant que non
  validé).

Choix d'outil : **Directus** retenu (se branche sur un Postgres existant, RBAC
fin, Flows). Alternative : **NocoDB**. **PocketBase** écarté (base SQLite propre,
ne se connecte pas à un Postgres externe). Guide complet : `admin-stack/README.md`.

Collections financières en **lecture seule** côté admin : toute mutation
monétaire reste pilotée par l'API Fastify (recalcul serveur R4/R5), préservant
l'intégrité et l'étanchéité R1/R2.
