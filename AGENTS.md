# AGENTS.md

## Project overview
- This repository is a React + Vite PWA for forex/treasury tracking with Supabase-backed data.
- Main app code lives in `src/`, docs and product/architecture notes in `docs/`, and the Supabase edge functions in `supabase/functions/`.

## Working rules for AI agents
- Prefer small, focused changes that match the existing React/Vite structure.
- Use the existing docs as the source of truth before inventing architecture or workflow changes:
  - [README.md](README.md)
  - [docs/02_Specs/v1_spec.md](docs/02_Specs/v1_spec.md)
  - [docs/03_Architecture/db_schema.md](docs/03_Architecture/db_schema.md)
  - [docs/04_DevLogs/dev_log.md](docs/04_DevLogs/dev_log.md)
- Keep finance/business logic in `src/utils/finance.js` and update tests in `src/utils/finance.test.js` when behavior changes.
- If you modify build/version metadata behavior, keep `scripts/update-version.js` and `public/version.json` aligned.

## Common commands
- `npm test` — verifies the current unit tests.
- `npm run build` — production build; this also runs `node scripts/update-version.js` before Vite builds.
- `npm run lint` — currently reports existing lint issues in `scripts/update-version.js`, `src/context/AppContext.jsx`, and `src/pages/Settings.jsx`; fix only if the task explicitly requires it.

## Environment and runtime notes
- The app expects Supabase env vars from `.env.example`:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- Local dev server is configured in `vite.config.js` to run on `127.0.0.1` with HMR over `localhost`.
- PWA/service worker behavior is defined in `public/sw.js`; be careful when changing caching logic.

## Good default behavior
- Preserve existing page structure and naming in `src/pages/` and `src/components/`.
- Prefer updating existing utilities/components over adding parallel implementations.
- When changing user-visible behavior, update the relevant docs in `docs/` instead of duplicating the explanation here.
