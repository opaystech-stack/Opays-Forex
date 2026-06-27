# Design Document

## Overview

This feature is a **purely presentational/UX harmonization** of the two
administration spaces and the public client-facing forms. It introduces **no new
business logic, data flows, permissions/RLS, routing, or guards**. It builds
directly on top of the already-merged `admin-design-fix` bugfix (where
`ConsoleAdmin` is wrapped in `StandalonePage` and the platform-admin guard
honors `?debug_force_demo`).

The work targets three rendered surfaces:

- **Admin_Console** — `/admin` → `src/pages/ConsoleAdmin.jsx`
- **Platform_Admin_Space** — `/admin-plateforme` → `src/pages/EspaceAdminPlateforme.jsx`,
  wrapped by `PlatformAdminScreen` in `src/App.jsx`
- **Public_Form** — e.g. `/commande/:lien` → `src/pages/FormulaireCommande.jsx`
  (and structurally-similar public pages)

### Design principles

1. **Reuse, don't reinvent.** All styling uses the shared Design_Primitives
   already in `src/index.css` (`.standalone-page`, `.card`,
   `.screen-header`/`.screen-title`/`.screen-desc`, `.btn`/`.btn-primary`/`.btn-outline`,
   `.form-*`, `.ledger-*`, `.stat-box`/`.stat-label`/`.stat-value`, `.alert*`,
   `:focus-visible`) and the existing Theme_Variables (`--text-primary`,
   `--text-secondary`, `--text-muted`, `--border-color`, `--card-bg`,
   `--primary-blue`, `--color-primary`, `--color-green`, `--color-red`,
   `--color-orange`). New CSS is a **small, additive set** of shared patterns
   expressed only through these existing variables. No parallel design system.

2. **Extract shared structure.** The Standalone_Header (back-to-dashboard +
   logout) currently inlined in `PlatformAdminScreen` becomes a reusable
   component so both admin spaces render the identical DOM hierarchy, class
   names, control order, and i18n keys (Requirement 1).

3. **Behavior is frozen.** No data-loading calls, guards, handlers, or pure
   utilities (`adminActions.js`, `agencyStats.js`, `moduleEntitlements.js`,
   `catalogs.js`, `orderToken.js`) change. Edits are limited to JSX markup,
   class names, a shared header/brand-header component, and additive CSS
   (Requirement 10, Requirement 11.8).

4. **Everything localized.** Every new visible string resolves through `useT`
   with values defined in both `fr` and `en` in `src/i18n.js`; existing
   equivalent keys are reused rather than duplicated (Requirements 9, 11.4).

### Research notes

- The shared primitives and theme variables already exist and are confirmed in
  `src/index.css` (`.screen-title` 20px/700; `.screen-desc` 13px;
  `.stat-box`/`.stat-label`/`.stat-value`; `.ledger-*`; `.btn-outline`/`.btn-primary`;
  `:focus-visible` applies a `2px solid var(--primary-blue)` outline across
  `.standalone-page` and `.btn`). No new tokens are required.
- `FormulaireCommande` already uses `.card`, `.btn`, `.form-*`, `.screen-header`,
  `.alert*` and a `minHeight: 44px` submit control, so harmonization is mostly
  adding a shared brand header and moving inline literals onto existing
  primitives — not a rewrite.
- `EspaceAdminPlateforme` already uses `.stat-box`, `.ledger-list`/`.ledger-item`/`.ledger-icon-box`,
  `.card`, and `.alert*`. The remaining work is replacing a few inline
  color/typography literals and the inline agency state pill / section headings
  with shared classes.
- `ConsoleAdmin` currently renders its users list as an inline-styled `<table>`
  with `overflowX: 'auto'`. The responsive requirement (Requirement 4) is the
  largest visible change and is addressed with a label-driven CSS pattern.

## Architecture

### Component decomposition

```mermaid
graph TD
    subgraph App.jsx [src/App.jsx routing - unchanged guards]
        R1["/admin route<br/>PrivateRoute > AdminRoute"]
        R2["/admin-plateforme route<br/>PrivateRoute > PlatformEditorRoute"]
        ACS[AdminConsoleScreen wrapper]
        PAS[PlatformAdminScreen wrapper]
    end

    R1 --> ACS
    R2 --> PAS

    ACS --> SP1[StandalonePage]
    PAS --> SP2[StandalonePage]

    SP1 --> SH1[StandaloneAdminHeader]
    SP2 --> SH2[StandaloneAdminHeader]

    SP1 --> CA[ConsoleAdmin page content]
    SP2 --> EAP[EspaceAdminPlateforme page content]

    CA --> UL[UsersList responsive pattern]
    CA --> BADGE1[AccessBadge / StatusBadge]
    EAP --> BADGE2[Agency state pill / catalog status]

    subgraph Public [Public forms]
        FC[FormulaireCommande] --> BH[BrandHeader]
    end

    SH1 -. same component .- SH2
    BADGE1 -. shared .badge CSS .- BADGE2
```

### New shared building blocks

| Artifact | Location | Purpose | Requirements |
|----------|----------|---------|--------------|
| `StandaloneAdminHeader` | `src/components/StandaloneAdminHeader.jsx` | Shared back-to-dashboard + logout header for both admin spaces | 1.1–1.6 |
| `BrandHeader` | `src/components/BrandHeader.jsx` | Brand identity (logo/name) area above public form fields | 11.3 |
| `.standalone-header` CSS | `src/index.css` | Layout of the shared admin header | 1.3 |
| `.admin-users` / `.admin-users--card` CSS | `src/index.css` | Responsive tabular ↔ stacked-card users list | 4.1–4.6 |
| `.badge` + variants CSS | `src/index.css` | Text+color access/status pills | 3.2, 3.3, 6.4, 6.5 |
| `.brand-header` CSS | `src/index.css` | Brand area styling for public forms | 11.2, 11.3 |

All new CSS classes set color/border/surface **only** through existing
Theme_Variables (Requirements 2.6, 11.2).

### Shared header extraction (Requirement 1)

`PlatformAdminScreen` currently inlines the header markup. We extract it into
`StandaloneAdminHeader`, which both spaces consume so the DOM hierarchy, class
names, control ordering (back **before** logout), and i18n keys are byte-for-byte
identical.

To make the two routes symmetric, `/admin` gets an `AdminConsoleScreen` wrapper
in `App.jsx` that mirrors `PlatformAdminScreen` (same `StandalonePage` +
`StandaloneAdminHeader` + page-content structure). This keeps each page
component focused on content while the wrappers own the standalone chrome.

- `StandaloneAdminHeader` receives `onBack` and `onLogout` callbacks and renders:
  back control (`.btn .btn-outline`, label via `t('nav.dashboard')`) then logout
  control (`.btn .btn-outline`, red accent from `--color-red`, label via
  `t('access.logout')`).
- `PlatformAdminScreen` keeps its existing `navigate('/app')` / `logOut()`
  handlers and passes them in (no behavior change).
- `AdminConsoleScreen` provides the same handlers (`navigate('/app')` and the
  context `logOut()` then `navigate('/login')`), identical to the platform
  screen — purely presentational chrome around the unchanged `ConsoleAdmin`.

### Responsive users list (Requirement 4)

The `ConsoleAdmin` users list is re-expressed using a **single semantic `<table>`**
plus a **label-driven CSS pattern** so one source of truth drives both layouts
and exactly one layout is visible at any width (no JS breakpoint logic, no
duplicate markup, no behavior change):

- Each `<td>` carries a `data-label` attribute holding the column name (resolved
  via `useT`), and the row order stays email → access → status → actions
  (Requirement 3.6).
- `> 600px`: the table renders as a normal table (`.admin-users` default), one
  row per user, one column per field (Requirement 4.2).
- `≤ 600px`: a `@media (max-width: 600px)` block flips `thead` to
  `display:none`, makes each `<tr>` a stacked `.card`-like block, each `<td>`
  `display:flex` with `content: attr(data-label)` shown as the field label via a
  `::before` (Requirements 4.1, 4.3). Width is constrained so the body produces
  no horizontal scrollbar and nothing is clipped.
- Actions remain real `.btn` controls in both layouts, pointer- and
  keyboard-activatable (Requirements 4.4, 4.5).

This approach is chosen over a JS viewport listener because CSS media queries
guarantee mutual exclusivity at the 600px boundary (Requirement 4.6) without
re-render churn and without touching data flow.

### Badges (Requirements 3, 6, 7.5)

A shared `.badge` class renders a pill with a **visible text label plus** a
theme-derived color, so state is never conveyed by color alone:

- `.badge-success` → `--color-green` (access granted / proof validated / active)
- `.badge-danger` → `--color-red` (access revoked / proof rejected / inactive)
- `.badge-warning` → `--color-orange` (proof pending)
- `.badge-neutral` → `--text-muted` (no proof status)

The Admin_Console access label uses `t('admin.access_granted')` /
`t('admin.access_revoked')`; the status label uses the existing
`statusLabel()` helper (which already maps `null → t('admin.status_none')` and
`status → t('admin.status_<status>')`), so the "no proof" case renders a labeled
badge rather than an empty cell (Requirement 3.4). The Platform_Admin_Space
agency state pill and catalog active/inactive indicator reuse the same `.badge`
variants, giving a distinct theme color per state (Requirements 6.4, 6.5).

### Public form brand header (Requirement 11)

`BrandHeader` renders the OpaysFox brand identity (logo or brand name) inside a
header area positioned above the form fields, built only from existing
primitives/variables. `FormulaireCommande` keeps its existing pure validation
(`validateOrderForm`), upload, RPC submission, demo-mode short-circuit, and
invalid-link handling untouched (Requirement 11.8); the change is wrapping the
existing `.screen-header` + `.card` form in a mobile-first single-column shell
with the brand header on top and replacing residual inline literals with shared
classes (Requirements 11.1–11.3).

## Components and Interfaces

### `StandaloneAdminHeader` (new, `src/components/StandaloneAdminHeader.jsx`)

```jsx
// Props
{
  onBack: () => void,    // navigate to dashboard (/app)
  onLogout: () => void,  // perform logout flow
}
```

Renders:

```jsx
<div className="standalone-header">
  <button type="button" className="btn btn-outline standalone-header__back" onClick={onBack}>
    <ArrowLeft size={16} />
    <span>{t('nav.dashboard')}</span>
  </button>
  <button type="button" className="btn btn-outline standalone-header__logout" onClick={onLogout}>
    <LogOut size={16} />
    <span>{t('access.logout')}</span>
  </button>
</div>
```

Back control is first in DOM order, logout second (Requirements 1.1, 1.2). Both
spaces import this same component (Requirement 1.3). Labels resolve through the
shared keys `nav.dashboard` and `access.logout` (Requirements 1.4–1.6, 9.3 —
reusing existing keys).

### `AdminConsoleScreen` (new wrapper in `src/App.jsx`)

Mirrors `PlatformAdminScreen`. Provides `onBack = () => navigate('/app')` and
`onLogout = async () => { const r = await logOut(); if (r?.success) navigate('/login'); }`,
wraps `StandalonePage` (maxWidth 1080) → `StandaloneAdminHeader` → `<ConsoleAdmin />`.
The `/admin` route element swaps its current inline `StandalonePage` for
`AdminConsoleScreen` with the **same guards** (`PrivateRoute` → `AdminRoute`)
(Requirement 10).

### `PlatformAdminScreen` (modified, `src/App.jsx`)

Replaces the inline header `<div style={...}>…</div>` with
`<StandaloneAdminHeader onBack={() => navigate('/app')} onLogout={handleLogout} />`.
No change to `logOut`, navigation, or the guarded `EspaceAdminPlateforme`.

### `ConsoleAdmin` (modified, `src/pages/ConsoleAdmin.jsx`)

Presentational-only edits:

- Add a `.screen-desc` under the existing `.screen-title` so the header matches
  Platform_Admin_Space (Requirement 2.1).
- Replace the inline-styled `<table>`/cells with the `.admin-users` table +
  `data-label` attributes; keep `buildAdminPage`, `buildEntries`,
  `latestProofStatus`, pagination, `loadData`, `handleAccessChange`,
  `handleReview`, `selectProof` exactly as-is (Requirement 10).
- Render access state via `AccessBadge` markup (`.badge .badge-success|.badge-danger`
  with text) and status via `StatusBadge` markup using `statusLabel()`
  (Requirements 3.2–3.4).
- Loading, empty, and populated states remain mutually exclusive using the
  existing `loading` / `pageEntries.length` branches, with labels from
  `t('loading.data')` and `t('admin.empty')` (Requirement 5).
- Row actions stay `.btn .btn-outline` controls with accessible names; icon-only
  controls (receipt `FileText`) gain an `aria-label` from a new i18n key
  (Requirements 3.5, 7.4).

### `EspaceAdminPlateforme` (modified, `src/pages/EspaceAdminPlateforme.jsx`)

Presentational-only edits:

- Section headings (stats, agencies, catalogs) adopt one shared section-heading
  class so font-family/size/weight/line-height match across both spaces
  (Requirements 2.4, 6.6). Remove hardcoded `var(--deep-navy)` inline color in
  favor of a theme variable already used for headings.
- Agency state pill: replace the inline `style` (with `rgba(...)` literals) by
  `.badge .badge-success` / `.badge .badge-danger` (Requirement 6.4, removing
  hardcoded color literals per 2.6).
- Catalog active/inactive indicator uses `.badge-success` (`--color-green`) /
  `.badge-danger` (`--color-red`) (Requirement 6.5).
- `.stat-box`/`.stat-label`/`.stat-value` and `.ledger-*` structure preserved
  (Requirements 6.1, 6.2). Agency row field order identifier → owner → state →
  modules preserved (Requirement 6.3).
- No change to handlers, context calls, or the internal `isPlatformEditor`
  guard (Requirement 10).

### `FormulaireCommande` (modified, `src/pages/FormulaireCommande.jsx`)

Presentational-only edits:

- Wrap content in a mobile-first single-column shell (320–600px) using existing
  primitives; add `<BrandHeader />` above the `.screen-header`
  (Requirements 11.1, 11.3).
- Replace residual inline literals (font-size/color/spacing) on text nodes with
  shared classes/variables where practical (Requirement 11.2).
- Keep `validateOrderForm`, upload, `submit_remote_order` RPC, `INVALID_LINK_RPC_CODES`
  handling, demo-mode branch, success/`done` behavior, and invalid-link screen
  unchanged (Requirements 11.5–11.8).
- Inputs already use semantic `<label htmlFor>` + `.form-control`; ensure focus
  visibility via `:focus-visible` and ≥44×44px tap targets on all controls
  (Requirement 11.9).

### `BrandHeader` (new, `src/components/BrandHeader.jsx`)

```jsx
// Props
{
  title?: string,     // defaults to brand name via i18n/app.title
  subtitle?: string,  // optional tagline resolved via useT by the caller
}
```

Renders a `.brand-header` block (brand mark + brand name) using only existing
primitives and theme variables, positioned above form fields (Requirement 11.3).
Brand name reuses `t('app.title')`; no hardcoded literals (Requirement 11.4).

### Status message roles (Requirement 7.6)

Existing `alert` roles in `ConsoleAdmin`, `EspaceAdminPlateforme`, and
`FormulaireCommande` are preserved; success messages keep `role="status"`/`alert`
so assistive tech announces them without a focus change.

## Data Models

This feature introduces no persisted data and no domain models. The only new
"shapes" are presentational component props (in-memory, render-time):

```ts
// StandaloneAdminHeader props
type StandaloneAdminHeaderProps = {
  onBack: () => void;
  onLogout: () => void;
};

// BrandHeader props
type BrandHeaderProps = {
  title?: string;
  subtitle?: string;
};

// Badge variant (CSS class selection only)
type BadgeVariant = 'success' | 'danger' | 'warning' | 'neutral';
```

The users-list row data shape consumed by the presentation is the **existing**
entry object produced by `buildEntries` (unchanged):
`{ user_id, email, acces_autorise, latestProofAt, latestStatus, proofs }`.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all
valid executions of a system — essentially, a formal statement about what the
system should do. Properties serve as the bridge between human-readable
specifications and machine-verifiable correctness guarantees.*

This feature is mostly presentational (DOM structure, CSS, responsive layout,
accessibility wiring), which is best validated by example-based Testing Library
assertions and visual/Playwright checks rather than property-based tests. A
focused subset of criteria, however, expresses genuine universal statements over
a data domain (the i18n translation table; the finite set of access/status/agency
states; the public-form validation logic). Those are captured below as
property-based tests. Each runs a minimum of 100 iterations and is tagged with
its design property.

### Property 1: Every access/status state renders a non-empty text label

*For any* access boolean and *any* proof status value drawn from the supported
domain `{ null, "en_attente", "validee", "rejetee", and any unknown string }`,
the rendered Access_Badge / Status_Badge SHALL contain a non-empty, non-blank
text label (never an empty badge and never the raw status code), so the state is
distinguishable without relying on color alone.

**Validates: Requirements 3.2, 3.3, 3.4, 7.5**

### Property 2: Agency states map to distinct theme colors

*For any* two agency state values, the resolved state-pill badge variant (and its
underlying Theme_Variable color) SHALL be equal if and only if the two states are
equal — i.e. distinct states never share the same color, and equal states always
resolve to the same color.

**Validates: Requirements 6.4**

### Property 3: New i18n keys are defined and non-empty in both locales

*For any* newly introduced i18n_Key (admin spaces and public forms), the value
SHALL be defined and non-empty in *both* the `fr` and `en` locales of
`src/i18n.js`, with matching key presence across the two locales.

**Validates: Requirements 9.2, 11.4**

### Property 4: i18n resolution never leaks empty strings and surfaces missing keys

*For any* i18n_Key that is defined in the active locale, `useT`/`t` SHALL return a
non-empty value that is not the raw key string; and *for any* key that is not
defined in the active locale, `t` SHALL return the key string itself so the
missing translation is detectable.

**Validates: Requirements 9.4, 9.5**

### Property 5: Public form rejects incomplete submissions with no side effects

*For any* public-form input state in which at least one required field (customer
name, phone, details, or proof) is missing or blank, submitting SHALL reject the
submission, retain all entered values, surface an i18n-resolved validation
message identifying the affected field, and produce no side effects (no storage
upload and no `submit_remote_order` RPC call).

**Validates: Requirements 11.5**

## Error Handling

All error handling for the public form is **preserved from the existing
implementation** (Requirement 11.8); the design only ensures each state renders
through primitives/i18n. The states:

| State | Trigger | Behavior (unchanged logic) | UI | Requirement |
|-------|---------|----------------------------|-----|-------------|
| Invalid link | `decodeOrderLink`/`isWellFormedToken` fails | Render refusal card, no form | `.card` + `t('order_form.link_invalid')`, `role="alert"` | 11.x (preserved) |
| Missing/invalid field | `validateOrderForm` returns `!ok` | Reject, retain values, no upload/RPC | `.alert alert-info` + field-specific i18n message | 11.5 |
| Upload failure | storage `upload` error | Stop, retain values, keep form | `.alert alert-info` + `t('order_form.error_proof_required')` | 11.7 |
| Invalid/expired token at submit | RPC returns `INVALID_LINK_RPC_CODES` | Show link-invalid message, keep form | `.alert alert-info` + `t('order_form.link_invalid')` | 11.7 |
| Other RPC failure | RPC error | Keep form, retain values | `.alert alert-info` + i18n message | 11.7 |
| Success | RPC ok / demo mode | `done = true`, hide form | `.alert alert-success` + `t('order_form.success')`, `role="status"` | 11.6 |

Admin spaces keep their existing error handling: failed access/proof/agency/module/catalog
actions surface `t('admin.update_error')` / `t('platform_admin.error_*')` via an
`alert`-role message while preserving prior state (Requirements 7.6, 10.6) — no
change to handlers.

## Testing Strategy

Uses the existing **Vitest + @testing-library/react + fast-check** setup. No new
frameworks.

### Property-based tests (min. 100 iterations each)

Implemented with `fast-check`, one property-based test per design property, each
tagged:

- `// Feature: admin-ux-enhancement, Property 1: Every access/status state renders a non-empty text label`
  — generate access boolean + status from the domain (incl. `null` and arbitrary
  unknown strings); assert the badge text is non-empty and not the raw code.
- `// Feature: admin-ux-enhancement, Property 2: Agency states map to distinct theme colors`
  — generate pairs of agency states; assert variant/color equality iff state
  equality (injectivity over the state set).
- `// Feature: admin-ux-enhancement, Property 3: New i18n keys are defined and non-empty in both locales`
  — generate keys from the list of newly introduced keys; assert non-empty value
  present in both `fr` and `en` and that key sets match across locales.
- `// Feature: admin-ux-enhancement, Property 4: i18n resolution never leaks empty strings and surfaces missing keys`
  — generate defined keys (assert non-empty, ≠ key) and random undefined keys
  (assert returns the key string).
- `// Feature: admin-ux-enhancement, Property 5: Public form rejects incomplete submissions with no side effects`
  — generate form states with ≥1 missing/blank required field; render
  `FormulaireCommande` with mocked `supabase`; submit; assert rejection, retained
  values, an i18n message, and zero `storage.upload` / `rpc` calls.

### Example / unit tests (Testing Library)

- **Shared header (Req 1):** render `AdminConsoleScreen` and `PlatformAdminScreen`;
  assert each has exactly one back then one logout control, identical header
  markup, and labels equal to `t('nav.dashboard')` / `t('access.logout')`.
- **Screen headers & sections (Req 2):** assert one `.screen-header`/`.screen-title`/`.screen-desc`
  per space; primary sections wrapped in `.card`; shared section-heading class.
- **Users list structure (Req 3):** render with a representative user; assert
  email/access/status/actions present, column order, `.btn` actions with
  accessible names, and a labeled badge when no proof exists.
- **List states (Req 5):** three renders (loading, loaded-empty, loaded-with-users)
  asserting exactly one of indicator/empty/list is shown with i18n labels.
- **Platform structure (Req 6):** assert `.stat-box`/`.stat-label`/`.stat-value`,
  `.ledger-list`/`.ledger-item`/`.ledger-icon-box`, agency row field order, and
  catalog active→green / inactive→red badge variants.
- **Accessibility (Req 7):** tab to controls, press Enter/Space, assert handler
  parity with click; assert icon-only controls expose non-empty accessible names;
  assert `alert` role on status messages.
- **Buttons (Req 8):** assert primary controls carry `.btn .btn-primary`,
  secondary/destructive carry `.btn .btn-outline`, accents from red/green vars.
- **Public form branches (Req 11.3/11.6/11.7):** assert BrandHeader present above
  fields; mock success → success message + form removed; mock RPC failure →
  failure message + values retained + form present.
- **Behavior preservation (Req 10, 11.8):** regression tests asserting the same
  Supabase calls/handlers fire with identical arguments after the markup change;
  rely on existing pure-utility tests (`adminActions`, `agencyStats`, `catalogs`,
  `orderToken`) which are unchanged.

### Visual / responsive checks (Playwright, existing skill)

CSS-driven layout cannot be verified in jsdom, so Requirements 4.1–4.6, 4.x
overflow, 11.1, and 11.9 tap-target sizing are verified with the existing
Playwright CLI skill at boundary widths (e.g. 320px, 375px, 599px, 601px):
assert no horizontal scrollbar, stacked labeled cards ≤600px, tabular >600px,
exactly one layout per width, and ≥44×44px controls.

### Test data and configuration

- Property tests: `fc.assert(fc.property(...), { numRuns: 100 })` minimum.
- Mock `supabase` (and demo-mode `null` client) to keep tests pure and offline.
- No changes to business-logic utilities or their existing tests.
