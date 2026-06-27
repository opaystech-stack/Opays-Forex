# Implementation Plan: Admin UX Enhancement

## Overview

This plan harmonizes the visual/UX layer of the two admin spaces and the public
client-facing forms by reusing the existing Design_Primitives and Theme_Variables
in `src/index.css`. The work is purely presentational: new shared components
(`StandaloneAdminHeader`, `BrandHeader`), a small additive set of shared CSS
patterns, and markup/class changes in `ConsoleAdmin`, `EspaceAdminPlateforme`,
and `FormulaireCommande`. No business logic, data flow, guard, or route behavior
changes (Requirement 10, 11.8).

The implementation language is JavaScript/JSX (React + Vite), matching the
existing codebase. Tests use the existing Vitest + @testing-library/react +
fast-check setup. CSS-driven responsive checks are verified with the existing
Playwright CLI skill rather than jsdom.

Tasks are ordered for incremental progress: i18n keys and shared CSS first, then
shared components, then the route wrappers that wire them in, then page-level
markup edits, and finally tests and a build checkpoint.

## Tasks

- [x] 1. Add i18n keys and shared CSS foundations
  - [x] 1.1 Add new i18n keys in both `fr` and `en`
    - In `src/i18n.js`, add any new keys required by the enhancement (e.g. the
      `.screen-desc` description for `ConsoleAdmin`, the icon-only receipt
      control `aria-label`, the loading and empty-state labels if not already
      present) under BOTH the `fr` and `en` locale objects with non-empty values
    - Reuse existing keys where the wording is equivalent: `nav.dashboard`,
      `access.logout`, `app.title`, existing `statusLabel()` keys
      (`admin.status_none`, `admin.status_<status>`), `admin.access_granted`,
      `admin.access_revoked`, `loading.data`, `admin.empty`
    - Do not remove or rename existing keys
    - _Requirements: 1.4, 1.5, 1.6, 9.1, 9.2, 9.3, 9.4, 9.5, 11.4_

  - [x]* 1.2 Write property test for i18n key definition across locales
    - **Property 3: New i18n keys are defined and non-empty in both locales**
    - **Validates: Requirements 9.2, 11.4**
    - Use `fast-check` over the list of newly introduced keys; assert each value
      is defined and non-empty in both `fr` and `en` and that the key sets match
    - `fc.assert(fc.property(...), { numRuns: 100 })`

  - [x]* 1.3 Write property test for i18n resolution behavior
    - **Property 4: i18n resolution never leaks empty strings and surfaces missing keys**
    - **Validates: Requirements 9.4, 9.5**
    - Generate defined keys (assert non-empty and not equal to the raw key) and
      random undefined keys (assert `t` returns the key string itself)
    - `fc.assert(fc.property(...), { numRuns: 100 })`

  - [x] 1.4 Add `.standalone-header` and shared `.badge` variant CSS
    - In `src/index.css` (additive only), add `.standalone-header` layout for the
      shared admin header and `.badge` with `.badge-success` (`--color-green`),
      `.badge-danger` (`--color-red`), `.badge-warning` (`--color-orange`),
      `.badge-neutral` (`--text-muted`)
    - Set all color/border/surface values only through existing Theme_Variables;
      no hardcoded color literals
    - _Requirements: 1.3, 2.6, 3.2, 3.3, 6.4, 6.5_

- [x] 2. Create shared presentational components
  - [x] 2.1 Create `src/components/StandaloneAdminHeader.jsx`
    - Implement the component per the design: a `.standalone-header` container
      with a back-to-dashboard `.btn .btn-outline` control (label via
      `t('nav.dashboard')`) first in DOM order, then a logout `.btn .btn-outline`
      control (red accent from `--color-red`, label via `t('access.logout')`)
    - Accept `onBack` and `onLogout` callback props; use existing icon set
      (`ArrowLeft`, `LogOut`) and `useT`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 2.2 Create `src/components/BrandHeader.jsx`
    - Implement a `.brand-header` block (brand mark + brand name) using only
      existing primitives/variables; brand name reuses `t('app.title')`
    - Accept optional `title` and `subtitle` props; no hardcoded display literals
    - _Requirements: 11.3, 11.4_

  - [x] 2.3 Add `.brand-header` CSS
    - In `src/index.css` (additive only), add `.brand-header` styling using
      existing Theme_Variables and spacing primitives; no new color/font-size/
      spacing literals
    - _Requirements: 11.2, 11.3_

  - [x]* 2.4 Write unit tests for shared components
    - Assert `StandaloneAdminHeader` renders exactly one back then one logout
      control in DOM order with labels equal to `t('nav.dashboard')` /
      `t('access.logout')`
    - Assert `BrandHeader` renders brand identity from `t('app.title')`
    - _Requirements: 1.1, 1.2, 1.4, 11.3, 11.4_

- [x] 3. Wire shared header into both admin route wrappers
  - [x] 3.1 Add `AdminConsoleScreen` and update `PlatformAdminScreen` in `src/App.jsx`
    - Add an `AdminConsoleScreen` wrapper symmetric to `PlatformAdminScreen`:
      `StandalonePage` (maxWidth 1080) → `StandaloneAdminHeader` → `<ConsoleAdmin />`,
      with `onBack = () => navigate('/app')` and an `onLogout` that calls the
      context `logOut()` then `navigate('/login')`
    - Point the `/admin` route element at `AdminConsoleScreen` using the SAME
      guards (`PrivateRoute` → `AdminRoute`); do not change route paths or guards
    - In `PlatformAdminScreen`, replace the inline header `<div>` with
      `<StandaloneAdminHeader onBack={...} onLogout={...} />`, preserving the
      existing `logOut` / navigation handlers
    - _Requirements: 1.1, 1.2, 1.3, 10.2, 10.3, 10.4_

  - [x]* 3.2 Write example tests for shared header consistency
    - **Validates: Requirement 1**
    - Render `AdminConsoleScreen` and `PlatformAdminScreen`; assert identical
      header markup (same class names, same DOM hierarchy, back-before-logout
      order) and identical resolved labels across both spaces
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [x] 4. Checkpoint - shared foundations in place
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Enhance Admin_Console (`src/pages/ConsoleAdmin.jsx`)
  - [x] 5.1 Add `.admin-users` responsive table CSS
    - In `src/index.css` (additive only), add the `.admin-users` table pattern:
      default tabular layout for `> 600px`, and a `@media (max-width: 600px)`
      block that hides `thead`, turns each `<tr>` into a stacked card-style
      block, and renders each `<td>`'s `data-label` as a field label via
      `::before` using `content: attr(data-label)`
    - Constrain widths so the body produces no horizontal scrollbar and nothing
      is clipped; use only existing Theme_Variables
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 5.2 Apply presentational edits to `ConsoleAdmin`
    - Add a `.screen-desc` under the existing `.screen-title` (i18n-resolved) so
      the header matches Platform_Admin_Space
    - Replace the inline-styled `<table>`/cells with the `.admin-users` table and
      `data-label` attributes (column labels via `useT`), keeping column order
      email → access → status → actions
    - Render access state as an Access_Badge (`.badge .badge-success` /
      `.badge .badge-danger` with visible text via `t('admin.access_granted')` /
      `t('admin.access_revoked')`) and proof status as a Status_Badge using the
      existing `statusLabel()` helper (labeled badge for the no-proof case)
    - Keep loading / empty / populated states mutually exclusive using existing
      `loading` / `pageEntries.length` branches with labels from `t('loading.data')`
      and `t('admin.empty')`
    - Keep row actions as `.btn .btn-outline` controls; give the icon-only receipt
      control (`FileText`) an `aria-label` from the new i18n key
    - Preserve `buildAdminPage`, `buildEntries`, `latestProofStatus`, pagination,
      `loadData`, `handleAccessChange`, `handleReview`, `selectProof` exactly
    - _Requirements: 2.1, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 5.1, 5.2, 5.3, 5.4, 5.5, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 8.1, 8.2, 8.5_

  - [x]* 5.3 Write property test for access/status badge labels
    - **Property 1: Every access/status state renders a non-empty text label**
    - **Validates: Requirements 3.2, 3.3, 3.4, 7.5**
    - Generate access boolean + status from `{ null, "en_attente", "validee",
      "rejetee", arbitrary unknown string }`; assert badge text is non-empty,
      non-blank, and not the raw status code
    - `fc.assert(fc.property(...), { numRuns: 100 })`

  - [x]* 5.4 Write example tests for users list structure and states
    - Assert email/access/status/actions present in column order, `.btn` actions
      expose accessible names, and a labeled badge renders when no proof exists
    - Three renders (loading, loaded-empty, loaded-with-users) asserting exactly
      one of indicator / empty-message / list is shown with i18n labels
    - _Requirements: 3.1, 3.5, 3.6, 3.7, 5.1, 5.2, 5.3_

  - [x]* 5.5 Write behavior-preservation regression tests for `ConsoleAdmin`
    - Assert the same Supabase calls/handlers fire with identical arguments after
      the markup change (data loading order, access activation, proof review)
    - _Requirements: 10.1, 10.5, 10.6_

- [x] 6. Enhance Platform_Admin_Space (`src/pages/EspaceAdminPlateforme.jsx`)
  - [x] 6.1 Apply presentational edits to `EspaceAdminPlateforme`
    - Adopt one shared section-heading class for the stats, agencies, and catalog
      headings (matching font-family/size/weight/line-height across spaces);
      remove the hardcoded `var(--deep-navy)` inline color in favor of an existing
      theme variable used for headings
    - Replace the inline agency state pill (with `rgba(...)` literals) with
      `.badge .badge-success` / `.badge .badge-danger` so each state maps to a
      distinct Theme_Variable color
    - Render catalog active → `.badge-success` (`--color-green`), inactive →
      `.badge-danger` (`--color-red`)
    - Preserve `.stat-box`/`.stat-label`/`.stat-value` and `.ledger-*` structure
      and the agency row field order identifier → owner → state → modules
    - No change to handlers, context calls, or the `isPlatformEditor` guard
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 8.1, 8.2, 8.3, 8.4_

  - [x]* 6.2 Write property test for agency state color mapping
    - **Property 2: Agency states map to distinct theme colors**
    - **Validates: Requirements 6.4**
    - Generate pairs of agency state values; assert the resolved badge variant /
      Theme_Variable color is equal if and only if the two states are equal
    - `fc.assert(fc.property(...), { numRuns: 100 })`

  - [x]* 6.3 Write example tests for platform structure
    - Assert `.stat-box`/`.stat-label`/`.stat-value`, `.ledger-list`/`.ledger-item`/
      `.ledger-icon-box`, agency row field order, and catalog active→green /
      inactive→red badge variants
    - _Requirements: 6.1, 6.2, 6.3, 6.5_

- [x] 7. Checkpoint - admin spaces harmonized
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Enhance public form (`src/pages/FormulaireCommande.jsx`)
  - [x] 8.1 Apply mobile-first shell and BrandHeader to `FormulaireCommande`
    - Wrap content in a mobile-first single-column shell (320–600px) using
      existing primitives; add `<BrandHeader />` above the `.screen-header`
    - Replace residual inline literals (font-size/color/spacing) on text nodes
      with shared classes/Theme_Variables where practical
    - Ensure focus visibility via `:focus-visible` and ≥44×44px tap targets on
      all interactive controls; keep semantic `<label htmlFor>` + `.form-control`
    - Preserve `validateOrderForm`, upload, `submit_remote_order` RPC,
      `INVALID_LINK_RPC_CODES` handling, demo-mode branch, success/`done`
      behavior, and the invalid-link screen unchanged
    - _Requirements: 11.1, 11.2, 11.3, 11.5, 11.6, 11.7, 11.8, 11.9_

  - [x]* 8.2 Write property test for incomplete public-form submission
    - **Property 5: Public form rejects incomplete submissions with no side effects**
    - **Validates: Requirements 11.5**
    - Generate form states with ≥1 missing/blank required field; render
      `FormulaireCommande` with mocked `supabase`; submit; assert rejection,
      retained values, an i18n-resolved field message, and zero `storage.upload`
      and `submit_remote_order` RPC calls
    - `fc.assert(fc.property(...), { numRuns: 100 })`

  - [x]* 8.3 Write example tests for public-form branches and behavior preservation
    - Assert `BrandHeader` renders above the fields; mock success → success
      message shown and form removed; mock RPC failure → failure message shown,
      values retained, form still present
    - Assert the same Supabase calls/handlers fire with identical arguments after
      the markup change (behavior preservation)
    - _Requirements: 11.3, 11.6, 11.7, 11.8_

- [x] 9. Cross-cutting accessibility and button-styling tests
  - [x]* 9.1 Write accessibility example tests for admin controls
    - Tab to controls, press Enter/Space, assert handler parity with click;
      assert icon-only controls expose non-empty accessible names; assert `alert`
      role on status messages
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.6_

  - [x]* 9.2 Write button-styling example tests
    - Assert primary controls carry `.btn .btn-primary`, secondary/destructive
      controls carry `.btn .btn-outline`, and accent colors derive only from
      `--color-red` / `--color-green` Theme_Variables
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 10. Verify CSS-driven responsive layout
  - [x]* 10.1 Run Playwright CLI responsive checks at boundary widths
    - Using the existing Playwright CLI skill (not jsdom), check boundary widths
      (e.g. 320px, 375px, 599px, 601px): assert no horizontal scrollbar, stacked
      labeled cards ≤600px, tabular layout >600px, exactly one layout per width,
      and ≥44×44px interactive controls on the public form
    - This is a CLI verification task; run it outside the automated Vitest suite
      per the existing skill workflow
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 11.1, 11.9_

- [x] 11. Final checkpoint - ensure suite green and build succeeds
  - Run `npm test` and confirm it is green; run `npm run build` and confirm the
    production build succeeds. Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (tests and the Playwright verification) and
  can be skipped for a faster MVP; core implementation tasks are never optional.
- Each task references specific granular requirements for traceability.
- Property-based tests (Properties 1–5) run a minimum of 100 iterations and are
  each tagged with the design property and the requirement clause they validate.
- All CSS is additive in `src/index.css` and uses only existing Theme_Variables;
  no new design system or color/spacing/typography literals are introduced.
- Behavior is frozen: handlers, data flows, guards, routes, and pure utilities
  are preserved (Requirements 10, 11.8).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.4"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.1", "2.2", "2.3"] },
    { "id": 2, "tasks": ["2.4", "3.1", "5.1"] },
    { "id": 3, "tasks": ["3.2", "5.2", "6.1", "8.1"] },
    { "id": 4, "tasks": ["5.3", "5.4", "5.5", "6.2", "6.3", "8.2", "8.3", "9.1", "9.2"] },
    { "id": 5, "tasks": ["10.1"] }
  ]
}
```
