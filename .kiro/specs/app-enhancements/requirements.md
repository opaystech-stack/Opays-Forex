# Requirements Document

## Introduction

This feature bundles a set of enhancements to the OpaysFox forex/treasury tracking PWA (React + Vite + Supabase). The enhancements cover six areas: enforcing SaaS-style navigation that keeps authenticated users inside the application, expanding and centralizing currency support, adding a debt-tracking module for receivables and payables, fixing button text contrast for accessibility, stabilizing the mobile layout (no jitter, fixed bottom navigation), and adding a gains (profit) tracking module that surfaces daily and monthly profit. All work must remain compatible with the existing React / Vite / Vercel / Supabase stack and architecture.

The application already exposes a `profit_usd` field on every transaction, route guards (`PublicOnlyRoute` / `PrivateRoute`) in `src/App.jsx`, a tab-based authenticated shell, and a `convertToUSD` helper in `src/utils/finance.js`. These existing building blocks are referenced where relevant.

## Glossary

- **OpaysFox**: The React + Vite PWA for forex/treasury tracking, backed by Supabase. Referred to as "the Application".
- **Application**: The authenticated single-page application shell rendered at `/app` and its features (Dashboard, Transactions, Wallets, Expenses, Loans, Settings, and new modules).
- **Landing_Page**: The public marketing/home page rendered at route `/` by `src/pages/Home.jsx`.
- **Route_Guard**: The routing protection logic in `src/App.jsx` comprising `PublicOnlyRoute` (redirects authenticated users away from public/auth routes) and `PrivateRoute` (redirects unauthenticated users to `/login`).
- **Authenticated_User**: A user with a valid Supabase session, or a demo user, recognized by the `user` value in `AppContext`.
- **Currency_Registry**: A single centralized source of truth that lists all supported currencies and their display metadata, used by every currency selector in the Application.
- **Supported_Currency**: A currency present in the Currency_Registry. The initial set is USD, UGX, KES, TZS, BIF, CDF, EUR, and FCFA (CFA Franc).
- **Currency_Selector**: Any UI control in the Application that lets a user choose a currency (for example wallet creation, transactions, debt entries, rate settings).
- **Debt_Manager**: The new module that records receivables ("what others owe you") and payables ("what you owe others").
- **Receivable**: A debt record representing money owed to the user by a third party.
- **Payable**: A debt record representing money the user owes to a third party.
- **Debt_Entry_Button**: The dedicated control that opens the Debt_Manager creation flow.
- **Settings_Button**: The existing settings control (`settings-fab`) rendered in the application header.
- **Bottom_Navigation**: The mobile tab navigation bar rendered by `src/components/Navbar.jsx` (`mobile-navbar`).
- **Gains_Tracker**: The new module/indicator that aggregates transaction `profit_usd` values into daily and monthly gain figures.
- **Daily_Gain**: The sum of `profit_usd` for completed transactions whose timestamp falls within the current calendar day.
- **Monthly_Gain**: The sum of `profit_usd` for completed transactions whose timestamp falls within the selected calendar month (defaulting to the current month).
- **WCAG_AA_Contrast**: A text contrast ratio of at least 4.5:1 for normal text and at least 3:1 for large text, per WCAG 2.1 Level AA.

## Requirements

### Requirement 1: Keep authenticated users inside the application (SaaS navigation)

**User Story:** As an authenticated user, I want the marketing landing page to be unavailable to me, so that I stay inside the working application instead of being sent back to a public page.

#### Acceptance Criteria

1. WHILE a user is an Authenticated_User, WHEN the user navigates to the Landing_Page route `/`, THE Route_Guard SHALL redirect the user to the application route `/app`.
2. WHILE a user is an Authenticated_User, WHEN the user navigates to the public authentication routes `/login` or `/register`, THE Route_Guard SHALL redirect the user to the application route `/app`.
3. IF a user is not an Authenticated_User, WHEN the user navigates to the application route `/app`, THEN THE Route_Guard SHALL redirect the user to `/login`.
4. WHILE a user is an Authenticated_User, WHEN the user requests an unknown route, THE Route_Guard SHALL redirect the user to a route that resolves inside the Application.
5. WHEN an Authenticated_User signs out, THE Application SHALL allow navigation to the Landing_Page route `/`.

### Requirement 2: Centralized currency management with all currencies always selectable

**User Story:** As a forex operator, I want every supported currency available in every currency selector, so that I can record any transaction or balance without the app blocking my choice.

#### Acceptance Criteria

1. THE Currency_Registry SHALL define the following Supported_Currencies: USD, UGX, KES, TZS, BIF, CDF, EUR, and FCFA.
2. THE Currency_Registry SHALL store, for each Supported_Currency, a currency code and a human-readable display label.
3. WHEN a Currency_Selector is rendered, THE Application SHALL list every Supported_Currency from the Currency_Registry.
4. THE Application SHALL allow selection of any Supported_Currency in every Currency_Selector without disabling, hiding, or otherwise preventing selection of any Supported_Currency.
5. WHEN an amount is displayed in a Supported_Currency, THE Application SHALL format the amount using that currency's display metadata from the Currency_Registry.
6. WHEN a monetary value is converted to USD for a Supported_Currency, THE Application SHALL use the exchange rate associated with that currency.
7. WHERE a Supported_Currency has no configured exchange rate, THE Application SHALL still offer that currency for selection in every Currency_Selector.
8. WHEN a new Supported_Currency is added to the Currency_Registry, THE Application SHALL make that currency available in every Currency_Selector without requiring changes to individual selector components.

### Requirement 3: Debt management for receivables and payables

**User Story:** As a business owner, I want to record what others owe me and what I owe others, so that I can track outstanding debts in one place.

#### Acceptance Criteria

1. THE Debt_Manager SHALL allow a user to create a Receivable that records a counterparty name, an amount, a Supported_Currency, and an optional note.
2. THE Debt_Manager SHALL allow a user to create a Payable that records a counterparty name, an amount, a Supported_Currency, and an optional note.
3. THE Debt_Manager SHALL display Receivables and Payables as distinguishable groups.
4. WHEN a user opens the Debt_Manager creation flow, THE Application SHALL present a Currency_Selector that lists every Supported_Currency.
5. THE Application SHALL provide a dedicated Debt_Entry_Button that opens the Debt_Manager creation flow.
6. WHILE the viewport is in a mobile layout, THE Application SHALL place the Debt_Entry_Button at the top-right of the application header, adjacent to the Settings_Button.
7. WHEN a user marks a Receivable or Payable as settled, THE Debt_Manager SHALL record the settled state and reflect the change in the displayed groups.
8. IF a user submits a debt entry with a missing counterparty name or a non-positive amount, THEN THE Debt_Manager SHALL reject the entry and display a validation message.
9. WHILE the Application is using Supabase-backed data, THE Debt_Manager SHALL persist debt entries to Supabase; WHILE the Application is using mock data, THE Debt_Manager SHALL persist debt entries to local storage consistent with existing mock-data behavior.

### Requirement 4: Legible button text contrast

**User Story:** As a user, I want all button labels to be clearly readable, so that I can use the app comfortably including in its inactive states.

#### Acceptance Criteria

1. THE Application SHALL render text of every active button at a contrast ratio that meets WCAG_AA_Contrast against the button background.
2. THE Application SHALL render text of every inactive button at a contrast ratio that meets WCAG_AA_Contrast against the button background.
3. THE Application SHALL render text of every disabled button at a contrast ratio that meets WCAG_AA_Contrast against the button background.
4. THE Application SHALL apply a consistent button styling system across pages so that buttons of the same role share the same visual treatment.

### Requirement 5: Stable mobile layout and fixed bottom navigation

**User Story:** As a mobile user, I want the interface to stay still while I type and scroll, so that I can interact without elements jumping or shifting.

#### Acceptance Criteria

1. WHILE the viewport is in a mobile layout, THE Application SHALL keep the Bottom_Navigation fixed to the bottom of the viewport during scrolling.
2. WHILE the on-screen keyboard is displayed on a mobile device, THE Application SHALL keep page layout elements in their positions without displacing or resizing unrelated content.
3. WHILE a user scrolls within any page, THE Application SHALL keep the Bottom_Navigation visible and in a fixed position.
4. WHEN page content exceeds the viewport height, THE Application SHALL provide scrolling of the content area without overlapping the Bottom_Navigation.

### Requirement 6: Gains (profit) tracking

**User Story:** As a forex operator, I want to see my daily and monthly profit, so that I can monitor business performance at a glance.

#### Acceptance Criteria

1. THE Gains_Tracker SHALL compute Daily_Gain as the sum of `profit_usd` over completed transactions whose timestamp falls within the current calendar day.
2. THE Gains_Tracker SHALL compute Monthly_Gain as the sum of `profit_usd` over completed transactions whose timestamp falls within the selected calendar month.
3. WHEN no month is selected, THE Gains_Tracker SHALL use the current calendar month as the selected month for Monthly_Gain.
4. THE Application SHALL display the Daily_Gain and Monthly_Gain in an accessible location reachable from the Dashboard or a dedicated tab.
5. WHEN the underlying transaction data changes, THE Gains_Tracker SHALL recompute Daily_Gain and Monthly_Gain from the current transaction set.
6. WHERE no completed transactions exist within the relevant period, THE Gains_Tracker SHALL display a gain value of zero.
7. THE Gains_Tracker SHALL exclude draft transactions from Daily_Gain and Monthly_Gain calculations.

### Requirement 7: Compatibility with the existing stack and architecture

**User Story:** As a maintainer, I want the enhancements to fit the current architecture, so that the codebase stays clean, maintainable, and deployable on the existing platform.

#### Acceptance Criteria

1. THE Application SHALL implement these enhancements using the existing React, Vite, and Supabase stack without introducing an incompatible framework.
2. THE Application SHALL keep forex and business calculation logic in `src/utils/finance.js` and update `src/utils/finance.test.js` when that logic changes.
3. THE Application SHALL preserve the existing page and component structure under `src/pages/` and `src/components/`, extending existing modules rather than adding parallel implementations of the same function.
4. WHEN data access is required for a new feature, THE Application SHALL route it through the existing `AppContext` data layer and its Supabase/mock-data fallback pattern.
5. THE Application SHALL remain deployable on the existing Vercel configuration without changes that break the current build.
