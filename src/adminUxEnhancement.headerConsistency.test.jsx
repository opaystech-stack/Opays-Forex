import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Tests d'EXEMPLE — cohérence de l'en-tête partagé des espaces d'administration
// (spec admin-ux-enhancement, tâche 3.2 — Requirement 1).
//
// Objectif : prouver que les DEUX espaces d'administration (Admin_Console à
// `/admin` et Platform_Admin_Space à `/admin-plateforme`) rendent le MÊME
// en-tête partagé `StandaloneAdminHeader` : mêmes classes, même hiérarchie DOM,
// contrôle « retour » AVANT « déconnexion », et libellés identiques résolus via
// les clés i18n `nav.dashboard` / `access.logout`.
//
// `AdminConsoleScreen` et `PlatformAdminScreen` sont des wrappers internes (non
// exportés) de `src/App.jsx`. On les exerce donc via les vraies routes en
// rendant `<App />`, en reprenant l'approche de mocking de
// `src/adminDesignFix.preservation.test.jsx` :
//   - `./context/AppContext` mocké par un état hoisté `ctx` + `AppProvider`
//     passe-plat ;
//   - `./services/supabase` neutralisé (null) ;
//   - `./i18n` `useT` renvoie la clé (identité, référence stable) ;
//   - l'URL est positionnée sur la route + `?debug_force_demo` pour que les
//     gardes (PrivateRoute / AdminRoute / PlatformEditorRoute) laissent passer.
// ---------------------------------------------------------------------------

// i18n : `t(key) => key` (référence stable via vi.hoisted).
const stableT = vi.hoisted(() => (key) => key);
vi.mock('./i18n', () => ({
  useT: () => stableT,
}));

// Contexte applicatif hoisté ; `AppProvider` est un simple passe-plat.
const ctx = vi.hoisted(() => ({ value: {} }));
vi.mock('./context/AppContext', () => ({
  useApp: () => ctx.value,
  AppProvider: ({ children }) => children,
}));

// Service Supabase neutralisé : rendu déterministe, hors réseau.
vi.mock('./services/supabase', () => ({
  supabase: null,
}));

import App from './App';

// Contexte par défaut couvrant les gardes des deux routes admin.
const makeCtx = (overrides = {}) => ({
  user: { isDemo: true },
  loading: false,
  profilAcces: {},
  isAdmin: () => false,
  isAccessGranted: () => true,
  profileStatus: 'ready',
  hasCredentials: true,
  agencyState: 'active',
  logOut: vi.fn().mockResolvedValue({ success: true }),
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

// Positionne l'URL (route + ?debug_force_demo) avant le rendu pour que les
// gardes synchrones (hasDebugDemo) laissent passer.
const setRoute = (route) => {
  window.history.pushState({}, '', `${route}?debug_force_demo`);
};

// Rend <App /> sur la route donnée et renvoie l'unique `.standalone-header`.
const renderHeaderAt = (route) => {
  setRoute(route);
  ctx.value = makeCtx();
  const { container } = render(<App />);
  const headers = container.querySelectorAll('.standalone-header');
  return { container, headers };
};

beforeEach(() => {
  ctx.value = makeCtx();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Cohérence de l\'en-tête partagé entre les deux espaces admin (Requirement 1)', () => {
  // Vérifie, pour une route donnée, la structure interne de l'en-tête :
  // exactement un contrôle retour et un contrôle déconnexion, retour AVANT
  // déconnexion, libellés résolus via les clés i18n partagées.
  const assertHeaderShape = (header) => {
    const backs = header.querySelectorAll('.standalone-header__back');
    const logouts = header.querySelectorAll('.standalone-header__logout');

    // Req 1.1 / 1.2 : exactement un contrôle retour et un contrôle déconnexion.
    expect(backs.length).toBe(1);
    expect(logouts.length).toBe(1);

    const back = backs[0];
    const logout = logouts[0];

    // Req 1.1 / 1.2 : retour AVANT déconnexion dans l'ordre du DOM.
    const relation = back.compareDocumentPosition(logout);
    expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Req 1.4 / 1.5 / 1.6 : libellés résolus via les clés i18n partagées.
    expect(back.textContent).toContain('nav.dashboard');
    expect(logout.textContent).toContain('access.logout');

    return { back, logout };
  };

  it('Admin_Console (/admin) rend exactement un en-tête partagé bien formé (Req 1.1, 1.4, 1.5, 1.6)', () => {
    const { headers } = renderHeaderAt('/admin');
    expect(headers.length).toBe(1);
    assertHeaderShape(headers[0]);
  });

  it('Platform_Admin_Space (/admin-plateforme) rend exactement un en-tête partagé bien formé (Req 1.2, 1.4, 1.5, 1.6)', () => {
    const { headers } = renderHeaderAt('/admin-plateforme');
    expect(headers.length).toBe(1);
    assertHeaderShape(headers[0]);
  });

  it('les deux espaces rendent un en-tête au markup IDENTIQUE (mêmes classes, même hiérarchie DOM, même ordre) (Req 1.3)', () => {
    const adminConsole = renderHeaderAt('/admin');
    const consoleHeaderHtml = adminConsole.headers[0].outerHTML;
    cleanup();

    const platformAdmin = renderHeaderAt('/admin-plateforme');
    const platformHeaderHtml = platformAdmin.headers[0].outerHTML;

    // Req 1.3 : la même implémentation partagée ⇒ markup byte-for-byte identique
    // (mêmes noms de classes, même hiérarchie d'éléments, même ordre des
    // contrôles), garantissant une expérience cohérente entre les deux espaces.
    expect(consoleHeaderHtml).toBe(platformHeaderHtml);
  });

  it('les libellés retour/déconnexion résolvent vers les MÊMES clés i18n dans les deux espaces (Req 1.5, 1.6)', () => {
    const adminConsole = renderHeaderAt('/admin');
    const c = assertHeaderShape(adminConsole.headers[0]);
    const consoleBackLabel = c.back.textContent;
    const consoleLogoutLabel = c.logout.textContent;
    cleanup();

    const platformAdmin = renderHeaderAt('/admin-plateforme');
    const p = assertHeaderShape(platformAdmin.headers[0]);

    // Req 1.5 : même clé pour le contrôle retour entre les deux espaces.
    expect(c.back.textContent).toBe(p.back.textContent);
    expect(consoleBackLabel).toContain('nav.dashboard');
    // Req 1.6 : même clé pour le contrôle déconnexion entre les deux espaces.
    expect(c.logout.textContent).toBe(p.logout.textContent);
    expect(consoleLogoutLabel).toContain('access.logout');
  });
});
