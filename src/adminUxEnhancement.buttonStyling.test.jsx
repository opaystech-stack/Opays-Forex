import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Tests d'exemple — cohérence du style des boutons (Bouton_Action), feature
// admin-ux-enhancement (Task 9.2).
//
// Couvre les deux espaces d'administration :
//   - ConsoleAdmin (Page_Console_Admin) — actions activer/désactiver, voir-reçu,
//     valider/rejeter une preuve.
//   - EspaceAdminPlateforme (Espace_Administration_Plateforme) — boutons
//     « Ajouter » des catalogues (action primaire de confirmation), suspension
//     /réactivation d'agence (action secondaire/destructive).
//
// Conventions de mock calquées sur consoleAdminStructure.test.jsx et
// platformStructure.test.jsx :
//   - `./i18n` `useT` renvoie la clé (identité, référence STABLE via vi.hoisted).
//   - `./context/AppContext` `useApp` piloté par un état hoisté.
//   - `./services/supabase` exposé via un getter hoisté.
//   - `./utils/adminActions` : seul `buildAdminPage` est surchargé pour rendre
//     les entrées injectées ; les autres exports purs restent réels.
//
// Assertions de style :
//   - Req 8.1 : actions primaires de confirmation portent `.btn` + `.btn-primary`
//     (boutons « Ajouter » des catalogues d'EspaceAdminPlateforme).
//   - Req 8.2 : actions secondaires/destructives portent `.btn` + `.btn-outline`
//     (activer/désactiver et voir-reçu du Console_Admin ; suspendre/réactiver
//     une agence).
//   - Req 8.3 : actions destructives/négatives dérivent l'accent de `--color-red`
//     (bouton désactiver en état accès accordé ; bouton rejeter-preuve).
//   - Req 8.4 : actions positives/de confirmation dérivent l'accent de
//     `--color-green` (bouton activer en état accès révoqué ; bouton valider-preuve).
//   - Req 8.5 : les boutons conservent la classe de base `.btn` (les états
//     hover/focus-visible proviennent des primitives).
//
// Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5
// ---------------------------------------------------------------------------

const stableT = vi.hoisted(() => (key) => key);
vi.mock('./i18n', () => ({
  useT: () => stableT,
}));

const ctx = vi.hoisted(() => ({ value: { user: { id: 'admin-1' } } }));
vi.mock('./context/AppContext', () => ({
  useApp: () => ctx.value,
}));

const sb = vi.hoisted(() => ({ value: null }));
vi.mock('./services/supabase', () => ({
  get supabase() {
    return sb.value;
  },
}));

const adminMock = vi.hoisted(() => ({ entries: [] }));
vi.mock('./utils/adminActions', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    buildAdminPage: vi.fn(() => adminMock.entries),
  };
});

import ConsoleAdmin from './pages/ConsoleAdmin';
import EspaceAdminPlateforme from './pages/EspaceAdminPlateforme';

// --- Données Console_Admin -------------------------------------------------

const makeProof = (overrides = {}) => ({
  id: 'p-1',
  user_id: 'u-1',
  submitted_at: '2024-01-01T00:00:00Z',
  recu_path: 'receipts/u-1/p-1.png',
  mode_paiement: 'wave',
  reference: 'REF-1',
  statut: 'validee',
  ...overrides,
});

// Entrée accès accordé (rend le bouton « désactiver », accent rouge).
const grantedEntry = {
  user_id: 'u-1',
  email: 'granted@example.com',
  acces_autorise: true,
  latestStatus: 'validee',
  proofs: [makeProof({ id: 'p-1', user_id: 'u-1' })],
};

// Entrée accès révoqué (rend le bouton « activer », accent vert).
const revokedEntry = {
  user_id: 'u-2',
  email: 'revoked@example.com',
  acces_autorise: false,
  latestStatus: 'en_attente',
  proofs: [makeProof({ id: 'p-2', user_id: 'u-2', statut: 'en_attente' })],
};

// --- Données EspaceAdminPlateforme -----------------------------------------

const makePlatformCtx = (overrides = {}) => ({
  profilAcces: { is_platform_editor: false },
  // Garde interne passée via user.isDemo = true.
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
  ctx.value = { user: { id: 'admin-1' } };
  sb.value = null;
  adminMock.entries = [];
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Petite aide : récupère un bouton du Console_Admin par son libellé textuel
// (l'identité i18n rend la clé telle quelle).
const findButtonByText = (container, text) =>
  [...container.querySelectorAll('button.btn')].find((b) =>
    b.textContent.includes(text),
  );

describe('admin-ux-enhancement — cohérence du style des boutons (Req 8)', () => {
  // ======================================================================
  // Req 8.1 — actions primaires de confirmation : .btn + .btn-primary
  // ======================================================================
  describe('EspaceAdminPlateforme — boutons « Ajouter » des catalogues (Req 8.1)', () => {
    it('les boutons « Ajouter » (méthode et fournisseur) portent .btn et .btn-primary', () => {
      ctx.value = makePlatformCtx();
      const { container } = render(<EspaceAdminPlateforme />);

      const addButtons = [...container.querySelectorAll('button.btn')].filter(
        (b) =>
          b.textContent.includes('platform_admin.add_method') ||
          b.textContent.includes('platform_admin.add_provider'),
      );

      // Deux catalogues administrables ⇒ deux boutons « Ajouter ».
      expect(addButtons.length).toBe(2);

      addButtons.forEach((btn) => {
        expect(btn.classList.contains('btn')).toBe(true); // Req 8.5
        expect(btn.classList.contains('btn-primary')).toBe(true); // Req 8.1
        // Une action primaire n'est pas une variante outline.
        expect(btn.classList.contains('btn-outline')).toBe(false);
      });
    });
  });

  // ======================================================================
  // Req 8.2 — actions secondaires/destructives : .btn + .btn-outline
  // ======================================================================
  describe('Actions secondaires/destructives : .btn + .btn-outline (Req 8.2)', () => {
    it('ConsoleAdmin — activer/désactiver et voir-reçu portent .btn + .btn-outline', async () => {
      sb.value = null;
      adminMock.entries = [grantedEntry, revokedEntry];

      const { container } = render(<ConsoleAdmin />);

      await waitFor(() => {
        if (!container.querySelector('table.admin-users')) {
          throw new Error('table not rendered yet');
        }
      });

      // Désactiver (entrée accès accordé) et activer (entrée accès révoqué).
      const deactivateBtn = findButtonByText(container, 'admin.deactivate');
      const activateBtn = findButtonByText(container, 'admin.activate');
      expect(deactivateBtn).toBeTruthy();
      expect(activateBtn).toBeTruthy();

      [deactivateBtn, activateBtn].forEach((btn) => {
        expect(btn.classList.contains('btn')).toBe(true); // Req 8.5
        expect(btn.classList.contains('btn-outline')).toBe(true); // Req 8.2
        expect(btn.classList.contains('btn-primary')).toBe(false);
      });

      // Voir-reçu (icône FileText) : action secondaire en .btn + .btn-outline.
      const receiptButtons = screen.getAllByLabelText('admin.view_proof');
      expect(receiptButtons.length).toBeGreaterThanOrEqual(1);
      receiptButtons.forEach((btn) => {
        expect(btn.classList.contains('btn')).toBe(true); // Req 8.5
        expect(btn.classList.contains('btn-outline')).toBe(true); // Req 8.2
      });
    });

    it('EspaceAdminPlateforme — suspendre/réactiver une agence porte .btn + .btn-outline', () => {
      ctx.value = makePlatformCtx();
      const { container } = render(<EspaceAdminPlateforme />);

      // Bouton d'état de l'agence active (suspendre).
      const suspendBtn = findButtonByText(container, 'platform_admin.suspend');
      // Bouton d'état de l'agence suspendue (réactiver).
      const reactivateBtn = findButtonByText(container, 'platform_admin.reactivate');

      expect(suspendBtn).toBeTruthy();
      expect(reactivateBtn).toBeTruthy();

      [suspendBtn, reactivateBtn].forEach((btn) => {
        expect(btn.classList.contains('btn')).toBe(true); // Req 8.5
        expect(btn.classList.contains('btn-outline')).toBe(true); // Req 8.2
        expect(btn.classList.contains('btn-primary')).toBe(false);
      });
    });
  });

  // ======================================================================
  // Req 8.3 — actions destructives/négatives : accent dérivé de --color-red
  // ======================================================================
  describe('Accent rouge (--color-red) pour les actions destructives (Req 8.3)', () => {
    it('ConsoleAdmin — bouton désactiver (accès accordé) utilise var(--color-red)', async () => {
      sb.value = null;
      adminMock.entries = [grantedEntry];

      const { container } = render(<ConsoleAdmin />);
      await waitFor(() => {
        if (!container.querySelector('table.admin-users')) {
          throw new Error('table not rendered yet');
        }
      });

      const deactivateBtn = findButtonByText(container, 'admin.deactivate');
      expect(deactivateBtn).toBeTruthy();
      expect(deactivateBtn.style.color).toBe('var(--color-red)');
      expect(deactivateBtn.style.borderColor).toBe('var(--color-red)');
    });

    it('ConsoleAdmin — bouton rejeter-preuve utilise var(--color-red)', async () => {
      sb.value = null;
      adminMock.entries = [grantedEntry];

      const { container } = render(<ConsoleAdmin />);
      await waitFor(() => {
        if (!container.querySelector('table.admin-users')) {
          throw new Error('table not rendered yet');
        }
      });

      // Ouvrir le détail de la preuve pour révéler valider/rejeter.
      const receiptBtn = screen.getByLabelText('admin.view_proof');
      fireEvent.click(receiptBtn);

      const rejectBtn = await waitFor(() => {
        const b = findButtonByText(container, 'admin.reject_proof');
        if (!b) throw new Error('reject button not rendered yet');
        return b;
      });

      expect(rejectBtn.style.color).toBe('var(--color-red)');
      expect(rejectBtn.style.borderColor).toBe('var(--color-red)');
    });
  });

  // ======================================================================
  // Req 8.4 — actions positives/de confirmation : accent dérivé de --color-green
  // ======================================================================
  describe('Accent vert (--color-green) pour les actions positives (Req 8.4)', () => {
    it('ConsoleAdmin — bouton activer (accès révoqué) utilise var(--color-green)', async () => {
      sb.value = null;
      adminMock.entries = [revokedEntry];

      const { container } = render(<ConsoleAdmin />);
      await waitFor(() => {
        if (!container.querySelector('table.admin-users')) {
          throw new Error('table not rendered yet');
        }
      });

      const activateBtn = findButtonByText(container, 'admin.activate');
      expect(activateBtn).toBeTruthy();
      expect(activateBtn.style.color).toBe('var(--color-green)');
      expect(activateBtn.style.borderColor).toBe('var(--color-green)');
    });

    it('ConsoleAdmin — bouton valider-preuve utilise var(--color-green)', async () => {
      sb.value = null;
      adminMock.entries = [revokedEntry];

      const { container } = render(<ConsoleAdmin />);
      await waitFor(() => {
        if (!container.querySelector('table.admin-users')) {
          throw new Error('table not rendered yet');
        }
      });

      const receiptBtn = screen.getByLabelText('admin.view_proof');
      fireEvent.click(receiptBtn);

      const validateBtn = await waitFor(() => {
        const b = findButtonByText(container, 'admin.validate_proof');
        if (!b) throw new Error('validate button not rendered yet');
        return b;
      });

      expect(validateBtn.style.color).toBe('var(--color-green)');
      expect(validateBtn.style.borderColor).toBe('var(--color-green)');
    });
  });

  // ======================================================================
  // Req 8.5 — base .btn conservée (hover/focus-visible via primitives)
  // ======================================================================
  describe('Classe de base .btn conservée sur tous les boutons (Req 8.5)', () => {
    it('ConsoleAdmin — chaque bouton d\'action conserve la classe .btn', async () => {
      sb.value = null;
      adminMock.entries = [grantedEntry, revokedEntry];

      const { container } = render(<ConsoleAdmin />);
      await waitFor(() => {
        if (!container.querySelector('table.admin-users')) {
          throw new Error('table not rendered yet');
        }
      });

      // Révéler aussi les boutons valider/rejeter.
      fireEvent.click(screen.getAllByLabelText('admin.view_proof')[0]);
      await waitFor(() => {
        if (!findButtonByText(container, 'admin.validate_proof')) {
          throw new Error('proof actions not rendered yet');
        }
      });

      const buttons = [...container.querySelectorAll('button')];
      expect(buttons.length).toBeGreaterThan(0);
      buttons.forEach((btn) => {
        expect(btn.classList.contains('btn')).toBe(true);
      });
    });

    it('EspaceAdminPlateforme — chaque bouton conserve la classe .btn', () => {
      ctx.value = makePlatformCtx();
      const { container } = render(<EspaceAdminPlateforme />);

      const buttons = [...container.querySelectorAll('button')];
      expect(buttons.length).toBeGreaterThan(0);
      buttons.forEach((btn) => {
        expect(btn.classList.contains('btn')).toBe(true);
      });
    });
  });
});
