import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Tests d'exemple — structure de la liste des Utilisateurs + états du
// Console_Admin (Page_Console_Admin), feature admin-ux-enhancement.
//
// Conventions calquées sur EspaceAdminPlateforme.test.jsx :
//   - `./i18n` `useT` renvoie la clé (identité, référence STABLE via vi.hoisted)
//     pour un rendu déterministe ; `t('admin.col_email')` ⇒ 'admin.col_email'.
//   - `./context/AppContext` `useApp` piloté par un état hoisté (`ctx.value`).
//   - `./services/supabase` exposé via un getter hoisté (`sb.value`) afin de
//     varier entre `null` (loadData ⇒ liste vide synchrone) et un double dont
//     les requêtes restent en attente (loadData ne résout jamais ⇒ état
//     « chargement » figé).
//   - `./utils/adminActions` : seul `buildAdminPage` est surchargé (lève
//     déterministe pour la liste rendue) ; latestProofStatus /
//     DEFAULT_ADMIN_PAGE_SIZE / buildActivationPatch / buildReviewPatch
//     restent réels via importOriginal.
//
// Validates: Requirements 3.1, 3.5, 3.6, 3.7, 5.1, 5.2, 5.3
// ---------------------------------------------------------------------------

const stableT = vi.hoisted(() => (key) => key);
vi.mock('./i18n', () => ({
  useT: () => stableT,
}));

const ctx = vi.hoisted(() => ({ value: { user: { id: 'admin-1' } } }));
vi.mock('./context/AppContext', () => ({
  useApp: () => ctx.value,
}));

// Référence Supabase pilotable par test. Le getter relit `sb.value` à chaque
// accès au binding importé (liaison live ESM).
const sb = vi.hoisted(() => ({ value: null }));
vi.mock('./services/supabase', () => ({
  get supabase() {
    return sb.value;
  },
}));

// `buildAdminPage` surchargé : renvoie les entrées injectées par le test ; les
// autres exports purs sont conservés tels quels.
const adminMock = vi.hoisted(() => ({ entries: [] }));
vi.mock('./utils/adminActions', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    buildAdminPage: vi.fn(() => adminMock.entries),
  };
});

import ConsoleAdmin from './pages/ConsoleAdmin';

// Utilisateur représentatif : accès autorisé + preuve présente (le bouton reçu
// n'est rendu que si une preuve existe).
const sampleEntry = {
  user_id: 'u-1',
  email: 'user@example.com',
  acces_autorise: true,
  latestStatus: 'validee',
  proofs: [
    {
      id: 'p-1',
      user_id: 'u-1',
      submitted_at: '2024-01-01T00:00:00Z',
      recu_path: 'receipts/u-1/p-1.png',
      mode_paiement: 'wave',
      reference: 'REF-1',
      statut: 'validee',
    },
  ],
};

// Double Supabase dont toute requête reste en attente : loadData lance
// Promise.all([...]) qui ne résout jamais ⇒ `loading` demeure `true`.
const makePendingSupabase = () => {
  const pending = new Promise(() => {});
  pending.order = () => pending;
  pending.eq = () => pending;
  const query = { select: () => pending, order: () => pending, eq: () => pending };
  return { from: () => query };
};

beforeEach(() => {
  ctx.value = { user: { id: 'admin-1' } };
  sb.value = null;
  adminMock.entries = [];
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('admin-ux-enhancement — structure de la liste Console_Admin', () => {
  // ---- Utilisateur représentatif : colonnes, badges, actions (Req 3.1, 3.5, 3.6, 3.7) ----
  it('rend e-mail, badge accès, badge statut et actions dans l\'ordre colonne email → accès → statut → actions', async () => {
    sb.value = null; // loadData ⇒ liste vide, le levier est buildAdminPage
    adminMock.entries = [sampleEntry];

    const { container } = render(<ConsoleAdmin />);

    // Attendre le rendu de la ligne (loadData async terminé).
    const table = await waitFor(() => {
      const el = container.querySelector('table.admin-users');
      if (!el) throw new Error('table not rendered yet');
      return el;
    });

    // Ordre des en-têtes : email → accès → statut → actions (Req 3.1).
    const headerLabels = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    expect(headerLabels).toEqual([
      'admin.col_email',
      'admin.col_access',
      'admin.col_status',
      'admin.col_actions',
    ]);

    // E-mail présent (Req 3.1).
    expect(screen.getByText('user@example.com')).toBeTruthy();

    // Badge d'accès présent et libellé (Req 3.5).
    const accessCell = container.querySelector('td[data-label="admin.col_access"]');
    const accessBadge = accessCell.querySelector('.badge');
    expect(accessBadge).toBeTruthy();
    expect(accessBadge.textContent.trim()).toBe('admin.access_granted');

    // Badge de statut présent et libellé (Req 3.6).
    const statusCell = container.querySelector('td[data-label="admin.col_status"]');
    const statusBadge = statusCell.querySelector('.badge');
    expect(statusBadge).toBeTruthy();
    expect(statusBadge.textContent.trim()).toBe('admin.status_validee');

    // Actions présentes, chacune un .btn doté d'un nom accessible (Req 3.7).
    const actionCell = container.querySelector('td[data-label="admin.col_actions"]');
    const actionButtons = [...actionCell.querySelectorAll('button.btn')];
    expect(actionButtons.length).toBeGreaterThanOrEqual(2);
    actionButtons.forEach((btn) => {
      const accessibleName = (btn.getAttribute('aria-label') || btn.textContent).trim();
      expect(accessibleName.length).toBeGreaterThan(0);
    });

    // Le bouton reçu expose l'aria-label `admin.view_proof` et est un .btn (Req 3.7).
    const receiptButton = screen.getByLabelText('admin.view_proof');
    expect(receiptButton).toBeTruthy();
    expect(receiptButton.classList.contains('btn')).toBe(true);
  });

  // ---- État chargement : uniquement l'indicateur (Req 5.1, 5.2, 5.3) ----
  it('affiche uniquement l\'indicateur de chargement (loading.data), ni table ni état vide', () => {
    sb.value = makePendingSupabase(); // requêtes en attente ⇒ loading figé à true
    adminMock.entries = [];

    const { container } = render(<ConsoleAdmin />);

    // Indicateur de chargement présent.
    expect(screen.getByText('loading.data')).toBeTruthy();
    // Ni table, ni message d'état vide.
    expect(container.querySelector('table.admin-users')).toBeNull();
    expect(screen.queryByText('admin.empty')).toBeNull();
  });

  // ---- Chargé-vide : uniquement le message d'état vide (Req 5.1, 5.2, 5.3) ----
  it('affiche uniquement le message d\'état vide (admin.empty), pas la table', async () => {
    sb.value = null; // loadData ⇒ liste vide, loading=false
    adminMock.entries = [];

    const { container } = render(<ConsoleAdmin />);

    await waitFor(() => {
      expect(screen.getByText('admin.empty')).toBeTruthy();
    });

    // Pas de table ; pas d'indicateur de chargement.
    expect(container.querySelector('table.admin-users')).toBeNull();
    expect(screen.queryByText('loading.data')).toBeNull();
  });

  // ---- Chargé-avec-utilisateurs : uniquement la table (Req 5.1, 5.2, 5.3) ----
  it('affiche uniquement la table, ni indicateur de chargement ni message vide', async () => {
    sb.value = null;
    adminMock.entries = [sampleEntry];

    const { container } = render(<ConsoleAdmin />);

    await waitFor(() => {
      expect(container.querySelector('table.admin-users')).toBeTruthy();
    });

    // Ni chargement, ni état vide.
    expect(screen.queryByText('loading.data')).toBeNull();
    expect(screen.queryByText('admin.empty')).toBeNull();
  });
});
