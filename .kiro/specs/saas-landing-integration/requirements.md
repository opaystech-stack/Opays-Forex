# Requirements Document

## Introduction

This feature finalizes the transformation of the OpaysFox forex/treasury tracking PWA (React 19 + Vite 8 + Tailwind v4, JSX) into a SaaS product. The work has three connected goals:

1. Make the public landing page (the "SAS-style" marketing page already ported into `src/sections/`) the cohesive, complete entry point for unauthenticated visitors.
2. Connect the existing sign in and sign up forms to real Supabase authentication through `AppContext`, replacing the current simulated `setTimeout` behavior, with proper validation, error handling, loading states, and redirect to the authenticated dashboard on success.
3. Salvage any still-needed files from the duplicate standalone design source folder (`Kimi_Agent_SAS Front‑End & Tarifs/`) into the main app, then safely and completely remove that duplicate folder.

All work follows the project's AGENTS.md rules: small focused changes matching the existing React/Vite structure, reuse of existing utilities and components (notably the `signIn`, `signUp`, and `signInWithGoogle` functions already exposed by `AppContext`) rather than parallel implementations, and updating `docs/` when user-visible behavior changes. The authenticated application (Dashboard, Transactions, Wallets, Expenses, Loans, Settings, PWA/service worker) must continue to behave exactly as before.

## Glossary

- **Main_App**: The primary OpaysFox application rooted at the workspace root (`src/`, Vite 8, Tailwind v4, JSX), the only application that ships to production.
- **Duplicate_Folder**: The standalone original design source located at `Kimi_Agent_SAS Front‑End & Tarifs/` (Vite 7, Tailwind v3, shadcn/ui, react-hook-form, zod, TSX). It is to be removed after salvage.
- **Landing_Page**: The public marketing page rendered by `src/pages/Home.jsx`, composed of the `Hero`, `Features`, `Pricing`, `CTA`, and `Footer` sections in `src/sections/`.
- **Auth_Page**: The authentication screen rendered by `src/pages/Auth.jsx`, which displays the `SignIn` or `SignUp` form based on the `auth` URL parameter.
- **SignIn_Form**: The sign in form component in `src/pages/SignIn.jsx`.
- **SignUp_Form**: The sign up form component in `src/pages/SignUp.jsx`.
- **App_Context**: The application state and authentication provider in `src/context/AppContext.jsx`, which exposes `signIn`, `signUp`, `signInWithGoogle`, `logOut`, `user`, and `loading`.
- **Auth_Service**: The Supabase-backed authentication functions in `App_Context` that wrap `src/services/supabase.js`.
- **Dashboard**: The default authenticated view shown after successful authentication, rendered through the tab navigation in `src/App.jsx`.
- **Visitor**: An unauthenticated person browsing the Main_App.
- **Auth_Result**: The object returned by `Auth_Service` functions, of shape `{ success: boolean, data?, error?: string }`.
- **Salvage_Asset**: A file in the Duplicate_Folder identified as still needed by the Main_App, specifically `public/logo-opays.png`, `public/hero-dashboard.jpg`, and any form-validation logic deemed worth porting.

## Requirements

### Requirement 1: Public landing page as the unauthenticated entry point

**User Story:** As a Visitor, I want to land on a complete marketing page when I open the app without being logged in, so that I understand the product before deciding to sign up or sign in.

#### Acceptance Criteria

1. WHILE no authenticated user session exists AND no `auth` URL parameter is present, THE Main_App SHALL render the Landing_Page as the entry view.
2. THE Landing_Page SHALL render the Hero, Features, Pricing, CTA, and Footer sections in that order.
3. WHEN a Visitor activates a sign-in call-to-action on the Landing_Page, THE Main_App SHALL navigate to the Auth_Page with the `auth` URL parameter set to `signin`.
4. WHEN a Visitor activates a sign-up call-to-action on the Landing_Page, THE Main_App SHALL navigate to the Auth_Page with the `auth` URL parameter set to `signup`.
5. WHILE an authenticated user session exists, THE Main_App SHALL render the Dashboard instead of the Landing_Page.

### Requirement 2: Landing page visual cohesion with the design system

**User Story:** As a Visitor, I want the landing page to look polished and consistent, so that I trust the product.

#### Acceptance Criteria

1. THE Landing_Page SHALL render every section using the Main_App design system, composed of Tailwind v4 utilities and the existing custom CSS classes.
2. THE Landing_Page SHALL display the OpaysFox brand logo asset referenced at the path `/logo-opays.png`.
3. WHERE a section references the hero illustration, THE Landing_Page SHALL load the asset referenced at the path `/hero-dashboard.jpg`.
4. WHEN the Landing_Page is rendered at a viewport width of 375 pixels and at a viewport width of 1440 pixels, THE Landing_Page SHALL display all sections without horizontal overflow.
5. IF a referenced image asset fails to load, THEN THE Landing_Page SHALL render its descriptive alternative text.

### Requirement 3: Sign in connected to real authentication

**User Story:** As a registered user, I want to sign in with my real credentials, so that I can access my dashboard and data.

#### Acceptance Criteria

1. WHEN a user submits the SignIn_Form with an email and a password, THE SignIn_Form SHALL call the `signIn` function exposed by App_Context with the entered email and password.
2. WHILE the `signIn` call is in progress, THE SignIn_Form SHALL display a loading indicator and SHALL disable the submit control.
3. WHEN the Auth_Result from `signIn` has `success` equal to true, THE Main_App SHALL render the Dashboard.
4. IF the Auth_Result from `signIn` has `success` equal to false, THEN THE SignIn_Form SHALL display the returned error message and SHALL re-enable the submit control.
5. IF the submitted email is not a syntactically valid email address, THEN THE SignIn_Form SHALL display a validation message and SHALL NOT call the `signIn` function.
6. IF the password field is empty when the SignIn_Form is submitted, THEN THE SignIn_Form SHALL display a validation message and SHALL NOT call the `signIn` function.

### Requirement 4: Sign up connected to real authentication

**User Story:** As a new user, I want to create an account with my real details, so that I can start using the product.

#### Acceptance Criteria

1. WHEN a user submits the SignUp_Form with valid inputs, THE SignUp_Form SHALL call the `signUp` function exposed by App_Context with the entered email, the entered password, and a metadata object containing the entered full name, business name, and phone number.
2. WHILE the `signUp` call is in progress, THE SignUp_Form SHALL display a loading indicator and SHALL disable the submit control.
3. IF the password and the confirmation password do not match, THEN THE SignUp_Form SHALL display a validation message and SHALL NOT call the `signUp` function.
4. IF the password contains fewer than 8 characters, THEN THE SignUp_Form SHALL display a validation message and SHALL NOT call the `signUp` function.
5. IF the terms-acceptance control is not selected when the SignUp_Form is submitted, THEN THE SignUp_Form SHALL display a validation message and SHALL NOT call the `signUp` function.
6. WHEN the Auth_Result from `signUp` has `success` equal to true AND an active session is established, THE Main_App SHALL render the Dashboard.
7. WHEN the Auth_Result from `signUp` has `success` equal to true AND email confirmation is required before a session is established, THE SignUp_Form SHALL display a message instructing the user to confirm the registration by email.
8. IF the Auth_Result from `signUp` has `success` equal to false, THEN THE SignUp_Form SHALL display the returned error message and SHALL re-enable the submit control.

### Requirement 5: Google authentication option

**User Story:** As a user, I want to authenticate with Google, so that I can sign in without managing a separate password.

#### Acceptance Criteria

1. WHEN a user activates the Google authentication control on the SignIn_Form or the SignUp_Form, THE form SHALL call the `signInWithGoogle` function exposed by App_Context.
2. IF the Auth_Result from `signInWithGoogle` has `success` equal to false, THEN THE active form SHALL display the returned error message.

### Requirement 6: Navigation between authentication forms

**User Story:** As a Visitor, I want to switch between the sign in and sign up forms, so that I can reach the correct form for my situation.

#### Acceptance Criteria

1. WHILE the `auth` URL parameter equals `signup`, THE Auth_Page SHALL render the SignUp_Form.
2. WHILE the `auth` URL parameter equals `signin` or holds any other value, THE Auth_Page SHALL render the SignIn_Form.
3. WHEN a user activates the link to create an account on the SignIn_Form, THE Main_App SHALL render the SignUp_Form.
4. WHEN a user activates the link to sign in on the SignUp_Form, THE Main_App SHALL render the SignIn_Form.

### Requirement 7: Salvage required files from the duplicate folder

**User Story:** As a developer, I want to keep the still-needed assets and logic from the duplicate folder before removing it, so that no required resource is lost.

#### Acceptance Criteria

1. THE Main_App SHALL contain a copy of `logo-opays.png` in its `public/` directory.
2. THE Main_App SHALL contain a copy of `hero-dashboard.jpg` in its `public/` directory.
3. WHERE a Salvage_Asset is already present in the Main_App with identical content, THE salvage process SHALL leave the existing Main_App file unchanged.
4. WHERE the Duplicate_Folder contains form-validation logic that is not already implemented in the Main_App and is determined to be worth porting, THE salvage process SHALL port that logic into the Main_App using the Main_App's JSX conventions and existing dependencies.
5. THE salvage process SHALL record, in the project `docs/` directory, the list of files salvaged from the Duplicate_Folder and the files intentionally discarded.

### Requirement 8: Safe and complete removal of the duplicate folder

**User Story:** As a developer, I want the duplicate design-source folder removed entirely once salvage is complete, so that the repository has a single source of truth.

#### Acceptance Criteria

1. WHEN salvage of all required files is confirmed complete, THE removal process SHALL delete the entire `Kimi_Agent_SAS Front‑End & Tarifs/` directory and all of its contents.
2. AFTER the Duplicate_Folder is removed, THE Main_App SHALL build successfully using `npm run build`.
3. AFTER the Duplicate_Folder is removed, THE Main_App source SHALL contain no import statement or asset reference that resolves to a path inside the Duplicate_Folder.
4. THE removal process SHALL record the deletion of the Duplicate_Folder in the project `docs/` directory.

### Requirement 9: No regression to the authenticated application

**User Story:** As an existing user, I want the dashboard and all current features to keep working, so that the SaaS changes do not break my workflow.

#### Acceptance Criteria

1. WHILE an authenticated user session exists, THE Main_App SHALL provide access to the Dashboard, Transactions, Wallets, Expenses, Loans, and Settings views through the existing tab navigation.
2. THE Main_App SHALL pass the existing unit test suite run by `npm test`.
3. THE Main_App SHALL retain the existing PWA service worker behavior defined in `public/sw.js`.
4. WHEN a user activates the sign-out control while authenticated, THE Main_App SHALL end the session and render the Landing_Page.
5. WHILE the `debug_force_demo` URL parameter is present, THE Main_App SHALL grant demo access as it does before this feature.
