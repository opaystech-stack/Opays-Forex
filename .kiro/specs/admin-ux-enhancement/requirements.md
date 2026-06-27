# Requirements Document

## Introduction

This feature visually improves and harmonizes the design of the application's two
administration spaces — the paid-access admin console (`/admin` →
`ConsoleAdmin`) and the platform super-admin space (`/admin-plateforme` →
`EspaceAdminPlateforme`, wrapped by `PlatformAdminScreen`) — and aligns them
with the existing standalone-page visual language so both feel polished,
consistent, and accessible.

In addition, this feature raises the public, client-facing forms sent to external
customers via WhatsApp (for example the remote order form at `/commande/:lien` →
`FormulaireCommande`, marketing campaign pages, and similar public service pages)
to the same level of visual quality. Because these pages are seen directly by
external clients and are typically opened on a phone, they must be mobile-first,
fluid, professional, and on-brand.

This is a purely presentational/UX enhancement. It builds on top of the
`admin-design-fix` bugfix spec, which already corrected the functional/contrast
defects (wrapping `/admin` `ConsoleAdmin` in `StandalonePage` and making the
platform-admin guard honor `?debug_force_demo`). This spec does NOT change
business logic, data flows, permissions/RLS, routing, or access guards.

The work reuses the shared design primitives already defined in `src/index.css`
(for example `.standalone-page`, `.card`, `.screen-header`, `.btn`, `.form-*`,
`.ledger-*`, `.stat-box`, `.alert*`) and the existing theme variables rather
than introducing parallel styling. All new visible strings use i18n keys via
`useT` (`src/i18n.js`).

### Non-Goals (Out of Scope)

- No change to business logic, data fetching, or state management.
- No change to permissions, role guards, RLS, or route definitions.
- No change to the functional behavior already covered by `admin-design-fix`.
- No new design system or parallel CSS framework; only reuse/extension of
  existing primitives and theme variables.

## Glossary

- **Admin_Console**: The paid-access administration page rendered at `/admin`
  by `src/pages/ConsoleAdmin.jsx`.
- **Platform_Admin_Space**: The platform super-admin page rendered at
  `/admin-plateforme` by `src/pages/EspaceAdminPlateforme.jsx`, wrapped by the
  `PlatformAdminScreen` container in `App.jsx`.
- **Admin_Space**: Either Admin_Console or Platform_Admin_Space.
- **Standalone_Header**: The shared header pattern containing a back-to-dashboard
  control and a logout control, as currently provided by `PlatformAdminScreen`.
- **Standalone_Container**: The `.standalone-page` / `.standalone-page__inner`
  layout wrapper that applies the light theme, centered column, and safe padding.
- **Design_Primitive**: An existing shared CSS class in `src/index.css` (for
  example `.card`, `.screen-header`, `.btn`, `.form-*`, `.ledger-*`,
  `.stat-box`, `.alert*`).
- **Theme_Variable**: An existing CSS custom property (for example
  `--text-primary`, `--text-secondary`, `--text-muted`, `--border-color`,
  `--card-bg`, `--primary-blue`, `--color-primary`, `--color-green`,
  `--color-red`, `--color-orange`).
- **Users_Table**: The paginated list of users in Admin_Console showing email,
  access, status, and actions.
- **Status_Badge**: A visual indicator of a payment-proof status (none, pending,
  validated, rejected) in Admin_Console.
- **Access_Badge**: A visual indicator of whether a user's access is granted or
  revoked in Admin_Console.
- **Narrow_Viewport**: A viewport whose width is at most 600 CSS pixels.
- **i18n_Key**: A translation key resolved through `useT` from `src/i18n.js`.
- **Public_Form**: A client-facing page sent to external customers (not
  authenticated app users), for example the remote order form at `/commande/:lien`
  (`src/pages/FormulaireCommande.jsx`), marketing campaign pages, and similar
  public service pages, typically opened from a WhatsApp message on a mobile
  phone.

## Requirements

### Requirement 1: Shared header across both admin spaces

**User Story:** As an administrator, I want both administration spaces to present
the same header with navigation and logout, so that the experience feels
consistent regardless of which space I am in.

#### Acceptance Criteria

1. THE Admin_Console SHALL render a Standalone_Header that contains exactly one
   back-to-dashboard control and exactly one logout control, with the
   back-to-dashboard control positioned before the logout control in DOM order.
2. THE Platform_Admin_Space SHALL render a Standalone_Header that contains
   exactly one back-to-dashboard control and exactly one logout control, with
   the back-to-dashboard control positioned before the logout control in DOM
   order.
3. THE Admin_Console Standalone_Header SHALL apply the identical set of
   Design_Primitive CSS class names and the identical DOM element hierarchy and
   control ordering as the Platform_Admin_Space Standalone_Header.
4. WHERE a text label is displayed in either Admin_Space Standalone_Header, THE
   Admin_Space SHALL resolve that label through an i18n_Key rather than a
   hardcoded string literal.
5. THE Admin_Console back-to-dashboard control SHALL resolve its label through
   the same i18n_Key that the Platform_Admin_Space back-to-dashboard control
   resolves its label through.
6. THE Admin_Console logout control SHALL resolve its label through the same
   i18n_Key that the Platform_Admin_Space logout control resolves its label
   through.

### Requirement 2: Consistent screen header and section styling

**User Story:** As an administrator, I want titles, descriptions, cards, and
section headers to look the same across both admin spaces, so that the visual
hierarchy is clear and uniform.

#### Acceptance Criteria

1. WHEN the Admin_Console screen header is rendered, THE Admin_Console SHALL
   present exactly one `.screen-header` containing exactly one `.screen-title`
   and exactly one `.screen-desc` Design_Primitive.
2. WHEN the Platform_Admin_Space screen header is rendered, THE
   Platform_Admin_Space SHALL present exactly one `.screen-header` containing
   exactly one `.screen-title` and exactly one `.screen-desc` Design_Primitive.
3. THE Admin_Space SHALL render each primary content section (a top-level
   grouping of related controls or data below the header) inside a `.card`
   Design_Primitive.
4. THE Admin_Space SHALL render every section heading using a single shared
   section-heading style whose resolved font-family, font-size, font-weight, and
   line-height are identical across both admin spaces.
5. WHERE a section heading is displayed, THE Admin_Space SHALL apply a
   typography hierarchy in which the resolved font-size of the screen title is
   greater than that of a section heading, and the resolved font-size of a
   section heading is greater than that of body text.
6. THE Admin_Space SHALL set text, border, and surface colors only through
   Theme_Variables and SHALL NOT use any hardcoded color literal (hex, rgb,
   rgba, hsl, or named color).

### Requirement 3: Improved users table presentation in Admin_Console

**User Story:** As a paid-access administrator, I want the users list to be clear
and readable, so that I can scan email, access, status, and actions quickly.

#### Acceptance Criteria

1. WHEN the Admin_Console renders the users table, THE Admin_Console SHALL
   display, for each user row, the user's email, access state, latest proof
   status, and available actions.
2. WHEN the Admin_Console renders a user's access state, THE Admin_Console SHALL
   render it as an Access_Badge whose background or text color is set from a
   Theme_Variable and SHALL include a visible text label naming the access state
   so the state is distinguishable without relying on color alone.
3. WHEN the Admin_Console renders a user's latest proof status, THE Admin_Console
   SHALL render it as a Status_Badge whose background or text color is set from a
   Theme_Variable and SHALL include a visible text label naming the status so
   the status is distinguishable without relying on color alone.
4. IF a user has no latest proof status available, THEN THE Admin_Console SHALL
   render the Status_Badge with a text label indicating that no proof status
   exists rather than rendering an empty or blank badge.
5. WHEN the Admin_Console renders each row action, THE Admin_Console SHALL render
   it as a `.btn` Design_Primitive that has either visible text or an accessible
   name resolvable by assistive technology.
6. THE Admin_Console SHALL order the users table columns left to right as email,
   access, status, then actions.
7. IF the users list contains zero users, THEN THE Admin_Console SHALL display a
   visible message indicating that no users are present instead of an empty
   table body.

### Requirement 4: Responsive layout for Admin_Console users list

**User Story:** As an administrator on a phone, I want the users list to remain
usable on a small screen, so that I can manage access without horizontal
scrolling.

#### Acceptance Criteria

1. WHILE the viewport width is less than or equal to 600 CSS pixels
   (Narrow_Viewport), THE Admin_Console SHALL display each user's email, access,
   status, and actions fields fully within the viewport width such that the
   document body produces no horizontal scrollbar and no field content is
   clipped or overflows beyond the right viewport edge.
2. WHILE the viewport width is greater than 600 CSS pixels, THE Admin_Console
   SHALL present the users list in a tabular layout with one row per user and
   one column per field (email, access, status, actions).
3. WHILE the viewport width is less than or equal to 600 CSS pixels
   (Narrow_Viewport), THE Admin_Console SHALL present each user as a vertically
   stacked card-style row in which the email, access, status, and actions fields
   are arranged top-to-bottom, and each of the email, access, and status fields
   is preceded by a visible text label identifying that field.
4. WHILE the viewport width is greater than 600 CSS pixels, THE Admin_Console
   SHALL render every row action as a control that is visible within the
   viewport without horizontal scrolling and is activatable via pointer click
   and keyboard activation.
5. WHILE the viewport width is less than or equal to 600 CSS pixels
   (Narrow_Viewport), THE Admin_Console SHALL render every row action as a
   control that is visible within the viewport without horizontal scrolling and
   is activatable via pointer tap and keyboard activation.
6. WHEN the viewport width crosses 600 CSS pixels in either direction, THE
   Admin_Console SHALL switch between the tabular layout and the stacked
   card-style layout so that exactly one of the two layouts is displayed at any
   given time.

### Requirement 5: Empty and loading states in Admin_Console

**User Story:** As an administrator, I want clear feedback while the users list
loads or when it is empty, so that I understand the current state.

#### Acceptance Criteria

1. WHILE the Admin_Console is loading the users list, THE Admin_Console SHALL
   display a loading indicator labeled with text resolved from an i18n_Key,
   shown in place of the users list and not simultaneously with the users list
   or the empty-state message.
2. IF the users list load completes successfully and returns zero users, THEN
   THE Admin_Console SHALL display an empty-state message resolved from an
   i18n_Key, shown in place of the users list and not simultaneously with the
   loading indicator.
3. WHEN the users list load completes successfully and returns one or more
   users, THE Admin_Console SHALL hide the loading indicator and the empty-state
   message and display the users list.
4. THE Admin_Console SHALL style the loading indicator using only existing
   Design_Primitives and Theme_Variables, without introducing new color,
   spacing, or typography values.
5. THE Admin_Console SHALL style the empty-state message using only existing
   Design_Primitives and Theme_Variables, without introducing new color,
   spacing, or typography values.

### Requirement 6: Polished visual hierarchy in Platform_Admin_Space

**User Story:** As a platform super-administrator, I want the stats, agency rows,
and catalog lists to be visually tidy and consistent, so that the space reads as
polished.

#### Acceptance Criteria

1. THE Platform_Admin_Space SHALL render each agency statistic as a `.stat-box`
   Design_Primitive that contains exactly one `.stat-label` element and exactly
   one `.stat-value` element.
2. THE Platform_Admin_Space SHALL render each catalog list as a `.ledger-list`
   Design_Primitive in which every list entry is a `.ledger-item`
   Design_Primitive that contains one `.ledger-icon-box` Design_Primitive.
3. THE Platform_Admin_Space SHALL render every agency row using the same field
   order — identifier, then owner, then state pill, then module controls — and
   the same Design_Primitive layout structure across all agency rows.
4. THE Platform_Admin_Space SHALL render the agency state pill with an accent or
   background color derived from a Theme_Variable, using a distinct
   Theme_Variable color for each agency state such that no two distinct states
   share the same color.
5. THE Platform_Admin_Space SHALL render the catalog status indicator with a
   color derived from the `--color-green` Theme_Variable when the catalog entry
   is active and from the `--color-red` Theme_Variable when the catalog entry is
   inactive.
6. THE Platform_Admin_Space SHALL apply the shared section-heading style defined
   in Requirement 2 (criterion 4) to its statistics, agencies, and catalog
   section headings.

### Requirement 7: Accessibility of admin controls

**User Story:** As an administrator using a keyboard or assistive technology, I
want admin controls to be operable and perceivable, so that I can complete admin
tasks without a mouse.

#### Acceptance Criteria

1. THE Admin_Space SHALL render each interactive admin control (buttons, links,
   toggles, form inputs, and menu items) as a semantic, natively focusable
   element that is reachable through sequential keyboard navigation in DOM
   order.
2. WHEN an interactive control receives keyboard focus, THE Admin_Space SHALL
   activate the action associated with that control upon an Enter or Space key
   press, producing the same result as a pointer activation.
3. WHILE an interactive control has keyboard focus, THE Admin_Space SHALL
   display a visible focus indicator using the existing `:focus-visible`
   Design_Primitive, and SHALL remove that indicator when the control loses
   focus.
4. WHERE an interactive control communicates meaning through an icon only, THE
   Admin_Space SHALL provide an accessible name resolved from an i18n_Key in the
   active locale.
5. THE Admin_Space SHALL convey each control's status and access state (at
   minimum: enabled, disabled, and restricted) through visible text or an
   accessible name in addition to color, so that the state is determinable
   without relying on color perception.
6. WHEN a status message is displayed, THE Admin_Space SHALL associate the
   message with an `alert` role so that assistive technology announces it
   without requiring a change of keyboard focus.

### Requirement 8: Consistent action button styling

**User Story:** As an administrator, I want action buttons to look and behave
consistently across both admin spaces, so that primary and secondary actions are
easy to distinguish.

#### Acceptance Criteria

1. THE Admin_Space SHALL apply both the `.btn` and `.btn-primary`
   Design_Primitives to every control that confirms, submits, or initiates the
   primary operation of a view, and SHALL NOT apply button background or border
   colors sourced from anything other than those Design_Primitives and the
   defined Theme_Variables.
2. THE Admin_Space SHALL apply both the `.btn` and `.btn-outline`
   Design_Primitives to every control that cancels, dismisses, or performs a
   secondary or destructive-intent operation.
3. WHERE a control communicates a destructive or negative outcome, THE
   Admin_Space SHALL derive its accent color solely from the `--color-red`
   Theme_Variable.
4. WHERE a control communicates a positive or confirming outcome, THE
   Admin_Space SHALL derive its accent color solely from the `--color-green`
   Theme_Variable.
5. WHEN a primary or secondary action button enters a hover or focus-visible
   state, THE Admin_Space SHALL render that state using only the styles defined
   by the `.btn`, `.btn-primary`, and `.btn-outline` Design_Primitives.

### Requirement 9: Internationalization of new visible strings

**User Story:** As a user in any supported language, I want all admin text to be
translated, so that the admin spaces read correctly in my language.

#### Acceptance Criteria

1. WHERE the enhancement renders a new visible string (including labels,
   headings, button text, placeholder text, and aria-label text) in an
   Admin_Space, THE Admin_Space SHALL resolve that string through an i18n_Key and
   SHALL NOT render a hardcoded text literal.
2. THE Admin_Space SHALL define a non-empty value for each newly introduced
   i18n_Key in every locale present in `src/i18n.js`, which are exactly the
   French (`fr`) and English (`en`) locales.
3. WHEN the enhancement introduces a visible string whose meaning and displayed
   wording are identical to those of an already-defined i18n_Key, THE Admin_Space
   SHALL reuse that existing i18n_Key instead of defining a new one.
4. WHILE a supported locale is active, THE Admin_Space SHALL display the
   locale-specific value for every rendered i18n_Key and SHALL NOT display the
   raw i18n_Key string or an empty string.
5. IF a rendered i18n_Key has no defined value for the active locale, THEN THE
   Admin_Space SHALL fall back to displaying the i18n_Key string so that the
   missing translation is detectable.

### Requirement 10: Preservation of existing behavior

**User Story:** As a product owner, I want the visual enhancement to leave
behavior unchanged, so that no functional regressions are introduced.

#### Acceptance Criteria

1. WHILE the visual enhancement is applied, THE Admin_Space SHALL load the same
   data sets, in the same order, and with the same filtering and pagination
   results as the pre-enhancement baseline, with no change to the number,
   content, or sequence of data-loading requests for an identical user session
   and inputs.
2. WHILE the visual enhancement is applied, THE Admin_Space SHALL apply the same
   access guards and role checks as the pre-enhancement baseline, granting
   access to authorized roles and denying access to unauthorized roles with the
   identical pass/deny outcome for each role.
3. IF an unauthorized user attempts to access an Admin_Space view, THEN THE
   Admin_Space SHALL deny access and produce the same denial outcome
   (redirection or error indication) as the pre-enhancement baseline.
4. WHEN a user navigates to `/admin` or `/admin-plateforme`, THE Admin_Space
   SHALL resolve each route to the same destination view and the same
   route-guard outcome as the pre-enhancement baseline.
5. WHEN a user performs any of the actions access activation, proof review,
   agency state change, module grant, module revoke, or catalog management, THE
   Admin_Space SHALL produce the same resulting system state and the same
   observable outcome (success or failure indication) as the pre-enhancement
   baseline for identical inputs.
6. IF any of the actions access activation, proof review, agency state change,
   module grant, module revoke, or catalog management fails, THEN THE Admin_Space
   SHALL produce the same failure outcome, the same error indication, and the
   same preserved-or-rolled-back data state as the pre-enhancement baseline.

### Requirement 11: Polished, mobile-first design for public client-facing forms

**User Story:** As an external customer who opens a link from WhatsApp on my
phone, I want the public form to look professional, branded, and effortless to
use, so that I trust the business and can complete it quickly.

#### Acceptance Criteria

1. WHEN a Public_Form is rendered on a Narrow_Viewport at any width from 320 to
   600 CSS pixels, THE Public_Form SHALL present its content in a single-column,
   mobile-first layout with no horizontal scrolling and no content clipped beyond
   the viewport edges.
2. THE Public_Form SHALL render every surface, typography element, and
   interactive control using existing Design_Primitives and Theme_Variables, and
   SHALL NOT introduce new CSS class definitions or inline color, font-size, or
   spacing literals for these elements.
3. WHEN a Public_Form loads, THE Public_Form SHALL display brand identity (logo
   or brand name) within a header area positioned above the form fields.
4. THE Public_Form SHALL render every visible text string from an i18n_Key
   resolved through `useT`, with no hardcoded display literals, in both the `fr`
   and `en` locales.
5. IF a Public_Form is submitted with any required field missing or invalid,
   THEN THE Public_Form SHALL reject the submission, retain all entered values,
   and display an i18n-resolved validation message identifying the affected
   field, with no side effects.
6. WHEN a Public_Form submission completes successfully, THE Public_Form SHALL
   display an i18n-resolved success confirmation and remove the input form from
   view.
7. IF a Public_Form submission fails after being sent, THEN THE Public_Form SHALL
   display an i18n-resolved failure message, retain all entered values, and keep
   the form available for resubmission.
8. THE Public_Form SHALL preserve its existing submission behavior, data
   handling, and routing.
9. THE Public_Form SHALL render each interactive control as a semantic element
   with an associated label, operable by keyboard, with a visible focus
   indicator, and with a tap target of at least 44 by 44 CSS pixels.
