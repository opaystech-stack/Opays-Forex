// =============================================================================
// Regression — Accès "Admin Agence" via isAdmin contextuel (Bug A)
// -----------------------------------------------------------------------------
// Ces tests verrouillent le comportement du wrapper `isAdmin` exposé par
// AppContext, pour empêcher toute régression du Bug A :
//
//   AVANT : `isAdmin` était la fonction PURE de accessControl.js, qui n'accepte
//   que `profile.role === 'admin'` et retourne `false` si elle est appelée SANS
//   argument. Comme l'UI appelle `isAdmin()` (sans profil) dans Navbar.jsx et
//   App.jsx, et qu'en base le rôle des créateurs d'agence est `agency_admin` ou
//   `superadmin`, l'option "Admin Agence" ne s'affichait JAMAIS.
//
//   APRÈS : `isAdmin` est un wrapper contextuel (useCallback) qui reconnait
//   `superadmin` / `agency_admin` (user.role), `proprietaire` (currentRole),
//   `profilAcces.role === 'admin'` (rétro-compat) et le mode démo. Il est
//   appelable sans argument (`isAdmin()`) ou avec un profil (`isAdmin(p)`).
//
// Conventions du dépôt (cf. authAccessMobileFixes.exploration.test.jsx) :
//   - jsdom + Vitest + @testing-library/react ;
//   - backend réseau (fetch) SIMULÉ ;
//   - `VITE_DATA_BACKEND=api` force le chemin primaire de production.
// =============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act, cleanup } from '@testing-library/react';
import { AppProvider, useApp } from './context/AppContext';

// ---------------------------------------------------------------------------
// Doubles de `fetch` (cookie JWT httpOnly simulé par les réponses serveur).
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

// Installe un double de `global.fetch` routé par sous-chemin d'URL. Les routes
// secondaires retournent un succès vide tolérant pour ne pas casser fetchData.
function installMeResponse(user) {
  global.fetch = vi.fn(async (url) => {
    if (String(url).includes('/auth/me')) {
      if (!user) return jsonResponse({ error: 'unauthorized' }, 401);
      return jsonResponse({ success: true, user });
    }
    // Lectures secondaires (wallets, transactions, agence courante, etc.).
    return jsonResponse({ success: true, data: [] });
  });
}

const wrapper = ({ children }) => <AppProvider>{children}</AppProvider>;

beforeEach(() => {
  // Force le chemin primaire de production : API Fastify (cookie JWT httpOnly).
  vi.stubEnv('VITE_DATA_BACKEND', 'api');
  // Pas d'identifiants Supabase : on reste hors du chemin démo/Supabase.
  vi.stubEnv('VITE_SUPABASE_URL', '');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  delete global.fetch;
});

// =============================================================================
// Cas 1 — RÔLE SERVEUR (la cause racine réelle du bug en production)
// =============================================================================

describe('Bug A — isAdmin reconnait les rôles serveur agency_admin / superadmin', () => {
  it('agency_admin (créateur d\'agence en base) => isAdmin() === true', async () => {
    installMeResponse({
      id: 'u1',
      email: 'owner@agence.cd',
      role: 'agency_admin', // rôle réel en base (≠ 'admin')
      agencyId: 'a1',
      isActive: true,
    });

    const { result } = renderHook(() => useApp(), { wrapper });

    // Le wrapper DOIT renvoyer vrai SANS qu'aucun profil ne soit passé en
    // argument (c'est précisément l'appel `isAdmin()` fait dans Navbar.jsx).
    await waitFor(() => expect(result.current.isAdmin()).toBe(true), { timeout: 6000 });
  });

  it('superadmin => isAdmin() === true', async () => {
    installMeResponse({
      id: 'u2',
      email: 'root@opays.io',
      role: 'superadmin',
      agencyId: 'a1',
      isActive: true,
    });

    const { result } = renderHook(() => useApp(), { wrapper });
    await waitFor(() => expect(result.current.isAdmin()).toBe(true), { timeout: 6000 });
  });

  it('un rôle utilisateur ordinaire => isAdmin() === false', async () => {
    installMeResponse({
      id: 'u3',
      email: 'staff@agence.cd',
      role: 'user', // ni admin, ni agency_admin, ni superadmin
      agencyId: 'a1',
      isActive: true,
    });

    const { result } = renderHook(() => useApp(), { wrapper });
    // On attend d'abord que l'utilisateur soit restauré, puis on asserte false.
    await waitFor(() => expect(result.current.user?.id).toBe('u3'), { timeout: 6000 });
    expect(result.current.isAdmin()).toBe(false);
  });
});

// =============================================================================
// Cas 2 — RÉTRO-COMPATIBILITÉ : appel explicite avec un profil (AdminRoute)
// =============================================================================
// App.jsx:AdminRoute appelle `isAdmin(profilAcces)`. La signature tolérante
// doit continuer à honorer un profil dont `role === 'admin'`.
// =============================================================================

describe('Bug A — isAdmin(profile) reste rétro-compatible', () => {
  it('un profil { role: "admin" } passé en argument => true (même pour un user ordinaire)', async () => {
    installMeResponse({
      id: 'u4',
      email: 'staff@agence.cd',
      role: 'user',
      agencyId: 'a1',
      isActive: true,
    });

    const { result } = renderHook(() => useApp(), { wrapper });
    await waitFor(() => expect(result.current.user?.id).toBe('u4'), { timeout: 6000 });

    // L'argument profil prime : role 'admin' est reconnu par la fonction pure.
    expect(result.current.isAdmin({ role: 'admin' })).toBe(true);
    // Sans cet argument, l'utilisateur ordinaire n'est PAS admin.
    expect(result.current.isAdmin()).toBe(false);
  });
});

// =============================================================================
// Cas 3 — MODE DÉMO : la console reste accessible en démo locale
// =============================================================================

describe('Bug A — isAdmin autorise le mode démo', () => {
  it('loginAsDemo() => isAdmin() === true (accès à la console en local)', async () => {
    // Aucun cookie : pas d'utilisateur restauré (401).
    installMeResponse(null);

    const { result } = renderHook(() => useApp(), { wrapper });
    await waitFor(() => expect(result.current.user).toBe(null), { timeout: 6000 });

    // Bascule en mode démo (déclenche la réévaluation via useCallback). On
    // enveloppe la mutation d'état dans act() pour éviter l'avertissement React.
    await act(async () => {
      result.current.loginAsDemo();
    });
    await waitFor(() => expect(result.current.isAdmin()).toBe(true), { timeout: 6000 });
  });
});
