import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';

// i18n neutralisé : useT renvoie la clé (rendu déterministe et isolé).
// `t` est défini UNE SEULE FOIS via vi.hoisted (référence STABLE) pour éviter
// que les useMemo/useCallback dépendant de `t` ne se ré-exécutent en boucle
// (cf. EspaceAdminPlateforme.test.jsx).
const stableT = vi.hoisted(() => (key) => key);
vi.mock('./i18n', () => ({
  useT: () => stableT,
}));

// État du contexte applicatif, hoisté pour être visible dans vi.mock.
// `ctx.value` est l'objet retourné par useApp ; chaque test peut le reconfigurer
// avant le rendu.
const ctx = vi.hoisted(() => ({ value: {} }));
vi.mock('./context/AppContext', () => ({
  useApp: () => ctx.value,
}));

import EspaceAdminPlateforme from './pages/EspaceAdminPlateforme';

// Valeur de contexte par défaut : la garde interne est passée via `user.isDemo`
// (l'Editeur_Plateforme et le mode démo sont autorisés à explorer l'écran),
// avec un jeu de données structurellement représentatif (Req 6.1, 6.2, 6.3, 6.5).
const makeCtx = (overrides = {}) => ({
  profilAcces: { is_platform_editor: false },
  user: { isDemo: true },
  loading: false,
  platformAgencies: [
    { id: 'a-1', name: 'Agence Alpha', owner_id: 'o-1', state: 'active' },
    { id: 'a-2', name: 'Agence Beta', owner_id: 'o-2', state: 'suspendue' },
  ],
  platformModuleEntitlements: { 'a-1': { transfert_argent: true } },
  transferMethods: [
    { id: 'm-1', label: 'Wave', is_active: true },
    { id: 'm-2', label: 'Orange Money', is_active: false },
  ],
  subscriptionProviders: [
    { id: 'p-1', label: 'Netflix', is_active: true },
    { id: 'p-2', label: 'Spotify', is_active: false },
  ],
  setModuleEntitlement: vi.fn().mockResolvedValue({ success: true }),
  setAgencyState: vi.fn().mockResolvedValue({ success: true }),
  createTransferMethod: vi.fn().mockResolvedValue({ success: true }),
  updateTransferMethod: vi.fn().mockResolvedValue({ success: true }),
  createSubscriptionProvider: vi.fn().mockResolvedValue({ success: true }),
  updateSubscriptionProvider: vi.fn().mockResolvedValue({ success: true }),
  ...overrides,
});

beforeEach(() => {
  ctx.value = makeCtx();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Admin UX Enhancement — Platform_Admin_Space structure (Req 6.1, 6.2, 6.3, 6.5)', () => {
  // ---- Statistiques : .stat-box / .stat-label / .stat-value (Req 6.1) ----

  it('rend chaque statistique dans un .stat-box avec .stat-label et .stat-value chiffré (Req 6.1)', () => {
    const { container } = render(<EspaceAdminPlateforme />);

    const statBoxes = container.querySelectorAll('.stat-box');
    expect(statBoxes.length).toBe(3);

    statBoxes.forEach((box) => {
      const label = box.querySelector('.stat-label');
      const value = box.querySelector('.stat-value');
      expect(label).toBeTruthy();
      expect(label.textContent.trim()).not.toBe('');
      expect(value).toBeTruthy();
      // La valeur est un compte (nombre présent et lisible).
      expect(value.textContent.trim()).not.toBe('');
      expect(Number.isNaN(Number(value.textContent.trim()))).toBe(false);
    });
  });

  // ---- Catalogues : .ledger-list / .ledger-item / .ledger-icon-box (Req 6.2) ----

  it('rend les catalogues en .ledger-list de .ledger-item dotés d\'un .ledger-icon-box (Req 6.2)', () => {
    const { container } = render(<EspaceAdminPlateforme />);

    const ledgerLists = container.querySelectorAll('.ledger-list');
    // Deux catalogues administrables : Methodes_Transfert et Fournisseurs_Abonnement.
    expect(ledgerLists.length).toBe(2);

    const items = container.querySelectorAll('.ledger-list .ledger-item');
    // 2 méthodes + 2 fournisseurs.
    expect(items.length).toBe(4);

    items.forEach((item) => {
      expect(item.querySelector('.ledger-icon-box')).toBeTruthy();
    });
  });

  // ---- Ligne d'Agence : ordre identifiant → propriétaire → état → modules (Req 6.3) ----

  it('présente une ligne d\'Agence dans l\'ordre identifiant → propriétaire → état → modules (Req 6.3)', () => {
    render(<EspaceAdminPlateforme />);

    // Conteneur de la ligne de l'agence active : premier ancêtre bordé.
    const row = screen.getByText('Agence Alpha').closest('div[style*="border"]');
    expect(row).toBeTruthy();

    const text = row.textContent;
    const idxIdentifier = text.indexOf('platform_admin.col_id');
    const idxOwner = text.indexOf('platform_admin.col_owner');
    const idxState = text.indexOf('platform_admin.state_active');
    const idxModules = text.indexOf('platform_admin.col_modules');

    // Tous les segments sont présents…
    expect(idxIdentifier).toBeGreaterThanOrEqual(0);
    expect(idxOwner).toBeGreaterThanOrEqual(0);
    expect(idxState).toBeGreaterThanOrEqual(0);
    expect(idxModules).toBeGreaterThanOrEqual(0);

    // …et apparaissent dans l'ordre attendu identifiant → propriétaire → état → modules.
    expect(idxIdentifier).toBeLessThan(idxOwner);
    expect(idxOwner).toBeLessThan(idxState);
    expect(idxState).toBeLessThan(idxModules);
  });

  // ---- Variantes de badge catalogue : actif → vert, inactif → rouge (Req 6.5) ----

  it('rend l\'entrée de catalogue active avec .badge.badge-success (Req 6.5)', () => {
    const { container } = render(<EspaceAdminPlateforme />);

    const activeItem = within(container)
      .getByText('Wave')
      .closest('.ledger-item');
    expect(activeItem).toBeTruthy();

    const badge = activeItem.querySelector('.badge');
    expect(badge).toBeTruthy();
    expect(badge.classList.contains('badge-success')).toBe(true);
    expect(badge.classList.contains('badge-danger')).toBe(false);
  });

  it('rend l\'entrée de catalogue inactive avec .badge.badge-danger (Req 6.5)', () => {
    const { container } = render(<EspaceAdminPlateforme />);

    const inactiveItem = within(container)
      .getByText('Orange Money')
      .closest('.ledger-item');
    expect(inactiveItem).toBeTruthy();

    const badge = inactiveItem.querySelector('.badge');
    expect(badge).toBeTruthy();
    expect(badge.classList.contains('badge-danger')).toBe(true);
    expect(badge.classList.contains('badge-success')).toBe(false);
  });
});
