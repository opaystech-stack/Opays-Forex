// =============================================================================
// auth-access-mobile-fixes — Tests d'EXPLORATION de la condition de bug (Tâche 1)
// -----------------------------------------------------------------------------
// Property 1 (Bug Condition) — Ces tests encodent le COMPORTEMENT ATTENDU
// (Propriétés 1 à 5 du design) sur le chemin primaire de production
// (API Fastify, `isApiBackend === true`).
//
// IMPORTANT (méthodologie bugfix) :
//   - Ces tests DOIVENT ÉCHOUER sur le code NON corrigé : l'échec confirme
//     l'existence des cinq zones de défauts (Z1..Z5).
//   - Ils PASSERONT une fois la correction appliquée (tâche 3.6).
//   - On NE corrige NI le code NI les tests ici.
//
// Conventions du dépôt (cf. adminDesignFix.*.test.jsx) :
//   - jsdom + Vitest + @testing-library/react + fast-check ;
//   - PAS de matchers jest-dom : on utilise toBe / toBeNull / not.toBeNull /
//     toBeTruthy et des requêtes DOM directes ;
//   - le backend réseau (fetch), GIS et le cookie de session sont SIMULÉS ;
//   - `src/services/supabase.js` n'est jamais modifié (chemin démo/repli).
//
// Approche PBT « scopée » : ces bugs sont déterministes et pilotés par
// l'environnement. On scope chaque propriété au(x) cas concret(s) reproductible(s)
// et on génère sur les axes pertinents quand c'est utile (Z4 : `created_at`
// variés et état payant/non payant).
// =============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, renderHook, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import fc from 'fast-check';
import fs from 'node:fs';
import path from 'node:path';

import { AppProvider, useApp } from './context/AppContext';
import { isAccessGranted } from './utils/accessControl';
import SignUp from './pages/SignUp';
import WhatsAppFab from './components/WhatsAppFab';

// ---------------------------------------------------------------------------
// Outils communs : double de `fetch` (cookie JWT httpOnly simulé par les
// réponses du serveur) et stub d'environnement pour forcer `isApiBackend`.
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
// `routes` : { matcher(url, opts) -> response | throw }. Un défaut tolérant
// renvoie `{ success: true, data: [] }` pour les lectures secondaires.
function installFetch(router) {
  const fn = vi.fn(async (url, opts) => router(String(url), opts));
  global.fetch = fn;
  return fn;
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
  // Nettoyage GIS (Z2).
  try { delete window.google; } catch { /* no-op */ }
});

// =============================================================================
// Z1 — Persistance de session sur le chemin API (mobile et PC)
// Property 1 : un cookie de session valide DOIT restaurer la session lors d'un
// rafraîchissement ; une défaillance réseau TRANSITOIRE (en ligne) ne DOIT PAS
// détruire la session (pas de redirection /login). Seul un 401 confirmé déconnecte.
// **Validates: Requirements 2.1, 2.2**
// =============================================================================
describe('Z1 — Restauration de session (chemin API Fastify)', () => {
  it('une défaillance réseau transitoire sur /api/auth/me ne déconnecte pas un utilisateur au cookie valide', async () => {
    const validUser = {
      id: 'u1',
      email: 'op@agence.cd',
      role: 'user',
      agencyId: 'a1',
      isActive: true,
    };

    // navigator.onLine = true (défaut jsdom) : on est EN LIGNE, mais le premier
    // appel à /api/auth/me échoue de façon transitoire (course SW / réseau
    // mobile instable servant un shell sans session). Les appels suivants
    // réussissent (le cookie JWT est valide).
    let meCalls = 0;
    installFetch((url) => {
      if (url.includes('/auth/me')) {
        meCalls += 1;
        if (meCalls === 1) {
          // Erreur de niveau réseau (et NON un 401) : fetch rejette.
          throw new TypeError('Failed to fetch');
        }
        return jsonResponse({ success: true, user: validUser });
      }
      // Lectures secondaires tolérantes.
      return jsonResponse({ success: true, data: [] });
    });

    const { result } = renderHook(() => useApp(), { wrapper });

    // Comportement attendu (corrigé) : la session est restaurée malgré l'aléa
    // réseau transitoire ; l'utilisateur reste authentifié (aucune redirection).
    await waitFor(
      () => expect(result.current.user?.id).toBe('u1'),
      { timeout: 6000 },
    );
  });
});

// =============================================================================
// Z2 — Authentification Google sans blocage (mobile)
// Property 2 : le flux GIS DOIT se résoudre de façon DÉTERMINISTE même si la
// pop-up est bloquée (succès OU erreur explicite, jamais de spinner infini).
// **Validates: Requirements 2.3, 2.4**
// =============================================================================
describe('Z2 — Authentification Google (mobile, pop-up bloquée)', () => {
  it('signInWithGoogle se résout même quand requestAccessToken n\'invoque jamais le callback', async () => {
    // GIS préchargé : initTokenClient renvoie un client dont requestAccessToken
    // NE déclenche JAMAIS le callback (cas pop-up bloquée par le navigateur).
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: () => ({ requestAccessToken: () => { /* pop-up bloquée : aucun callback */ } }),
        },
      },
    };

    installFetch((url) => {
      if (url.includes('/auth/me')) return jsonResponse({ error: 'unauthorized' }, 401);
      return jsonResponse({ success: true, data: [] });
    });

    const { result } = renderHook(() => useApp(), { wrapper });
    await waitFor(() => expect(result.current.user).toBe(null));

    // La Promise de signInWithGoogle doit se résoudre d'elle-même. On la met en
    // course avec un délai de sécurité : si le délai gagne, c'est un blocage.
    const TIMEOUT = Symbol('infinite-spinner');
    const winner = await Promise.race([
      result.current.signInWithGoogle(),
      new Promise((res) => setTimeout(() => res(TIMEOUT), 1500)),
    ]);

    // Comportement attendu (corrigé) : résolution déterministe (≠ blocage).
    expect(winner).not.toBe(TIMEOUT);
  });
});

// =============================================================================
// Z3 — Inscription classique : connexion directe (pas d'écran de confirmation)
// Property 3 : en mode API, une inscription réussie (cookie posé par le serveur)
// DOIT rediriger vers /app SANS écran bloquant de confirmation d'e-mail.
// **Validates: Requirements 2.5, 2.6**
// =============================================================================
describe('Z3 — Inscription classique (mode API)', () => {
  it('redirige vers /app après une inscription réussie, sans écran de confirmation', async () => {
    installFetch((url, opts) => {
      if (url.includes('/auth/register')) {
        // Le serveur Fastify pose le cookie de session et renvoie le succès.
        // (Réponse réaliste : la session est portée par le cookie httpOnly.)
        return jsonResponse({ success: true });
      }
      if (url.includes('/auth/me')) return jsonResponse({ error: 'unauthorized' }, 401);
      return jsonResponse({ success: true, data: [] });
    });

    window.history.pushState({}, '', '/register');

    const { container } = render(
      <BrowserRouter>
        <AppProvider>
          <Routes>
            <Route path="/register" element={<SignUp />} />
            <Route path="/app" element={<div>ZONE_APP_MARKER</div>} />
          </Routes>
        </AppProvider>
      </BrowserRouter>,
    );

    // Renseigne les champs requis du formulaire d'inscription.
    const textInputs = container.querySelectorAll('input[type="text"]');
    fireEvent.change(textInputs[0], { target: { value: 'Awa Operatrice' } }); // nom complet
    fireEvent.change(textInputs[1], { target: { value: 'Agence Goma' } });    // nom agence
    fireEvent.change(container.querySelector('input[type="email"]'), {
      target: { value: 'awa@agence.cd' },
    });
    const pwInputs = container.querySelectorAll('input[type="password"]');
    fireEvent.change(pwInputs[0], { target: { value: 'motdepasse123' } });
    fireEvent.change(pwInputs[1], { target: { value: 'motdepasse123' } });
    fireEvent.click(container.querySelector('input[type="checkbox"]')); // CGU

    fireEvent.submit(container.querySelector('form'));

    // Comportement attendu (corrigé) : navigation directe vers /app.
    await waitFor(
      () => expect(document.body.textContent).toContain('ZONE_APP_MARKER'),
      { timeout: 4000 },
    );
  });
});

// =============================================================================
// Z4 — Essai 30 jours imposé côté serveur (non falsifiable)
// Property 4 : la décision d'accès DOIT refléter le verdict serveur calculé sur
// `created_at` : accès libre si < 30 j, bloqué si >= 30 j sans accès payant.
// **Validates: Requirements 2.7, 2.8**
//
// PBT scopée : on génère l'âge du compte (`daysAgo`) et l'état payant, et on
// asserte que la décision d'accès = (payant OU daysAgo < 30), telle que le
// serveur la renvoie via `accessGranted` dans /api/auth/me.
// =============================================================================
describe('Z4 — Période d\'essai 30 jours (autorité serveur)', () => {
  it('l\'accès suit le verdict serveur (libre < 30 j ; bloqué >= 30 j sans paiement)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 120 }), // âge du compte en jours
        fc.boolean(),                      // accès payant accordé ?
        async (daysAgo, paid) => {
          const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
          // Verdict d'essai calculé CÔTÉ SERVEUR (autorité non falsifiable).
          const serverAccessGranted = paid || daysAgo < 30;

          installFetch((url) => {
            if (url.includes('/auth/me')) {
              return jsonResponse({
                success: true,
                user: {
                  id: 'u-trial',
                  email: 'trial@agence.cd',
                  role: 'user',
                  agencyId: 'a1',
                  isActive: true,
                  createdAt,
                  // Champs additifs exposés par le serveur corrigé :
                  accessGranted: serverAccessGranted,
                  paidAccess: paid,
                  trialActive: daysAgo < 30,
                },
              });
            }
            return jsonResponse({ success: true, data: [] });
          });

          const { result } = renderHook(() => useApp(), { wrapper });
          await waitFor(() => expect(result.current.profileStatus).toBe('ready'), { timeout: 4000 });

          // Comportement attendu (corrigé) : le client REFLÈTE le verdict serveur.
          expect(isAccessGranted(result.current.profilAcces)).toBe(serverAccessGranted);

          cleanup();
        },
      ),
      { numRuns: 12 },
    );
  });
});

// =============================================================================
// Z5 — Mise en page mobile/PC accessible
// Property 5 : FAB WhatsApp ancré en bas à droite (NON piégé par un ancêtre
// transformé) ; sidebar PC défilable (Prêts atteignables).
// **Validates: Requirements 2.9, 2.10, 2.11, 2.12**
// =============================================================================
describe('Z5 — Mise en page (FAB WhatsApp & sidebar PC)', () => {
  it('le FAB WhatsApp n\'est pas piégé dans un ancêtre transformé (échappe via portail)', () => {
    const { container } = render(
      <div className="transformed-ancestor" style={{ transform: 'translateZ(0)' }}>
        <WhatsAppFab pendingCount={3} onClick={() => {}} />
      </div>,
    );

    // Comportement attendu (corrigé) : le FAB est rendu hors de l'ancêtre
    // transformé (portail vers <body>) afin que `position: fixed` soit ancré au
    // viewport (bas à droite) et non au bloc conteneur de l'ancêtre.
    const trapped = container.querySelector('.transformed-ancestor .whatsapp-fab');
    expect(trapped).toBeNull();

    const fab = document.querySelector('.whatsapp-fab');
    expect(fab).not.toBeNull();
  });

  it('la sidebar PC (.navbar-tabs-container) est défilable pour atteindre les Prêts', () => {
    const css = fs.readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8');

    // Règle desktop (colonne verticale) de la liste d'onglets de la sidebar.
    const match = css.match(/\.navbar-tabs-container\s*\{([^}]*flex-direction:\s*column[^}]*)\}/);
    expect(match).not.toBeNull();
    const body = match ? match[1] : '';

    // Comportement attendu (corrigé) : conteneur réellement défilable
    // (overflow) ET capable de borner sa hauteur (flex:1 / min-height:0) pour
    // que les derniers onglets (Prêts) restent atteignables.
    expect(/overflow/.test(body)).toBe(true);
    expect(/flex:\s*1|min-height:\s*0/.test(body)).toBe(true);
  });
});
