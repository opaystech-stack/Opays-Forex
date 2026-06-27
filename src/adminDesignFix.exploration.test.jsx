import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import fc from 'fast-check';

// ---------------------------------------------------------------------------
// Tests d'EXPLORATION de la condition de bug (spec admin-design-fix, tâche 1).
//
// Ces tests encodent le comportement ATTENDU (Correctness Properties 1 & 2 du
// design) et DOIVENT ÉCHOUER sur le code NON corrigé : l'échec démontre que les
// bugs existent. Ils valideront la correction lorsqu'ils passeront (tâche 3.3).
//
// Conventions reprises de `src/pages/EspaceAdminPlateforme.test.jsx` :
//   - i18n neutralisé : `useT` renvoie la clé (rendu déterministe), via une
//     référence STABLE construite avec vi.hoisted ;
//   - le contexte applicatif (`useApp`) est mocké par un état hoisté `ctx`,
//     reconfiguré avant chaque rendu ;
//   - assertions sans jest-dom (toBeTruthy / toBeNull), comme la base existante.
// ---------------------------------------------------------------------------

// i18n : `t(key) => key` (référence stable, cf. VoiceAgentModal.test.jsx).
const stableT = vi.hoisted(() => (key) => key);
vi.mock('./i18n', () => ({
  useT: () => stableT,
}));

// Contexte applicatif hoisté : `ctx.value` est l'objet renvoyé par useApp ;
// `AppProvider` est un simple passe-plat (App l'enveloppe autour du routeur).
const ctx = vi.hoisted(() => ({ value: {} }));
vi.mock('./context/AppContext', () => ({
  useApp: () => ctx.value,
  AppProvider: ({ children }) => children,
}));

// Service Supabase neutralisé : la Console_Admin court-circuite son chargement
// (`if (!supabase) { setEntries([]); setLoading(false); }`), ce qui isole le
// test de tout accès réseau et stabilise le rendu.
vi.mock('./services/supabase', () => ({
  supabase: null,
}));

import EspaceAdminPlateforme from './pages/EspaceAdminPlateforme';
import App from './App';

// Contexte par défaut pour EspaceAdminPlateforme : données vides, actions no-op.
// `profilAcces` / `user` sont surchargés par chaque cas (condition de bug).
const makePlatformCtx = (overrides = {}) => ({
  profilAcces: {},
  user: {},
  loading: false,
  platformAgencies: [],
  platformModuleEntitlements: {},
  setModuleEntitlement: vi.fn().mockResolvedValue({ success: true }),
  setAgencyState: vi.fn().mockResolvedValue({ success: true }),
  transferMethods: [],
  subscriptionProviders: [],
  createTransferMethod: vi.fn().mockResolvedValue({ success: true }),
  updateTransferMethod: vi.fn().mockResolvedValue({ success: true }),
  createSubscriptionProvider: vi.fn().mockResolvedValue({ success: true }),
  updateSubscriptionProvider: vi.fn().mockResolvedValue({ success: true }),
  ...overrides,
});

// Contexte admin permettant à la route /admin de monter ConsoleAdmin :
// PrivateRoute (user + loading), AdminRoute (isAdmin / isDemo), ConsoleAdmin (user).
const makeAdminCtx = (overrides = {}) => ({
  user: { id: 'admin-1', isDemo: true },
  loading: false,
  isAdmin: () => true,
  profilAcces: { role: 'admin' },
  hasCredentials: true,
  ...overrides,
});

// Valeurs « faussement » nulles couvrant NOT(is_platform_editor OR isDemo).
const FALSY = [false, undefined, null];

beforeEach(() => {
  ctx.value = makePlatformCtx();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Exploration condition de bug — admin-design-fix", () => {
  // -------------------------------------------------------------------------
  // Property 1 (isBugCondition_PlatformAdmin, Req 2.1) — la garde interne de
  // EspaceAdminPlateforme doit honorer ?debug_force_demo : avec le paramètre
  // présent mais SANS is_platform_editor et SANS isDemo, l'UI d'administration
  // doit s'afficher et la carte « Permission insuffisante » être ABSENTE.
  //
  // ATTENDU SUR CODE NON CORRIGÉ : ÉCHEC (la carte de refus s'affiche), car la
  // garde calcule l'autorisation sans hasDebugDemo().
  // -------------------------------------------------------------------------
  it("affiche l'UI plateforme avec ?debug_force_demo sans droits (Property 1, Req 2.1)", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...FALSY),
        fc.constantFrom(...FALSY),
        (editorFlag, demoFlag) => {
          cleanup();
          // Condition de bug : route /admin-plateforme ouverte via ?debug_force_demo.
          window.history.pushState({}, '', '/admin-plateforme?debug_force_demo');

          ctx.value = makePlatformCtx({
            profilAcces: { is_platform_editor: editorFlag },
            user: { isDemo: demoFlag },
            platformAgencies: [
              { id: 'a-1', name: 'Agence Alpha', owner_id: 'o-1', state: 'active' },
            ],
          });

          render(<EspaceAdminPlateforme />);

          // Comportement attendu (Property 1) : UI présente, refus ABSENT.
          expect(screen.queryByText('platform_admin.permission_denied')).toBeNull();
          expect(screen.getByText('platform_admin.stats_title')).toBeTruthy();
          expect(screen.getByText('platform_admin.agencies_title')).toBeTruthy();
        },
      ),
      { numRuns: 20 },
    );
  }, 30000);

  // -------------------------------------------------------------------------
  // Property 2 (isBugCondition_ConsoleAdmin, Req 2.2) — la route /admin doit
  // monter ConsoleAdmin dans le conteneur de Theme_Clair `.standalone-page`,
  // pour un contraste lisible.
  //
  // ATTENDU SUR CODE NON CORRIGÉ : ÉCHEC (ConsoleAdmin est monté directement,
  // sans ancêtre `.standalone-page`).
  // -------------------------------------------------------------------------
  it("monte ConsoleAdmin dans un ancêtre .standalone-page sur /admin (Property 2, Req 2.2)", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Deux chemins d'octroi admin équivalents : mode démo ou rôle admin.
        fc.constantFrom('demo', 'admin'),
        async (grant) => {
          cleanup();
          window.history.pushState({}, '', '/admin?debug_force_demo');

          ctx.value =
            grant === 'demo'
              ? makeAdminCtx({ user: { id: 'u-1', isDemo: true }, isAdmin: () => false })
              : makeAdminCtx({ user: { id: 'u-2', isDemo: false }, isAdmin: () => true });

          render(<App />);

          // ConsoleAdmin est chargé en lazy ⇒ attendre son en-tête (clé i18n).
          const heading = await screen.findByText('admin.title');

          // Comportement attendu (Property 2) : un ancêtre .standalone-page existe.
          const standaloneAncestor = heading.closest('.standalone-page');
          expect(standaloneAncestor).not.toBeNull();
        },
      ),
      { numRuns: 4 },
    );
  });
});
