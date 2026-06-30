# Implementation Plan

## Overview

Plan de correction du spec `auth-access-mobile-fixes` suivant la méthodologie de condition de bug
(bug condition methodology) sur le chemin primaire de production (API Fastify, `isApiBackend === true`).
Les tests d'exploration (Property 1 — Bug Condition) et de préservation (Property 2 — Preservation)
sont écrits AVANT toute correction, puis la correction des cinq zones de défauts (Z1 session, Z2 Google,
Z3 inscription, Z4 essai 30 jours, Z5 mise en page) est appliquée, et enfin les mêmes tests sont
ré-exécutés pour confirmer la résolution (fix checking) sans régression (preservation checking).

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1", "2"],
      "description": "Write exploration tests (must FAIL) and preservation tests (must PASS) on the unfixed code, before any fix."
    },
    {
      "wave": 2,
      "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5"],
      "description": "Implement the five independent fix units (Z1 session, Z2 Google, Z3 signup, Z4 trial, Z5 layout)."
    },
    {
      "wave": 3,
      "tasks": ["3.6", "3.7"],
      "description": "Re-run task 1 tests (now PASS) and task 2 tests (still PASS) after the fix."
    },
    {
      "wave": 4,
      "tasks": ["4"],
      "description": "Checkpoint - full suite green."
    }
  ]
}
```

- Task 1 and Task 2 are independent of each other and must both complete before Task 3.
- Tasks 3.1–3.5 are independent fix units and may proceed in any order.
- Tasks 3.6 and 3.7 depend on completion of 3.1–3.5.
- Task 4 depends on 3.6 and 3.7.

## Tasks

- [x] 1. Write bug condition exploration tests (BEFORE implementing any fix)
  - **Property 1: Bug Condition** - Défauts d'accès et de mise en page sur le chemin API Fastify
  - **CRITICAL**: These tests MUST FAIL on the unfixed code - failure confirms the bugs exist
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: These tests encode the expected behavior (Properties 1-5) - they will validate the fix when they pass after implementation
  - **GOAL**: Surface counterexamples that demonstrate each of the five defect zones exists
  - **Scoped PBT Approach**: These are deterministic, environment-driven bugs - scope each property to the concrete failing case(s) for reproducibility, generating across the relevant input axes (varied `created_at`, paid/non-paid state, request URLs, `pendingCount`, viewports) where applicable
  - Mock `authApi`/`fetch`, GIS (`oauth2.initTokenClient`), `navigator.onLine`, and the session cookie to simulate `isApiBackend === true`
  - **Z1 (session)** — Mount app with a valid `token` cookie, simulate F5 with a delayed `/api/auth/me` response and the SW serving cached `index.html`; assert the app does NOT redirect to `/login` (from `isBugCondition({zone:'session'})`). EXPECTED on unfixed code: redirect to `/login` (FAIL)
  - **Z2 (google)** — Simulate `requestAccessToken()` with no `callback` (popup blocked); assert `signInWithGoogle` resolves deterministically (success or explicit error, no infinite spinner). EXPECTED on unfixed code: Promise never resolves (FAIL)
  - **Z3 (signup)** — Simulate a successful API `signUp` returning `result.user`; assert UI redirects to `/app` with no email-confirmation screen. EXPECTED on unfixed code: confirmation screen shown / no redirect (FAIL)
  - **Z4 (trial)** — For a `created_at` of 45 days ago with no paid access, assert `/api/auth/me` returns a server-computed `accessGranted = false` and access is blocked; for `created_at` < 30 days assert access is granted. EXPECTED on unfixed code: access granted at 45 days (`acces_autorise` derived from `isActive`) (FAIL)
  - **Z5 (layout)** — Assert WhatsApp FAB renders fixed bottom-right (not trapped by a transformed ancestor), PC sidebar scrolls so bottom items (Prêts) are reachable, auth form bottom fields reachable with virtual keyboard open, and Prêts reachable on mobile via "Plus". EXPECTED on unfixed code: FAB mispositioned / sidebar items clipped (FAIL)
  - Run tests on the UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct - it proves the bugs exist)
  - Document the counterexamples found to confirm or refute the hypothesized root causes (cache navigation fallback, popup flow without gesture/timeout, legacy Supabase UI branch, no server-side trial authority, fixed-positioning containing block)
  - Mark task complete when tests are written, run, and the failures are documented
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12_

- [x] 2. Write preservation property tests (BEFORE implementing any fix)
  - **Property 2: Preservation** - Comportements existants à préserver (¬C)
  - **IMPORTANT**: Follow the observation-first methodology - run the UNFIXED code first, record actual outputs, then assert those outputs
  - **GOAL**: Capture real baseline behavior for all inputs where `isBugCondition` is false
  - **Preferred approach**: property-based tests (fast-check) for stronger universal guarantees across the input domain
  - Observe: PC F5 with a valid cookie restores the session (3.1) - record and assert
  - Observe: valid email/password login authenticates and redirects to the app (3.2) - record and assert
  - Observe: a paid-access account is granted access regardless of trial; an out-of-trial unpaid account is blocked by `AccesRestreint` (3.3, 3.4) - record and assert
  - Observe: demo/mock paths (`?debug_force_demo`, `loginAsDemo`) grant local access with no network call; `src/services/supabase.js` and `createClient` are untouched (3.5) - record and assert
  - Observe (PBT): for random URLs (static assets, hashed bundles, `version.json`, `/api`), the SW cache strategy matches the original (network-first navigation, cache-first assets, `/api` ignored, version update) (3.6) - record and assert
  - Observe (PBT): for random `pendingCount`, `pendingCount === 0 ⇔ WhatsApp draft FAB renders null` (3.8) - record and assert
  - Observe: desktop layout (sidebar, header, content) and mobile bottom navigation render with no visual regression (3.7, 3.9) - record and assert
  - Run tests on the UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms the baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on the unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

- [x] 3. Fix the five defect zones on the Fastify API path

  - [x] 3.1 Z1 — Harden session persistence on the API path
    - In `public/sw.js`, serve the cached `./index.html` navigation fallback only when offline (check `navigator.onLine === false` before `caches.match`); keep network-first navigation, cache-first assets, version update, `/api` ignored
    - In `src/context/AppContext.jsx`, make the session bootstrap robust: do not flip `user` to `null` on a transient network error; distinguish a real 401 from a network failure and only redirect on a confirmed 401; keep `user` until `authChecked`/`getSession()` resolves
    - Confirm and document that `VITE_API_URL` is same-origin in production so the `sameSite: 'lax'` `token` cookie accompanies `/api/auth/me` on mobile
    - _Bug_Condition: isBugCondition({zone:'session'}) from design_
    - _Expected_Behavior: expectedBehavior(result) — Property 1 (session restored, no /login redirect, SW never serves inappropriate cached navigation/`/api`)_
    - _Preservation: Properties 6 and 8 (PC session, demo/Supabase, SW cache strategy)_
    - _Requirements: 2.1, 2.2_

  - [x] 3.2 Z2 — Resolve Google auth reliably on mobile (no infinite loading)
    - In `src/context/AppContext.jsx` (`signInWithGoogle`), preload the GIS script on auth-page mount so `initTokenClient(...).requestAccessToken()` is invoked synchronously inside the user gesture (no preceding `await`)
    - Add a safety timeout that resolves the Promise with an explicit error if no GIS `callback` arrives (popup blocked), removing the infinite spinner and restoring button state
    - Surface a clear user message (allow popups / retry); keep `POST /api/auth/google-login` server-side auto-creation of user + agency in `foxdb` unchanged; do not modify Supabase
    - _Bug_Condition: isBugCondition({zone:'google'}) from design_
    - _Expected_Behavior: expectedBehavior(result) — Property 2 (deterministic GIS resolution, auto user+agency creation, end-to-end login)_
    - _Preservation: Property 6 (demo/Supabase paths untouched)_
    - _Requirements: 2.3, 2.4_

  - [x] 3.3 Z3 — Direct sign-in after classic registration
    - In `src/pages/SignUp.jsx`, redirect to `/app` immediately when API `signUp` succeeds with `result.user`; reserve the success/confirmation screen branch for the Supabase-only path (no session). Remove the blocking email-confirmation display in API mode
    - In `src/services/dataProvider/apiProvider.js`, confirm `business_name` is propagated as `agencyName` so `register` creates the agency for later `requireAgency`
    - No server change: `register` already sets the cookie and returns the user
    - _Bug_Condition: isBugCondition({zone:'signup'}) from design_
    - _Expected_Behavior: expectedBehavior(result) — Property 3 (account finalized, no blocking email confirmation, direct login + redirect to /app)_
    - _Preservation: Property 6 (valid email/password login and Supabase path unchanged)_
    - _Requirements: 2.5, 2.6_

  - [x] 3.4 Z4 — Enforce the 30-day trial server-side (non-falsifiable)
    - Add an additive, non-destructive migration to `api/schema.sql` adding `users.paid_access BOOLEAN DEFAULT false` and `users.paid_access_until TIMESTAMPTZ NULL` (or a dedicated table); `created_at` already exists as the trial basis
    - In `api/routes/auth.js` (and/or shared API access logic), compute the access verdict server-side from `created_at` and paid access; expose additive fields via `GET /api/auth/me` (`accessGranted`, `trialActive`, `trialEndsAt`, `paidAccess`). The `now - created_at < 30j` check runs on the server
    - Enforce on sensitive data routes (HTTP 402/403 when trial expired and not paid), complementing `requireAgency`; the client cannot bypass
    - In `src/context/AppContext.jsx` (`loadProfile`, API path), set `profilAcces` (`acces_autorise = accessGranted` from `me`) instead of `isActive ?? true`; have `AccessGate`/`isAccessGranted` (`src/utils/accessControl.js`) reflect the server verdict
    - Keep the trial/remaining-days presentation helper in `src/utils/finance.js` with tests in `src/utils/finance.test.js` (per AGENTS.md)
    - _Bug_Condition: isBugCondition({zone:'trial'}) from design_
    - _Expected_Behavior: expectedBehavior(result) — Property 4 (server-computed trial: free < 30j, blocked >= 30j without paid access, client only reflects verdict)_
    - _Preservation: Property 7 (paid access and legitimate post-trial blocking unchanged)_
    - _Requirements: 2.7, 2.8_

  - [x] 3.5 Z5 — Accessible mobile/PC layout
    - WhatsApp FAB (`src/components/WhatsAppFab.jsx`, `src/index.css`): ensure it is not trapped by a transformed ancestor (move it out of a `motion`/transformed container or neutralize the ancestor transform); confirm `position: fixed; right: 16px; bottom: ...` anchored bottom-right on mobile
    - Virtual keyboard (auth) (`src/pages/SignIn.jsx`, `src/pages/SignUp.jsx`): use `100svh`/`100dvh` appropriately, ensure `overflow-y: auto` on the form panel, `scrollIntoView` on bottom-field focus, and safe-area padding
    - PC sidebar (`src/index.css`): make scrolling effective so bottom tabs (Prêts) stay reachable (`.mobile-navbar` bounds its height; `.navbar-tabs-container` uses `min-height: 0`/`flex: 1` + `overflow-y: auto`)
    - Prêts on mobile (`src/App.jsx`/`Navbar.jsx`/`MoreMenuPage`): make the "Plus" menu `loans` entry reliable (tab selection rendered in the bottom sheet); verify item presence and accessibility
    - _Bug_Condition: isBugCondition({zone:'layout'}) from design_
    - _Expected_Behavior: expectedBehavior(result) — Property 5 (form readable/scrollable with keyboard, FAB bottom-right, sidebar scrollable, Prêts reachable on mobile)_
    - _Preservation: Properties 9 and 10 (FAB hidden when no draft; desktop layout and mobile nav no regression)_
    - _Requirements: 2.9, 2.10, 2.11, 2.12_

  - [x] 3.6 Verify bug condition exploration tests now pass
    - **Property 1: Expected Behavior** - Défauts d'accès et de mise en page corrigés (chemin API Fastify)
    - **IMPORTANT**: Re-run the SAME tests from task 1 - do NOT write new tests
    - The tests from task 1 encode the expected behavior (Properties 1-5)
    - Run the bug condition exploration tests from step 1
    - **EXPECTED OUTCOME**: Tests PASS (confirms all five zones are fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12_

  - [x] 3.7 Verify preservation tests still pass
    - **Property 2: Preservation** - Comportements existants préservés (¬C)
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run the preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after the fix (no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

- [x] 4. Checkpoint - Ensure all tests pass
  - Run `npm test` (and `npm run build` if relevant) to ensure the full suite passes
  - Confirm both the bug condition exploration tests (now passing) and the preservation tests (still passing) succeed together
  - Ensure all tests pass, ask the user if questions arise

## Notes

- La condition de bug agrégée est `isBugCondition(input)` (cinq zones) définie dans `design.md`.
  Property 1 encode le comportement attendu (Propriétés 1–5) ; Property 2 capture le comportement
  préservé (Propriétés 6–10).
- Les tests de la tâche 1 DOIVENT échouer sur le code non corrigé (confirme l'existence des bugs)
  et passer après correction ; les tests de la tâche 2 DOIVENT passer avant ET après correction.
- Méthodologie observation-first pour la préservation : exécuter le code non corrigé, enregistrer
  les sorties réelles, puis les asserter (fast-check recommandé pour les garanties universelles).
- Conformément à AGENTS.md : la logique métier d'essai vit dans `src/utils/finance.js` avec tests
  dans `src/utils/finance.test.js` ; prudence sur la logique de cache de `public/sw.js`.
- `src/services/supabase.js` et l'appel `createClient` ne sont PAS modifiés (chemin démo/repli).
- Pour les commandes longues (serveur de dev, watchers), l'utilisateur doit les lancer manuellement ;
  utiliser `npm test` en exécution unique.
