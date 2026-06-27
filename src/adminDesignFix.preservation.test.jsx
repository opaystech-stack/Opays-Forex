import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import fc from 'fast-check';

// ---------------------------------------------------------------------------
// Tests de PRÉSERVATION (spec admin-design-fix, tâche 2 — Property 3).
//
// Méthodologie observation-first : on capture le comportement OBSERVÉ sur le
// code NON corrigé pour toutes les entrées HORS condition de bug
// (NOT(isBugCondition_PlatformAdmin OR isBugCondition_ConsoleAdmin)). Ces tests
// DOIVENT PASSER sur le code non corrigé : ils figent la référence à préserver
// et garantiront l'absence de régression après la correction (tâche 3.4).
//
// Conventions reprises de `src/pages/EspaceAdminPlateforme.test.jsx` et de
// `src/adminDesignFix.exploration.test.jsx` :
//   - i18n neutralisé : `useT` renvoie la clé (référence STABLE via vi.hoisted) ;
//   - contexte applicatif (`useApp`) mocké par un état hoisté `ctx`, et
//     `AppProvider` réduit à un passe-plat (App l'enveloppe autour du routeur) ;
//   - service Supabase neutralisé (null) pour isoler du réseau et stabiliser le
//     court-circuit de chargement de la Console_Admin ;
//   - assertions sans jest-dom (toBeTruthy / toBeNull / not.toBeNull).
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

// Service Supabase neutralisé : ConsoleAdmin court-circuite son chargement
// (`if (!supabase) { setEntries([]); setLoading(false); }`) et AccesRestreint
// retombe sur 'none' — rendu déterministe, hors réseau.
vi.mock('./services/supabase', () => ({
  supabase: null,
}));

import EspaceAdminPlateforme from './pages/EspaceAdminPlateforme';
import App from './App';

// Contexte par défaut riche couvrant les besoins des pages testées
// (EspaceAdminPlateforme, ConsoleAdmin, AccesRestreint, Paiement, gardes).
const makeCtx = (overrides = {}) => ({
  // Identité / gardes
  user: {},
  loading: false,
  profilAcces: {},
  isAdmin: () => false,
  isAccessGranted: () => true,
  profileStatus: 'ready',
  hasCredentials: true,
  agencyState: 'active',
  logOut: vi.fn().mockResolvedValue({ success: true }),
  // EspaceAdminPlateforme
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
  // Paiement
  submitPaymentProof: vi.fn().mockResolvedValue({ success: true }),
  ...overrides,
});

// Positionne l'URL (route + éventuel ?debug_force_demo) avant le rendu.
const setRoute = (route, debug = false) => {
  window.history.pushState({}, '', debug ? `${route}?debug_force_demo` : route);
};

// La condition de bug `isBugCondition_PlatformAdmin` : route /admin-plateforme,
// ?debug_force_demo présent, ET ni éditeur réel ni isDemo. La garde interne de
// EspaceAdminPlateforme calcule (code non corrigé) :
//   isPlatformEditor = Boolean(is_platform_editor) || Boolean(isDemo)
// donc la décision « UI vs refus » dépend uniquement de (editor || isDemo).

beforeEach(() => {
  ctx.value = makeCtx();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Préservation hors condition de bug — admin-design-fix (Property 3)', () => {
  // -------------------------------------------------------------------------
  // PBT (Req 3.1/3.2) — Décision de la garde interne de EspaceAdminPlateforme.
  //
  // Pour toute combinaison { is_platform_editor, isDemo, hasDebugDemo } HORS
  // condition de bug (fc.pre filtre `hasDebugDemo && !editor && !isDemo`), la
  // décision observée est : UI affichée SSI (is_platform_editor || isDemo).
  // C'est la référence à préserver (identique entre F et F' hors bug).
  // -------------------------------------------------------------------------
  it('décision = UI ssi (is_platform_editor || isDemo), hors condition de bug (Req 3.1/3.2)', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (editor, isDemo, hasDebugDemo) => {
          // Exclure la condition de bug plateforme (gérée par les tests d'exploration).
          fc.pre(!(hasDebugDemo && !editor && !isDemo));

          cleanup();
          setRoute('/admin-plateforme', hasDebugDemo);

          ctx.value = makeCtx({
            profilAcces: { is_platform_editor: editor },
            user: { isDemo },
            platformAgencies: [
              { id: 'a-1', name: 'Agence Alpha', owner_id: 'o-1', state: 'active' },
            ],
          });

          render(<EspaceAdminPlateforme />);

          const expectsUI = editor || isDemo;
          if (expectsUI) {
            // Accès légitime préservé : UI présente, refus absent.
            expect(screen.queryByText('platform_admin.permission_denied')).toBeNull();
            expect(screen.getByText('platform_admin.stats_title')).toBeTruthy();
          } else {
            // Refus légitime préservé : carte de refus présente, UI absente.
            expect(screen.getByText('platform_admin.permission_denied')).toBeTruthy();
            expect(screen.queryByText('platform_admin.stats_title')).toBeNull();
          }
        },
      ),
      { numRuns: 40 },
    );
  }, 30000);

  // -------------------------------------------------------------------------
  // Accès éditeur réel préservé (Req 3.1) — is_platform_editor = true, sans debug.
  // -------------------------------------------------------------------------
  it("éditeur réel (sans debug) ⇒ UI d'administration plateforme affichée (Req 3.1)", () => {
    setRoute('/admin-plateforme', false);
    ctx.value = makeCtx({
      profilAcces: { is_platform_editor: true },
      user: { isDemo: false },
      platformAgencies: [
        { id: 'a-1', name: 'Agence Alpha', owner_id: 'o-1', state: 'active' },
      ],
    });

    render(<EspaceAdminPlateforme />);

    expect(screen.queryByText('platform_admin.permission_denied')).toBeNull();
    expect(screen.getByText('platform_admin.stats_title')).toBeTruthy();
    expect(screen.getByText('platform_admin.agencies_title')).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Refus légitime préservé (Req 3.2) — ni éditeur, ni isDemo, ni debug.
  // -------------------------------------------------------------------------
  it('ni éditeur, ni isDemo, ni debug ⇒ carte de refus affichée (Req 3.2)', () => {
    setRoute('/admin-plateforme', false);
    ctx.value = makeCtx({
      profilAcces: { is_platform_editor: false },
      user: { isDemo: false },
      platformAgencies: [{ id: 'a-1', name: 'Agence Alpha', state: 'active' }],
    });

    render(<EspaceAdminPlateforme />);

    expect(screen.getByText('platform_admin.permission_denied')).toBeTruthy();
    expect(screen.queryByText('platform_admin.stats_title')).toBeNull();
    expect(screen.queryByText('platform_admin.agencies_title')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Redirection non-admin préservée (Req 3.3) — /admin sans admin/démo/debug
  // ⇒ Page_Acces_Restreint (et NON ConsoleAdmin).
  // -------------------------------------------------------------------------
  it('/admin sans rôle admin ni démo/debug ⇒ Page_Acces_Restreint, pas ConsoleAdmin (Req 3.3)', async () => {
    setRoute('/admin', false);
    ctx.value = makeCtx({
      user: { id: 'u-1', isDemo: false },
      isAdmin: () => false,
      profilAcces: { role: 'member' },
    });

    render(<App />);

    // AccesRestreint (lazy) s'affiche : titre d'accès restreint présent…
    const restricted = await screen.findByText('access.title', {}, { timeout: 15000 });
    expect(restricted).toBeTruthy();
    // …et l'en-tête de la Console_Admin est ABSENT (pas de montage de ConsoleAdmin).
    expect(screen.queryByText('admin.title')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Thème clair préservé (Req 3.4) — pages autonomes rendues dans .standalone-page.
  // -------------------------------------------------------------------------
  it('/paiement rend son contenu dans un ancêtre .standalone-page (Req 3.4)', async () => {
    setRoute('/paiement', false);
    ctx.value = makeCtx({ user: { id: 'u-1', isDemo: false } });

    render(<App />);

    const heading = await screen.findByText('payment.title', {}, { timeout: 15000 });
    expect(heading.closest('.standalone-page')).not.toBeNull();
  });

  it('/admin-plateforme (éditeur réel) rend la console dans un ancêtre .standalone-page (Req 3.4)', async () => {
    setRoute('/admin-plateforme', false);
    ctx.value = makeCtx({
      user: { id: 'u-1', isDemo: false },
      profilAcces: { is_platform_editor: true },
      platformAgencies: [
        { id: 'a-1', name: 'Agence Alpha', owner_id: 'o-1', state: 'active' },
      ],
    });

    render(<App />);

    const heading = await screen.findByText('platform_admin.stats_title', {}, { timeout: 15000 });
    expect(heading.closest('.standalone-page')).not.toBeNull();
  });

  it("garde d'agence suspendue rend son message dans un ancêtre .standalone-page (Req 3.4)", async () => {
    // /app via ?debug_force_demo (PrivateRoute + AccessGate laissent passer),
    // agence suspendue ⇒ message d'accès suspendu rendu À LA PLACE de l'AppShell.
    setRoute('/app', true);
    ctx.value = makeCtx({
      user: { id: 'u-1', isDemo: true },
      agencyState: 'suspendue',
    });

    render(<App />);

    const heading = await screen.findByText('agency_gate.suspended_title', {}, { timeout: 15000 });
    expect(heading.closest('.standalone-page')).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // Logique de la Console_Admin préservée (Req 3.5) — /admin en contexte admin
  // monte ConsoleAdmin ; le flux chargement → état vide fonctionne (supabase null).
  // (On n'asserte PAS .standalone-page : c'est la condition de bug, absente sur
  //  code non corrigé.)
  // -------------------------------------------------------------------------
  it('/admin (contexte admin) monte ConsoleAdmin ; chargement → état vide fonctionne (Req 3.5)', async () => {
    setRoute('/admin', false);
    ctx.value = makeCtx({
      user: { id: 'admin-1', isDemo: false },
      isAdmin: () => true,
      profilAcces: { role: 'admin' },
    });

    render(<App />);

    // En-tête de la Console_Admin présent (montage effectif).
    const heading = await screen.findByText('admin.title', {}, { timeout: 15000 });
    expect(heading).toBeTruthy();
    // supabase null ⇒ chargement court-circuité ⇒ état vide affiché.
    expect(await screen.findByText('admin.empty', {}, { timeout: 15000 })).toBeTruthy();
    // Pas de message d'erreur sur ce chemin.
    expect(screen.queryByText('admin.update_error')).toBeNull();
  });
});
