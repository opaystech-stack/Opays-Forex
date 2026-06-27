import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';

// i18n neutralisé : on retourne la clé pour un rendu isolé et déterministe.
vi.mock('./i18n', () => ({
  useT: () => (key) => key,
}));

// État d'authentification contrôlé pour piloter la garde de route.
const mockState = {
  user: null,
  loading: false,
  hasCredentials: true,
  isUsingMock: false,
};

// On neutralise le contexte applicatif : AppProvider devient passe-plat et
// useApp renvoie l'état contrôlé ci-dessus (R2.3).
vi.mock('./context/AppContext', () => ({
  AppProvider: ({ children }) => children,
  useApp: () => mockState,
}));

import App from './App';

describe('App — garde d\'authentification PrivateRoute (R2.3)', () => {
  beforeEach(() => {
    mockState.user = null;
    mockState.loading = false;
    mockState.hasCredentials = true;
  });

  afterEach(() => {
    cleanup();
  });

  it('redirige /app/* vers /login en l\'absence d\'utilisateur connecté', async () => {
    // Supabase configuré (hasCredentials), aucun utilisateur connecté.
    window.history.pushState({}, '', '/app/dashboard');

    render(<App />);

    await waitFor(() => {
      expect(window.location.pathname).toBe('/login');
    });
  });

  it('n\'effectue pas la redirection pendant le chargement de session', async () => {
    mockState.loading = true;
    window.history.pushState({}, '', '/app/dashboard');

    render(<App />);

    // Tant que la session se charge, on reste sur /app/* (écran de chargement).
    await waitFor(() => {
      expect(window.location.pathname).toBe('/app/dashboard');
    });
  });
});
