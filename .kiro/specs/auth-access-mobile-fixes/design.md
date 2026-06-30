# Conception de Correction de Bugs — auth-access-mobile-fixes

## Overview

Cette conception formalise la correction de **cinq zones de défauts** de l'application
de production Opays-Forex (PWA React + Vite). Conformément à la clarification du backend,
**le backend primaire de production est l'API Fastify** (`isApiBackend === true`), qui se
connecte directement à la base PostgreSQL `foxdb`. Supabase n'est qu'un repli local/démo :
les chemins `src/services/supabase.js` et `createClient` **ne sont pas modifiés**.
L'authentification ET les données transitent par l'API Fastify (`api/server.js`,
`api/routes/*.js`) et la couche `apiProvider` côté front.

L'audit du code réel a établi les faits suivants, qui ancrent chaque correction :

- **Sélection du backend** (`src/services/dataProvider/index.js`) : `getDataBackend()` renvoie
  `'api'` lorsque `VITE_DATA_BACKEND === 'api'`. `AppContext` calcule alors
  `isApiBackend = true` et route toute l'authentification via `apiProvider.auth.*`
  (`src/services/dataProvider/apiProvider.js`), lui-même adossé à `authApi` (`src/services/api.js`)
  qui appelle `/api/auth/*` avec `credentials: 'include'` (cookie JWT httpOnly `token`).
- **Session** : restaurée par `apiProvider.auth.getSession()` → `GET /api/auth/me` (cookie JWT,
  `maxAge` 7 jours). Le Service Worker (`public/sw.js`) ignore déjà `/api` mais sert la
  navigation en network-first avec repli `./index.html`.
- **Google** : `signInWithGoogle()` charge Google Identity Services (GIS), appelle
  `initTokenClient(...).requestAccessToken()` (flux **pop-up**) puis poste le jeton à
  `POST /api/auth/google-login`, qui **crée déjà** automatiquement l'utilisateur et l'agence dans
  `foxdb`.
- **Inscription** : `POST /api/auth/register` crée l'utilisateur `is_active = true`, **pose le
  cookie de session** et renvoie l'utilisateur — **aucune confirmation d'e-mail** côté serveur.
- **Essai / accès** : `loadProfile()` construit, pour le chemin API, un `profilAcces` avec
  `acces_autorise: user.isActive ?? true` ; la garde `AccessGate` consomme `isAccessGranted()`
  (`src/utils/accessControl.js`), qui contient déjà un calcul d'essai 30 jours **côté client**
  à partir de `created_at`. La table `users` (`api/schema.sql`) **ne possède aucune colonne**
  d'essai ni d'accès payant.
- **Design mobile/PC** : `.whatsapp-fab` est déjà positionné en bas à droite (`src/index.css`) ;
  la sidebar PC (`.mobile-navbar`) a `overflow-y: auto` + `height: 100dvh` ; les Prêts (`loans`)
  ne figurent pas dans la barre mobile (`Navbar.jsx`) mais dans le menu « Plus »
  (`MoreMenuPage`, `src/App.jsx`).

La stratégie générale : corriger chaque zone sur le **chemin Fastify** (front + routes API +
SQL `foxdb`), en déplaçant l'autorité de l'essai vers le serveur (non falsifiable), tout en
préservant strictement les comportements inchangés (clauses 3.1–3.9 du document de bugs).

## Glossary

- **Bug_Condition (C)** : condition décrivant les entrées qui déclenchent un défaut (une par zone,
  agrégées par `isBugCondition`).
- **Property (P)** : comportement correct attendu pour une entrée satisfaisant la Bug_Condition.
- **Preservation** : comportements existants devant rester identiques après correction (¬C).
- **isApiBackend** : indicateur calculé dans `AppContext` (`dataBackend === 'api'`) qui route
  authentification et données vers l'API Fastify ; **chemin primaire de production**.
- **apiProvider.auth** : façade front (`src/services/dataProvider/apiProvider.js`) exposant
  `getSession`, `signIn`, `signUp`, `signInWithGoogle`, `signOut` au-dessus de `authApi`.
- **authApi** : client HTTP (`src/services/api.js`) ciblant `/api/auth/*` avec cookie JWT httpOnly.
- **Session_Cookie** : cookie httpOnly `token` (JWT) posé par Fastify (`maxAge` 7 jours), seul
  support de session en mode API.
- **Service_Worker** : `public/sw.js`, stratégie de cache PWA (network-first navigation,
  cache-first assets, `/api` ignoré).
- **GIS** : Google Identity Services (`https://accounts.google.com/gsi/client`), utilisé via
  `oauth2.initTokenClient`.
- **Essai_30j** : période d'accès libre de 30 jours calculée à partir de `users.created_at`
  dans `foxdb`, devant être **évaluée et imposée côté serveur**.
- **Acces_Payant** : accès accordé indépendamment de l'essai (équivalent de `acces_autorise = TRUE`).
- **AccessGate** : garde React (`src/App.jsx`) qui autorise l'AppShell ou rend `AccesRestreint`.
- **F / F'** : fonction d'origine (non corrigée) / fonction corrigée.

## Bug Details

### Bug Condition

Le défaut se manifeste, sur le chemin `isApiBackend === true`, dans cinq situations
indépendantes : (Z1) restauration de session après rafraîchissement, en particulier sur mobile ;
(Z2) authentification Google sur mobile (pop-up bloquée → chargement infini) ; (Z3) inscription
classique aboutissant à un écran de confirmation d'e-mail bloquant au lieu d'une connexion
directe ; (Z4) absence de logique d'essai 30 jours fiable et serveur fondée sur `created_at` ;
(Z5) défauts de mise en page mobile/PC (clavier virtuel, bouton WhatsApp, débordement sidebar,
accès Prêts mobile).

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input = { zone, ctx }   // ctx décrit l'environnement et l'action
  OUTPUT: boolean

  // --- Z1 : Persistance de session (chemin API Fastify) ---
  IF input.zone = 'session' THEN
    RETURN ctx.isApiBackend = true
           AND ctx.hadValidSessionCookie = true     // cookie JWT 'token' présent et valide
           AND ctx.didRefresh = true                // F5 / rechargement
           AND NOT ctx.sessionRestored              // /api/auth/me non honoré ⇒ redirigé vers /login

  // --- Z2 : Authentification Google (mobile) ---
  IF input.zone = 'google' THEN
    RETURN ctx.isApiBackend = true
           AND ctx.clickedGoogle = true
           AND (ctx.popupBlocked = true OR ctx.noUserGestureTokenClient = true)
           AND NOT ctx.googleFlowCompleted          // chargement infini, callback jamais résolu

  // --- Z3 : Inscription classique e-mail / mot de passe ---
  IF input.zone = 'signup' THEN
    RETURN ctx.isApiBackend = true
           AND ctx.registerSucceeded = true         // /api/auth/register a réussi + cookie posé
           AND (ctx.shownEmailConfirmationScreen = true OR NOT ctx.redirectedToApp)

  // --- Z4 : Période d'essai gratuite (30 jours) ---
  IF input.zone = 'trial' THEN
    RETURN ctx.isApiBackend = true
           AND (
                 // a) nouvel inscrit bloqué pendant l'essai
                 (ctx.daysSinceCreatedAt < 30 AND ctx.accessBlocked = true)
                 // b) essai expiré sans accès payant mais accès encore accordé
              OR (ctx.daysSinceCreatedAt >= 30 AND NOT ctx.accesPayant AND ctx.accessGranted = true)
                 // c) décision d'essai fondée sur une valeur falsifiable côté client
              OR (ctx.trialDecidedClientSideOnly = true)
               )

  // --- Z5 : Design & mise en page mobile/PC (frontend) ---
  IF input.zone = 'layout' THEN
    RETURN (ctx.case = 'keyboard'  AND ctx.formBottomClipped = true)        // clavier écrase le formulaire
        OR (ctx.case = 'whatsapp'  AND ctx.fabPosition != 'bottom-right')   // FAB mal placé sur mobile
        OR (ctx.case = 'sidebar'   AND ctx.viewport = 'desktop' AND ctx.bottomItemsHidden = true)
        OR (ctx.case = 'loans'     AND ctx.viewport = 'mobile'  AND NOT ctx.loansReachable)

  RETURN false
END FUNCTION
```

### Examples

- **Z1** — Sur mobile, un utilisateur connecté (cookie `token` valide) fait F5 : l'app affiche
  brièvement le `LoadingScreen` puis redirige vers `/login` au lieu de restaurer la session
  (`/api/auth/me` non honoré ou réponse `index.html` mise en cache servie pour la navigation).
- **Z2** — Sur Safari iOS, le clic « Continuer avec Google » déclenche
  `client.requestAccessToken()` (pop-up) ; le navigateur bloque la pop-up, le `callback` GIS
  n'est jamais appelé, la `Promise` de `signInWithGoogle` ne se résout jamais → spinner infini.
- **Z3** — Inscription valide : `POST /api/auth/register` réussit et pose le cookie, mais l'UI
  affiche le message « Vérifiez votre e-mail » (branche héritée Supabase) au lieu de rediriger
  vers `/app`.
- **Z4 (a)** — Compte créé il y a 2 jours : aucune colonne d'essai en base, et selon la
  configuration `AccessGate` peut bloquer (ou, à l'inverse, tout autoriser indéfiniment via
  `acces_autorise = isActive ?? true`). Aucune autorité serveur ne tranche l'essai.
- **Z4 (b)** — Compte créé il y a 45 jours, sans paiement : l'accès reste accordé car
  `acces_autorise` vaut `true` (dérivé de `isActive`) côté API, donc aucun blocage après essai.
- **Z4 (c)** — La décision d'essai repose sur `createdAt` renvoyé dans le profil client et
  évalué dans `isAccessGranted` : modifiable côté client (falsifiable), non imposé par le serveur.
- **Z5 (clavier)** — À l'ouverture du clavier virtuel, le bas du formulaire de connexion devient
  inaccessible (hauteur figée, défilement insuffisant).
- **Z5 (sidebar)** — Sur un petit écran PC, le bas de la sidebar (Prêts) est coupé si le
  conteneur d'onglets ne défile pas réellement.
- **Z5 (loans mobile)** — Les Prêts ne sont pas dans la barre inférieure ; l'accès via « Plus »
  doit être fiable (sélection d'onglet rendue dans le bottom sheet).
- **Edge case** — Sur PC, F5 d'un utilisateur connecté DOIT continuer de restaurer la session
  (comportement déjà correct à préserver, voir 3.1).

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors (clauses 3.1–3.9 du document de bugs) :**
- **3.1** Sur PC, F5 d'un utilisateur authentifié restaure la session et le maintient connecté.
- **3.2** Connexion e-mail/mot de passe valide : authentification et redirection vers l'app
  inchangées (`POST /api/auth/login`).
- **3.3** Compte avec accès payant validé : accès accordé indépendamment de l'essai.
- **3.4** Compte hors essai et non payé : `AccesRestreint` affichée et politiques d'accès
  serveur respectées.
- **3.5** Mode démo (`?debug_force_demo`, `loginAsDemo`) : accès local sans appel réseau ni
  blocage (chemins Supabase/mock intacts).
- **3.6** Service Worker : stratégie de cache existante préservée (network-first navigation,
  cache-first assets, mise à jour de version, `/api` ignoré).
- **3.7** Mise en page bureau (sidebar, en-tête, contenu) sans régression visuelle.
- **3.8** Aucun brouillon WhatsApp en attente ⇒ FAB lié aux brouillons masqué
  (`pendingCount === 0`).
- **3.9** Navigation mobile : barre inférieure et écrans existants sans régression de mise en page.

**Scope :**
Toute entrée NE satisfaisant PAS la Bug_Condition doit rester strictement inchangée. En
particulier : le chemin Supabase/mock (mode démo, repli local) ; la connexion classique ;
l'accès des comptes payants ; le blocage légitime après essai ; le comportement PC de session
et de mise en page. Les fichiers `src/services/supabase.js` et l'appel `createClient` ne sont
pas modifiés.

**Note :** le comportement correct attendu pour les entrées satisfaisant la Bug_Condition est
défini dans la section « Correctness Properties » (Propriétés 1 à 5). La présente section
recense ce qui NE doit PAS changer (Propriétés 6 à 10).

## Hypothesized Root Cause

Hypothèses fondées sur l'audit du code réel ; à confirmer ou réfuter lors du checking
exploratoire AVANT toute correction.

1. **Z1 — Restauration de session mobile**
   - **Course de cache navigation** : `sw.js` sert la navigation en network-first mais, en cas
     de latence/réseau instable (fréquent sur mobile), retombe sur `caches.match('./index.html')`.
     L'`index.html` de repli démarre l'app sans contexte ; si `getSession()` n'aboutit pas,
     `PrivateRoute` redirige vers `/login`.
   - **Cookie de session non transmis** : `secure: NODE_ENV==='production'` + `sameSite: 'lax'`.
     Si l'API et le front ne sont pas exactement même origine (sous-domaine, proxy), le cookie
     `token` peut ne pas accompagner `/api/auth/me` sur mobile (politiques cookies plus strictes).
   - **Bascule de garde prématurée** : `getSession()` est asynchrone ; `PrivateRoute` s'appuie
     sur `loading`/`user`. Un ordre d'initialisation où `authChecked` passe à `true` avec
     `user = null` (échec transitoire de `me`) déclenche la redirection.

2. **Z2 — Google sur mobile**
   - **Flux pop-up** : `oauth2.initTokenClient(...).requestAccessToken()` ouvre une pop-up.
     Sur mobile, les bloqueurs de pop-up empêchent l'ouverture ; le `callback` n'est jamais
     invoqué et la `Promise` reste pendante ⇒ **chargement infini** (aucun timeout).
   - **Geste utilisateur** : `requestAccessToken()` est appelé après un `await` (chargement du
     script GIS), pouvant sortir du contexte de geste utilisateur exigé par les navigateurs
     mobiles, ce qui fait bloquer la pop-up.
   - **Pas de gestion d'échec d'ouverture** : aucune détection « pop-up bloquée » ni repli.

3. **Z3 — Inscription classique**
   - **Branche d'UI héritée Supabase** : `SignUp.handleSubmit` ne redirige vers `/app` que si
     `result.user || result.data?.user?.confirmed_at || result.data?.session`. En mode API,
     `result.user` est présent, donc la redirection devrait avoir lieu ; mais des configurations
     où `signUp` ne renvoie pas d'`user` (ou un écran de succès « vérifiez votre e-mail »
     `auth.signup.success` s'affiche) laissent l'utilisateur bloqué. Le message de confirmation
     d'e-mail provient de cette branche `else { setSuccess(...) }`.
   - **Risque côté serveur** : `register` exige `agencyName.min(2)` côté Zod uniquement si fourni ;
     le mapping `metadata.agencyName` provient de `business_name`. Une absence d'agence n'empêche
     pas la connexion mais influe sur `requireAgency` ultérieur.

4. **Z4 — Essai 30 jours**
   - **Autorité côté client** : la seule logique d'essai existe dans `isAccessGranted`
     (`accessControl.js`), évaluée dans le navigateur à partir d'un `created_at` transporté dans
     le profil. C'est **falsifiable** et non imposé par le serveur.
   - **Schéma incomplet** : `users` (`api/schema.sql`) n'a ni colonne d'essai ni d'accès payant ;
     `loadProfile` pose `acces_autorise: user.isActive ?? true`, donc l'accès est en pratique
     toujours accordé en mode API (aucun blocage après 30 jours).
   - **Absence d'endpoint d'accès** : aucune route Fastify ne calcule/retourne l'état d'accès
     (essai actif, jours restants, payé) de façon autoritaire.

5. **Z5 — Design mobile/PC**
   - **WhatsApp FAB** : `.whatsapp-fab` est déjà `position: fixed; bottom: ...; right: 16px`.
     Le défaut observé peut venir d'un **ancêtre transformé** (composant `motion.*` créant un
     bloc conteneur pour `position: fixed`), repositionnant le FAB par rapport au parent et non
     au viewport. À confirmer.
   - **Clavier virtuel** : les conteneurs d'auth (`SignUp`/`SignIn`) reposent sur `min-h-[100dvh]`
     et `overflow-y-auto` sur le panneau, mais le recouvrement par le clavier réduit la zone
     visible sans recalcul ; absence d'usage de `100svh`/`scroll-into-view` au focus.
   - **Sidebar PC** : `.mobile-navbar` a `overflow-y: auto`, mais le conteneur enfant
     `.navbar-tabs-container` (flex column, `height: auto`) peut empêcher le défilement effectif
     si la hauteur totale dépasse, coupant les derniers onglets (Prêts).
   - **Prêts mobile** : non présents dans la barre inférieure (`Navbar` mobile = 4 onglets + Plus) ;
     l'accès dépend du menu « Plus » (`MoreMenuPage` → `loans`). Fiabiliser ce chemin.

## Correctness Properties

Property 1: Bug Condition — Restauration de session sur le chemin API (mobile et PC)

_For any_ entrée où la Bug_Condition de session est vraie (`isBugCondition({zone:'session'})`),
c.-à-d. un cookie de session JWT valide présent au moment d'un rafraîchissement sur le chemin
`isApiBackend`, la fonction corrigée SHALL restaurer la session via `GET /api/auth/me` et
maintenir l'utilisateur sur l'écran applicatif courant sans redirection vers `/login`, le
Service Worker ne servant jamais une réponse de navigation/`/api/*` mise en cache de façon
inappropriée.

**Validates: Requirements 2.1, 2.2**

Property 2: Bug Condition — Authentification Google sans blocage sur mobile

_For any_ entrée où la Bug_Condition Google est vraie (`isBugCondition({zone:'google'})`), la
fonction corrigée SHALL mener le flux GIS à son terme sans rester en chargement infini (résolution
déterministe du résultat, y compris en cas de pop-up bloquée via un repli ou une erreur explicite),
et, en cas de succès, créer automatiquement l'utilisateur et l'agence dans `foxdb` via
`POST /api/auth/google-login` puis connecter l'utilisateur de bout en bout.

**Validates: Requirements 2.3, 2.4**

Property 3: Bug Condition — Inscription classique avec connexion directe

_For any_ entrée où la Bug_Condition d'inscription est vraie (`isBugCondition({zone:'signup'})`),
la fonction corrigée SHALL finaliser la création du compte sans imposer d'étape bloquante de
confirmation d'e-mail, connecter directement le nouvel inscrit (session établie par
`POST /api/auth/register`) et le rediriger vers `/app`.

**Validates: Requirements 2.5, 2.6**

Property 4: Bug Condition — Essai 30 jours fiable et imposé côté serveur

_For any_ compte évalué sur le chemin API (`isBugCondition({zone:'trial'})`), la décision d'accès
SHALL être calculée côté serveur à partir de `users.created_at` de `foxdb` : accès libre tant que
`now - created_at < 30 jours`, blocage via `AccesRestreint` lorsque `now - created_at >= 30 jours`
ET aucun `Acces_Payant` n'est accordé, la décision n'étant pas falsifiable côté client (le client
ne fait que refléter le verdict serveur).

**Validates: Requirements 2.7, 2.8**

Property 5: Bug Condition — Mise en page mobile/PC accessible

_For any_ entrée où la Bug_Condition de mise en page est vraie (`isBugCondition({zone:'layout'})`),
la fonction corrigée SHALL : conserver le formulaire d'auth lisible et défilable lorsque le clavier
est ouvert (tous champs/boutons du bas atteignables) ; afficher le bouton WhatsApp flottant fixé
en bas à droite sur mobile ; permettre le défilement de la sidebar PC (éléments du bas, dont Prêts,
visibles) ; fournir un accès fiable aux Prêts sur mobile.

**Validates: Requirements 2.9, 2.10, 2.11, 2.12**

Property 6: Preservation — Session PC et chemins démo/Supabase inchangés

_For any_ entrée où la Bug_Condition est fausse (`NOT isBugCondition`), la fonction corrigée SHALL
produire le même résultat que la fonction d'origine pour la restauration de session sur PC, la
connexion e-mail/mot de passe valide, et l'ensemble du chemin démo/mock/Supabase (aucune
modification de `supabase.js`/`createClient`), préservant 3.1, 3.2 et 3.5.

**Validates: Requirements 3.1, 3.2, 3.5**

Property 7: Preservation — Décisions d'accès payant et blocage post-essai inchangés

_For any_ entrée où la Bug_Condition est fausse, la fonction corrigée SHALL continuer d'accorder
l'accès aux comptes disposant d'un `Acces_Payant` validé, indépendamment de l'essai, et de bloquer
via `AccesRestreint` les comptes hors essai non payés, en respectant l'autorité d'accès côté
serveur.

**Validates: Requirements 3.3, 3.4**

Property 8: Preservation — Stratégie de cache du Service Worker inchangée

_For any_ requête NE relevant pas de la Bug_Condition de session (assets statiques, bundles
hachés, `version.json`), la fonction corrigée SHALL conserver la stratégie de cache existante
(network-first navigation, cache-first assets, `/api` ignoré, mise à jour de version).

**Validates: Requirements 3.6**

Property 9: Preservation — FAB WhatsApp masqué sans brouillon

_For any_ état où `pendingCount === 0`, la fonction corrigée SHALL continuer de masquer le bouton
WhatsApp flottant lié aux brouillons (retour `null`), comme avant la correction.

**Validates: Requirements 3.8**

Property 10: Preservation — Mises en page bureau et navigation mobile sans régression

_For any_ entrée où la Bug_Condition de mise en page est fausse, la fonction corrigée SHALL
préserver la mise en page bureau (sidebar, en-tête, contenu) et la navigation mobile (barre
inférieure, écrans existants) sans régression visuelle.

**Validates: Requirements 3.7, 3.9**

## Fix Implementation

En supposant l'analyse des causes confirmée par le checking exploratoire.

### Z1 — Persistance de session (chemin API Fastify)

**Fichiers** : `public/sw.js`, `src/context/AppContext.jsx`, `src/App.jsx` (garde).

**Changements** :
1. **Durcir la navigation SW** : ne servir le repli `./index.html` mis en cache **que hors-ligne**
   (vérifier `navigator.onLine === false` avant `caches.match`), afin qu'un réseau lent ne
   provoque pas un démarrage « sans session ». Conserver network-first et la mise à jour de
   version (préserve 3.6).
2. **Robustesse du bootstrap** : dans l'effet de session API, ne pas rediriger tant que
   `getSession()` n'a pas tranché ; conserver `user` tant que `authChecked` n'est pas confirmé.
   S'assurer que `loading`/`authChecked` ne basculent pas `user` à `null` sur erreur réseau
   transitoire (distinguer 401 « non authentifié » d'une erreur réseau).
3. **Cohérence du cookie** : vérifier (et documenter) que `VITE_API_URL` est same-origin en prod
   pour que le cookie `token` (`sameSite: 'lax'`) accompagne `/api/auth/me` sur mobile ; sinon
   recommander le même domaine. Aucune modification de la pose du cookie côté serveur n'est
   nécessaire si same-origin.

### Z2 — Authentification Google (mobile)

**Fichiers** : `src/context/AppContext.jsx` (`signInWithGoogle`), éventuellement
`api/routes/auth.js` (inchangé fonctionnellement — la création auto existe déjà).

**Changements** :
1. **Appeler `requestAccessToken()` dans le geste utilisateur** : précharger le script GIS au
   montage de la page d'auth afin que, au clic, `initTokenClient(...).requestAccessToken()` soit
   invoqué synchroniquement (sans `await` préalable) et ne soit pas bloqué.
2. **Garde anti-blocage** : ajouter un délai de sécurité (timeout) qui résout la `Promise` avec
   une erreur explicite si aucun `callback` GIS n'arrive (pop-up bloquée), supprimant le
   chargement infini et restaurant l'état du bouton.
3. **Gestion d'erreur claire** : message utilisateur invitant à autoriser les pop-ups ou à
   réessayer ; option de repli vers un flux compatible mobile si nécessaire.
4. **Serveur** : `POST /api/auth/google-login` conserve la création auto utilisateur + agence dans
   `foxdb` (déjà implémentée) ; aucune modification de Supabase.

### Z3 — Inscription classique e-mail / mot de passe

**Fichiers** : `src/pages/SignUp.jsx`, secondairement `src/services/dataProvider/apiProvider.js`.

**Changements** :
1. **Redirection déterministe en mode API** : après `signUp` réussi avec `result.user`, rediriger
   immédiatement vers `/app`. Réserver la branche « écran de succès / confirmation » au seul
   chemin Supabase (sans session). Supprimer tout affichage de confirmation d'e-mail bloquant en
   mode API.
2. **Propagation du nom d'agence** : confirmer que `business_name` est bien transmis comme
   `agencyName` (déjà mappé dans `apiProvider.auth.signUp`) afin que `register` crée l'agence et
   permette `requireAgency` ensuite.
3. **Aucun changement serveur** : `register` pose déjà le cookie et renvoie l'utilisateur.

### Z4 — Période d'essai gratuite (30 jours), imposée côté serveur

**Fichiers** : `api/schema.sql` (+ migration additive), `api/routes/auth.js` (et/ou nouvelle
logique d'accès partagée côté API), `src/context/AppContext.jsx` (`loadProfile`),
`src/utils/finance.js` (helper de présentation uniquement), `src/utils/accessControl.js`.

**Changements** :
1. **Schéma `foxdb`** (migration additive, non destructive) : ajouter à `users` les colonnes
   `paid_access BOOLEAN DEFAULT false` et `paid_access_until TIMESTAMPTZ NULL` (ou table dédiée),
   `created_at` étant déjà présent et servant de base d'essai.
2. **Décision d'accès côté serveur** : calculer l'accès dans l'API à partir de `created_at` et de
   l'accès payant. Exposer le verdict via `GET /api/auth/me` (champs additifs :
   `accessGranted`, `trialActive`, `trialEndsAt`, `paidAccess`). Le calcul d'essai
   (`now - created_at < 30j`) est réalisé **sur le serveur** ; le client ne fait que le refléter.
3. **Imposition** : les routes de données sensibles refusent l'accès (HTTP 402/403) lorsque
   l'essai est expiré sans accès payant — l'autorité reste serveur, non contournable côté client
   (complète, sans remplacer, le verrou `requireAgency`).
4. **Front** : `loadProfile` (chemin API) renseigne `profilAcces` à partir du verdict serveur
   (`acces_autorise` = `accessGranted` renvoyé par `me`) au lieu de `isActive ?? true`.
   `AccessGate`/`isAccessGranted` consomment ce verdict ; le helper de calcul d'affichage des
   jours restants vit dans `src/utils/finance.js` (par AGENTS.md) et est testé dans
   `finance.test.js`.

### Z5 — Design & mise en page mobile/PC (frontend)

**Fichiers** : `src/index.css`, `src/components/WhatsAppFab.jsx`, `src/pages/SignIn.jsx`,
`src/pages/SignUp.jsx`, `src/App.jsx`/`Navbar.jsx`/`MoreMenuPage`.

**Changements** :
1. **WhatsApp FAB** : garantir que le FAB n'est pas piégé par un ancêtre transformé. Le sortir
   d'un éventuel conteneur `motion`/transformé ou neutraliser le transform de l'ancêtre, et
   confirmer `position: fixed; right: 16px; bottom: ...` ancré au viewport, en bas à droite.
2. **Clavier virtuel (auth)** : utiliser `100svh`/`100dvh` adaptés, garantir `overflow-y: auto`
   sur le panneau de formulaire et déclencher `scrollIntoView` au focus des champs du bas ;
   ajouter le padding de zone sûre.
3. **Sidebar PC** : rendre le défilement effectif (s'assurer que `.mobile-navbar` borne sa hauteur
   et que `.navbar-tabs-container` défile — `min-height: 0`/`flex: 1` + `overflow-y: auto`),
   afin que les derniers onglets (Prêts) restent atteignables.
4. **Prêts sur mobile** : fiabiliser l'entrée « Prêts » du menu « Plus » (sélection d'onglet
   `loans` rendue dans le bottom sheet) ; vérifier la présence et l'accessibilité de l'item.

## Testing Strategy

### Validation Approach

Approche en deux temps : d'abord faire émerger des contre-exemples démontrant chaque défaut sur
le code **non corrigé**, puis vérifier que la correction fonctionne et préserve l'existant. Les
tests ciblent le chemin Fastify (`isApiBackend === true`) ; le réseau API et GIS sont simulés.

### Exploratory Bug Condition Checking

**Goal** : faire émerger des contre-exemples démontrant le bug AVANT correction et confirmer ou
réfuter l'analyse des causes. En cas de réfutation, ré-hypothéser.

**Test Plan** : simuler chaque zone sur le code non corrigé (mocks de `authApi`/`fetch`, de GIS,
de `navigator.onLine`, du cookie de session) et observer les échecs.

**Test Cases** :
1. **Z1 — Session mobile** : monter l'app avec cookie valide, simuler F5 + réponse `/api/auth/me`
   retardée et SW servant `index.html` ⇒ observer la redirection vers `/login` (échoue sur code
   non corrigé).
2. **Z2 — Google pop-up bloquée** : simuler `requestAccessToken()` sans `callback` ⇒ observer la
   `Promise` non résolue / spinner infini (échoue sur code non corrigé).
3. **Z3 — Inscription** : `signUp` API réussi mais UI affichant l'écran de confirmation au lieu de
   `/app` (échoue sur code non corrigé selon la branche).
4. **Z4 — Essai serveur** : compte créé il y a 45 jours sans paiement ⇒ `me` renvoie
   `acces_autorise=true` (dérivé d'`isActive`) et l'accès n'est pas bloqué (échoue : pas
   d'autorité d'essai serveur).
5. **Z5 — Mise en page** : FAB rendu sous un ancêtre transformé ⇒ position calculée hors
   bas-droite ; sidebar PC à faible hauteur ⇒ Prêts coupés (échouent sur code non corrigé).

**Expected Counterexamples** :
- Redirection `/login` après F5 malgré cookie valide (Z1).
- `signInWithGoogle` ne se résout jamais (Z2).
- Absence de redirection `/app` après inscription API (Z3).
- Accès accordé à 45 jours sans paiement (Z4).
- FAB hors bas-droite / onglets sidebar inaccessibles (Z5).
- Causes possibles : repli cache navigation, flux pop-up sans geste/timeout, branche UI héritée,
  absence de logique d'essai serveur, bloc conteneur de positionnement fixe.

### Fix Checking

**Goal** : vérifier que pour toute entrée satisfaisant la Bug_Condition, la fonction corrigée
produit le comportement attendu.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedBehavior(input)        // session restaurée / Google résolu / redirigé /app /
                                        // essai tranché serveur / mise en page accessible
  ASSERT expectedBehavior(result)       // Propriétés 1 à 5
END FOR
```

### Preservation Checking

**Goal** : vérifier que pour toute entrée NE satisfaisant PAS la Bug_Condition, la fonction
corrigée produit le même résultat que la fonction d'origine.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalBehavior(input) = fixedBehavior(input)
END FOR
```

**Testing Approach** : le test par propriétés (fast-check) est recommandé pour la préservation :
il génère de nombreux cas (dates de création variées, états payant/non payant, requêtes SW,
`pendingCount`, viewports) et couvre des cas limites que des tests unitaires manqueraient,
garantissant l'invariance du comportement pour les entrées non concernées.

**Test Plan** : observer d'abord le comportement sur code non corrigé (session PC, connexion
classique, accès payant, blocage post-essai légitime, cache assets, FAB masqué, mises en page),
puis écrire des tests capturant ce comportement.

**Test Cases** :
1. **Session PC** : F5 d'un utilisateur connecté restaure la session (inchangé — 3.1).
2. **Connexion classique** : identifiants valides ⇒ app (inchangé — 3.2).
3. **Accès payant / blocage post-essai** : accès payant accordé ; compte hors essai non payé
   bloqué (inchangé — 3.3, 3.4).
4. **Démo/mock/Supabase** : `?debug_force_demo`/`loginAsDemo` ⇒ accès local sans réseau ;
   `supabase.js`/`createClient` non modifiés (inchangé — 3.5).
5. **Cache SW** : assets statiques et bundles hachés servis par la stratégie existante,
   `version.json` jamais mis en cache, `/api` ignoré (inchangé — 3.6).
6. **FAB masqué** : `pendingCount === 0` ⇒ `null` (inchangé — 3.8).
7. **Mises en page** : bureau et navigation mobile sans régression (inchangé — 3.7, 3.9).

### Unit Tests

- **Z4 (pur)** : helper de calcul d'essai dans `src/utils/finance.js` (jours restants, actif/expiré
  selon `created_at`) testé dans `src/utils/finance.test.js` ; `isAccessGranted`
  (`accessControl.js`) reflète le verdict serveur.
- **Z2** : `signInWithGoogle` résout en cas de pop-up bloquée (timeout/erreur) et en cas de succès
  (mock GIS + `authApi.googleLogin`).
- **Z3** : `SignUp.handleSubmit` redirige vers `/app` quand `result.user` est présent (mode API).
- **Z1** : effet de bootstrap conserve `user` sur erreur réseau transitoire, redirige seulement
  sur 401 avéré.
- **SW** : la navigation ne sert le repli `index.html` que hors-ligne ; assets/`version.json`/`/api`
  inchangés.

### Property-Based Tests

- **Préservation essai (Z4)** : pour des `created_at` et états payant aléatoires, le verdict
  d'accès du serveur est cohérent (libre < 30j ; bloqué ≥ 30j sans paiement ; accordé si payé) et
  le client reflète exactement ce verdict (non falsifiable côté client).
- **Préservation SW** : pour des URL aléatoires (assets, bundles, `version.json`, `/api`), la
  stratégie de cache reste identique à l'originale.
- **Préservation FAB** : pour `pendingCount` aléatoire, `pendingCount === 0 ⇔ rendu null`.

### Integration Tests

- **Flux complet session** : connexion API → F5 (mobile et PC) → session restaurée, pas de
  redirection `/login` (Z1, 3.1).
- **Flux Google mobile** : clic → GIS → `google-login` → utilisateur + agence créés dans `foxdb`
  → app (Z2, 2.4) ; cas pop-up bloquée → erreur explicite, pas de blocage.
- **Flux inscription** : `register` → connexion directe → `/app`, sans écran de confirmation
  (Z3, 2.5–2.6).
- **Flux essai** : nouveau compte < 30j accède librement ; compte ≥ 30j sans paiement bloqué par
  `AccesRestreint` ; compte payant accède (Z4, 2.7–2.8, 3.3–3.4).
- **Mise en page** : ouverture clavier sur auth (formulaire défilable) ; FAB en bas à droite sur
  mobile ; sidebar PC défilable (Prêts visibles) ; accès Prêts via « Plus » sur mobile
  (Z5, 2.9–2.12).
