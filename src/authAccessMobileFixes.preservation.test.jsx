// =============================================================================
// auth-access-mobile-fixes — Tests de PRÉSERVATION (Tâche 2)
// -----------------------------------------------------------------------------
// Property 2 (Preservation) — Ces tests encodent les COMPORTEMENTS À PRÉSERVER
// (Propriétés 6 à 10 du design) pour toutes les entrées HORS condition de bug
// (¬C), conformément aux clauses 3.1–3.9 du document de bugs.
//
// MÉTHODOLOGIE « observation-first » :
//   - Ces tests DOIVENT PASSER sur le code NON corrigé : ils figent la
//     référence de comportement à conserver après correction (tâche 3.7).
//   - On exécute d'abord le code non corrigé, on observe la sortie RÉELLE,
//     puis on l'asserte (on ne code pas le comportement « désiré » mais le
//     comportement OBSERVÉ qui fonctionne déjà).
//   - On NE modifie NI le code de production NI `src/services/supabase.js`.
//
// Conventions du dépôt (cf. authAccessMobileFixes.exploration.test.jsx) :
//   - jsdom + Vitest + @testing-library/react + fast-check ;
//   - PAS de matchers jest-dom : toBe / toBeNull / not.toBeNull / toBeTruthy
//     et requêtes DOM directes ;
//   - le réseau (fetch), le cookie de session et GIS sont SIMULÉS ;
//   - `src/services/supabase.js` n'est jamais modifié (chemin démo/repli).
//
// Approche PBT (fast-check) privilégiée pour les garanties universelles :
//   - stratégie de cache du Service Worker sur des URL aléatoires (3.6) ;
//   - biconditionnelle FAB WhatsApp / `pendingCount` (3.8) ;
//   - décision d'accès payant / blocage post-essai sur des âges/états variés
//     (3.3, 3.4).
// =============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, renderHook, waitFor, cleanup, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import fc from 'fast-check';
import fs from 'node:fs';
import path from 'node:path';

import { AppProvider, useApp } from './context/AppContext';
import { isAccessGranted, evaluateAccess } from './utils/accessControl';
import WhatsAppFab from './components/WhatsAppFab';
import Navbar from './components/Navbar';

// ---------------------------------------------------------------------------
// Outils communs (repris de la suite d'exploration).
// ---------------------------------------------------------------------------

// Réponse JSON façon Fetch API (entêtes insensibles à la casse comme le vrai).
function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 400,
    status,
    headers: {
      get: (name) =>
        String(name).toLowerCase() === 'content-type' ? 'application/json' : null,
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

// Installe un double de `global.fetch` routé par sous-chemin d'URL.
function installFetch(router) {
  const fn = vi.fn(async (url, opts) => router(String(url), opts));
  global.fetch = fn;
  return fn;
}

const wrapper = ({ children }) => <AppProvider>{children}</AppProvider>;

// Positionne `window.innerWidth` (Navbar lit cette valeur au montage).
function setViewport(width) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  delete global.fetch;
  try { delete window.google; } catch { /* no-op */ }
});

// =============================================================================
// Property 6 — Préservation : session PC et chemins démo/Supabase inchangés
// (3.1 session PC, 3.2 connexion e-mail/mot de passe, 3.5 démo/mock).
// =============================================================================
describe('Property 6 — Session PC + connexion classique + démo (3.1, 3.2, 3.5)', () => {
  // ----- 3.1 : F5 sur PC avec cookie valide restaure la session -------------
  it('un cookie de session valide restaure la session via /api/auth/me (3.1)', async () => {
    vi.stubEnv('VITE_DATA_BACKEND', 'api');
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

    const validUser = {
      id: 'pc-user',
      email: 'pc@agence.cd',
      role: 'user',
      agencyId: 'a1',
      isActive: true,
    };

    installFetch((url) => {
      if (url.includes('/auth/me')) {
        return jsonResponse({ success: true, user: validUser });
      }
      return jsonResponse({ success: true, data: [] });
    });

    const { result } = renderHook(() => useApp(), { wrapper });

    // Baseline OBSERVÉ : la session est restaurée (cas non bogué : /auth/me honoré).
    await waitFor(
      () => expect(result.current.user?.id).toBe('pc-user'),
      { timeout: 6000 },
    );
  });

  // ----- 3.2 : connexion e-mail / mot de passe valide -----------------------
  it('une connexion e-mail/mot de passe valide authentifie l\'utilisateur (3.2)', async () => {
    vi.stubEnv('VITE_DATA_BACKEND', 'api');
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

    const authedUser = {
      id: 'login-user',
      email: 'op@agence.cd',
      role: 'user',
      agencyId: 'a1',
      isActive: true,
    };

    installFetch((url) => {
      if (url.includes('/auth/login')) {
        return jsonResponse({ success: true, user: authedUser });
      }
      // Pas de session au démarrage (aucun cookie) : /auth/me renvoie 401.
      if (url.includes('/auth/me')) return jsonResponse({ error: 'unauthorized' }, 401);
      return jsonResponse({ success: true, data: [] });
    });

    const { result } = renderHook(() => useApp(), { wrapper });
    // Attendre la fin du bootstrap (loading retombe à false sans session).
    await waitFor(() => expect(result.current.loading).toBe(false));

    let res;
    await act(async () => {
      res = await result.current.signIn('op@agence.cd', 'motdepasse123');
    });

    // Baseline OBSERVÉ : succès de l'authentification + utilisateur connecté.
    expect(res.success).toBe(true);
    await waitFor(() => expect(result.current.user?.id).toBe('login-user'));
  });

  // ----- 3.5 : mode démo (loginAsDemo) — accès local sans appel réseau ------
  it('loginAsDemo accorde un accès local SANS appel réseau (3.5)', async () => {
    // Hors mode API : chemin démo/mock (repli local, supabase mock).
    vi.stubEnv('VITE_DATA_BACKEND', '');
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

    const fetchSpy = installFetch(() => jsonResponse({ success: true, data: [] }));

    const { result } = renderHook(() => useApp(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.loginAsDemo();
    });

    // Baseline OBSERVÉ : utilisateur démo local actif…
    await waitFor(() => expect(result.current.user?.isDemo).toBe(true));
    // …et AUCUN appel réseau d'authentification n'a été émis.
    const authCalls = fetchSpy.mock.calls.filter(([u]) => String(u).includes('/auth'));
    expect(authCalls.length).toBe(0);
  });

  // ----- 3.5 : mode démo (?debug_force_demo) — accès local automatique ------
  it('?debug_force_demo connecte automatiquement en mode démo (3.5)', async () => {
    vi.stubEnv('VITE_DATA_BACKEND', '');
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

    window.history.pushState({}, '', '/app?debug_force_demo');
    const fetchSpy = installFetch(() => jsonResponse({ success: true, data: [] }));

    const { result } = renderHook(() => useApp(), { wrapper });

    // Baseline OBSERVÉ : bascule démo automatique depuis l'URL, sans réseau auth.
    await waitFor(() => expect(result.current.user?.isDemo).toBe(true));
    const authCalls = fetchSpy.mock.calls.filter(([u]) => String(u).includes('/auth'));
    expect(authCalls.length).toBe(0);

    window.history.pushState({}, '', '/');
  });

  // ----- 3.5 : `src/services/supabase.js` non modifié -----------------------
  it('src/services/supabase.js reste intact (chemin démo/repli préservé) (3.5)', () => {
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'src/services/supabase.js'),
      'utf8',
    );
    // Baseline OBSERVÉ : le module exporte le client `supabase` (repli mock),
    // construit par `createMockProxy`. Ce fichier ne doit pas être touché.
    expect(/export const supabase/.test(src)).toBe(true);
    expect(/createMockProxy/.test(src)).toBe(true);
  });
});

// =============================================================================
// Property 7 — Préservation : accès payant + blocage post-essai inchangés
// (3.3 accès payant accordé quel que soit l'essai ; 3.4 hors-essai non payé bloqué).
//
// On scope la PBT aux comptes HORS période d'essai (âge >= 31 jours) afin de
// cibler exactement la préservation décrite (la fenêtre d'essai < 30 j relève
// de la zone en cours de correction, Z4).
// =============================================================================
describe('Property 7 — Accès payant et blocage post-essai (3.3, 3.4)', () => {
  it('hors essai : accès accordé SSI compte payant (acces_autorise) (3.3, 3.4)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 31, max: 400 }), // âge du compte (jours) : hors essai
        fc.boolean(),                       // accès payant validé ?
        (daysAgo, paid) => {
          const created_at = new Date(
            Date.now() - daysAgo * 24 * 60 * 60 * 1000,
          ).toISOString();
          const profile = { created_at, acces_autorise: paid };

          const decision = evaluateAccess({ status: 'ready', profile });

          // Baseline OBSERVÉ : payant ⇒ accès (app) ; non payé hors essai ⇒ bloqué.
          if (paid) {
            expect(decision.allowed).toBe(true);
            expect(decision.view).toBe('app');
          } else {
            expect(decision.allowed).toBe(false);
            expect(decision.view).toBe('restricted');
          }
        },
      ),
      { numRuns: 40 },
    );
  });

  it('exemple — compte payant ancien (45 j) : accès accordé indépendamment de l\'essai (3.3)', () => {
    const created_at = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    expect(isAccessGranted({ created_at, acces_autorise: true })).toBe(true);
  });

  it('exemple — compte non payé hors essai (45 j) : accès bloqué (AccesRestreint) (3.4)', () => {
    const created_at = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    const decision = evaluateAccess({
      status: 'ready',
      profile: { created_at, acces_autorise: false },
    });
    expect(decision.allowed).toBe(false);
    expect(decision.view).toBe('restricted');
  });
});

// =============================================================================
// Property 8 — Préservation : stratégie de cache du Service Worker inchangée
// (3.6). PBT sur des URL aléatoires couvrant chaque catégorie.
//
// On charge `public/sw.js` dans un bac à sable (globals simulés), on capture le
// gestionnaire `fetch`, puis on observe la STRATÉGIE retenue par catégorie :
//   - navigation / version.json ⇒ réseau-d'abord « no-store » ;
//   - bundles hachés (assets/*.js|css) ⇒ réseau-d'abord avec repli cache ;
//   - assets statiques ⇒ cache-d'abord ;
//   - /api ⇒ ignoré (réseau direct, pas de respondWith).
// =============================================================================
const SW_ORIGIN = 'https://fox.opays.io';

function makeSwSandbox() {
  const swSource = fs.readFileSync(path.resolve(process.cwd(), 'public/sw.js'), 'utf8');
  const listeners = {};
  const ctx = { fetchCalls: [], cacheMatchCalls: [] };

  const fakeCaches = {
    open: async () => ({ addAll: async () => {}, put: async () => {} }),
    match: (req) => { ctx.cacheMatchCalls.push(req); return Promise.resolve(undefined); },
    keys: async () => [],
    delete: async () => true,
  };
  const fakeFetch = (req, opts) => {
    ctx.fetchCalls.push({ req, opts });
    return Promise.resolve({ status: 200, clone: () => ({}) });
  };
  const fakeSelf = {
    location: { origin: SW_ORIGIN },
    addEventListener: (type, handler) => { listeners[type] = handler; },
    skipWaiting: () => {},
    clients: { claim: () => {} },
  };

  // eslint-disable-next-line no-new-func
  const load = new Function('self', 'caches', 'fetch', 'URL', 'console', swSource);
  load(fakeSelf, fakeCaches, fakeFetch, URL, console);
  return { listeners, ctx };
}

// Classe la stratégie OBSERVÉE de manière synchrone (avant micro-tâches).
function classifySw(sandbox, { path: p, mode }) {
  const { listeners, ctx } = sandbox;
  ctx.fetchCalls.length = 0;
  ctx.cacheMatchCalls.length = 0;
  let responded = false;
  listeners.fetch({
    request: { method: 'GET', url: `${SW_ORIGIN}${p}`, mode },
    respondWith: (promise) => {
      responded = true;
      if (promise && typeof promise.catch === 'function') promise.catch(() => {});
    },
  });
  if (!responded) return 'ignored';
  if (ctx.fetchCalls.length > 0) {
    const opts = ctx.fetchCalls[0].opts;
    if (opts && opts.cache === 'no-store') return 'network-nostore';
    return 'network-first';
  }
  if (ctx.cacheMatchCalls.length > 0) return 'cache-first';
  return 'unknown';
}

describe('Property 8 — Stratégie de cache du Service Worker (3.6)', () => {
  const swCaseArb = fc.oneof(
    // Navigation HTML : réseau-d'abord, no-store.
    fc.record({
      path: fc.constantFrom('/', '/app', '/login', '/dashboard', '/index.html'),
      mode: fc.constant('navigate'),
      expected: fc.constant('network-nostore'),
    }),
    // version.json : réseau-d'abord, no-store (mise à jour de version).
    fc.record({
      path: fc.constant('/version.json'),
      mode: fc.constant('no-cors'),
      expected: fc.constant('network-nostore'),
    }),
    // Bundles hachés : réseau-d'abord avec repli cache.
    fc.record({
      path: fc.tuple(
        fc.constantFrom('index', 'vendor', 'main', 'chunk'),
        fc.hexaString({ minLength: 6, maxLength: 10 }),
        fc.constantFrom('js', 'css'),
      ).map(([n, h, e]) => `/assets/${n}-${h}.${e}`),
      mode: fc.constant('cors'),
      expected: fc.constant('network-first'),
    }),
    // Assets statiques : cache-d'abord.
    fc.record({
      path: fc.tuple(
        fc.constantFrom('icons/icon', 'img/logo', 'fonts/inter', 'media/pic'),
        fc.constantFrom('png', 'svg', 'woff2', 'jpg', 'webp'),
      ).map(([n, e]) => `/${n}.${e}`),
      mode: fc.constant('no-cors'),
      expected: fc.constant('cache-first'),
    }),
    // /api : ignoré (réseau direct, pas de prise en charge SW).
    fc.record({
      path: fc.constantFrom('/api/auth/me', '/api/wallets', '/api/transactions', '/api/dashboard/summary'),
      mode: fc.constant('cors'),
      expected: fc.constant('ignored'),
    }),
  );

  it('la stratégie observée correspond à la stratégie d\'origine par catégorie d\'URL (3.6)', () => {
    const sandbox = makeSwSandbox();
    fc.assert(
      fc.property(swCaseArb, ({ path: p, mode, expected }) => {
        expect(classifySw(sandbox, { path: p, mode })).toBe(expected);
      }),
      { numRuns: 60 },
    );
  });
});

// =============================================================================
// Property 9 — Préservation : FAB WhatsApp masqué sans brouillon (3.8).
// PBT : pendingCount === 0  ⇔  le FAB rend `null`.
// =============================================================================
describe('Property 9 — FAB WhatsApp masqué quand aucun brouillon (3.8)', () => {
  it('pendingCount === 0 ⇔ le FAB rend null (3.8)', () => {
    fc.assert(
      fc.property(fc.nat({ max: 999 }), (pendingCount) => {
        cleanup();
        const { container } = render(
          <WhatsAppFab pendingCount={pendingCount} onClick={() => {}} />,
        );
        const fab = container.querySelector('.whatsapp-fab');

        // Baseline OBSERVÉ : biconditionnelle stricte.
        if (pendingCount === 0) {
          expect(container.firstChild).toBeNull();
          expect(fab).toBeNull();
        } else {
          expect(fab).not.toBeNull();
        }
      }),
      { numRuns: 40 },
    );
  });
});

// =============================================================================
// Property 10 — Préservation : mises en page bureau et navigation mobile sans
// régression (3.7 bureau ; 3.9 barre inférieure mobile).
// =============================================================================
describe('Property 10 — Mises en page bureau et mobile (3.7, 3.9)', () => {
  const renderNavbar = (mode = 'agency') =>
    render(
      <BrowserRouter>
        <AppProvider>
          <Navbar
            activeTab="dashboard"
            setActiveTab={() => {}}
            isUsingMock={false}
            hasPermission={() => false}
            isModuleEnabled={() => false}
            mode={mode}
          />
        </AppProvider>
      </BrowserRouter>,
    );

  beforeEach(() => {
    vi.stubEnv('VITE_DATA_BACKEND', '');
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
  });

  it('bureau (>= 900px) : sidebar avec en-tête et les 5 onglets de base, dont Prêts (3.7)', () => {
    setViewport(1280);
    const { container } = renderNavbar('agency');

    // Baseline OBSERVÉ : structure de la sidebar bureau.
    expect(container.querySelector('.mobile-navbar')).not.toBeNull();
    expect(container.querySelector('.navbar-tabs-container')).not.toBeNull();
    expect(container.querySelector('.sidebar-logo')).not.toBeNull();

    // 5 onglets de base (dont « Prêts ») rendus et atteignables.
    const tabs = container.querySelectorAll('.navbar-tab');
    expect(tabs.length).toBe(5);
  });

  it('mobile (< 900px) : barre inférieure à 5 items avec bouton central spécial (3.9)', () => {
    setViewport(500);
    const { container } = renderNavbar('agency');

    // Baseline OBSERVÉ : barre de navigation inférieure mobile.
    expect(container.querySelector('.mobile-navbar')).not.toBeNull();
    const tabs = container.querySelectorAll('.navbar-tab');
    expect(tabs.length).toBe(5);
    // Le bouton central « Ajouter » est rendu comme bouton spécial.
    expect(container.querySelector('.navbar-tab.special-btn')).not.toBeNull();
  });

  it('CSS bureau : règles de mise en page (sidebar verticale, en-tête, décalage contenu) présentes (3.7)', () => {
    const css = fs.readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8');

    // Baseline OBSERVÉ : la règle bureau passe les onglets en colonne (sidebar)…
    expect(/\.navbar-tabs-container\s*\{[^}]*flex-direction:\s*column/.test(css)).toBe(true);
    // …le contenu est décalé de la largeur de la sidebar…
    expect(/margin-left:\s*240px/.test(css)).toBe(true);
    // …et l'en-tête applicatif est défini.
    expect(/\.app-header\s*\{/.test(css)).toBe(true);
  });
});
