import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import fc from 'fast-check';

// i18n neutralisé : useT renvoie la clé (rendu déterministe et isolé).
// Référence STABLE via vi.hoisted pour éviter de relancer les useCallback
// dépendant de `t` (cf. EspaceAdminPlateforme.test.jsx / VoiceAgentModal.test.jsx).
// Avec l'identité, `t('admin.status_validee')` renvoie la clé `admin.status_validee`,
// qui diffère du code de statut brut `validee` — c'est le libellé résolu rendu.
const stableT = vi.hoisted(() => (key) => key);
vi.mock('./i18n', () => ({
  useT: () => stableT,
}));

// Contexte applicatif mocké : un Administrateur identifié.
vi.mock('./context/AppContext', () => ({
  useApp: () => ({ user: { id: 'admin-1' } }),
}));

// Supabase indisponible : loadData retombe sur une liste vide, l'injection de
// l'entrée Utilisateur se fait via le mock de `buildAdminPage` ci-dessous.
vi.mock('./services/supabase', () => ({ supabase: null }));

// Entrée Utilisateur injectée de façon déterministe : `buildAdminPage` est
// surchargé pour renvoyer l'entrée générée par fast-check, en conservant les
// autres exports purs (latestProofStatus, patchs, taille de page) intacts.
const adminMock = vi.hoisted(() => ({ entry: null }));
vi.mock('./utils/adminActions', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    buildAdminPage: () => (adminMock.entry ? [adminMock.entry] : []),
  };
});

import ConsoleAdmin from './pages/ConsoleAdmin';

afterEach(() => {
  cleanup();
  adminMock.entry = null;
  vi.clearAllMocks();
});

// Domaine des statuts de preuve : null (aucune preuve), les trois statuts connus,
// et une chaîne arbitraire (statut inconnu) — couvre l'espace d'entrée complet.
const statusArb = fc.oneof(
  fc.constant(null),
  fc.constantFrom('en_attente', 'validee', 'rejetee'),
  fc.string(),
);

const blank = (text) => text == null || String(text).trim().length === 0;

describe('admin-ux-enhancement — libellés des badges (Console_Admin)', () => {
  // Feature: admin-ux-enhancement, Property 1: Every access/status state renders a non-empty text label
  // Validates: Requirements 3.2, 3.3, 3.4, 7.5
  it('chaque état accès/statut rend un libellé texte non vide et non brut', async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), statusArb, async (access, status) => {
        adminMock.entry = {
          user_id: 'u-1',
          email: 'user@example.com',
          acces_autorise: access,
          latestStatus: status,
          proofs: [],
        };

        const { container, unmount } = render(<ConsoleAdmin />);
        try {
          // Attend que la ligne Utilisateur soit rendue (loadData async terminé).
          const accessCell = await waitFor(() => {
            const cell = container.querySelector('td[data-label="admin.col_access"]');
            if (!cell) throw new Error('row not rendered yet');
            return cell;
          });
          const statusCell = container.querySelector('td[data-label="admin.col_status"]');

          const accessBadge = accessCell.querySelector('.badge');
          const statusBadge = statusCell.querySelector('.badge');

          // Les deux badges existent et portent un libellé texte non vide / non blanc.
          expect(accessBadge).toBeTruthy();
          expect(statusBadge).toBeTruthy();
          expect(blank(accessBadge.textContent)).toBe(false);
          expect(blank(statusBadge.textContent)).toBe(false);

          // Le badge de statut affiche le libellé résolu, jamais le code brut.
          expect(statusBadge.textContent.trim()).not.toBe(status);
        } finally {
          unmount();
        }
      }),
      { numRuns: 100 },
    );
  }, 60000);
});
