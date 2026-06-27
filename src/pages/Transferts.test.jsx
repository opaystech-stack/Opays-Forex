import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// i18n neutralisé : useT renvoie la clé (rendu déterministe et isolé).
// La fonction `t` est définie UNE SEULE FOIS via vi.hoisted (référence stable)
// pour éviter que les useMemo/useState dépendant de `t` ne déclenchent une
// boucle de re-render infinie à chaque rendu.
const stableT = vi.hoisted(() => (key) => key);
vi.mock('../i18n', () => ({
  useT: () => stableT,
}));

// État et spies du contexte applicatif, hoistés pour être visibles dans vi.mock.
// `moduleEnabled` pilote l'activation du Module_Additionnel `transfert_argent`
// (Req 8.1) ; `canSell` pilote la permission `services.vendre` (Req 8.2).
const ctx = vi.hoisted(() => ({
  moduleEnabled: true,
  canSell: true,
  loading: false,
  transfers: [],
  transferMethods: [],
  createTransfer: vi.fn(),
  deleteTransfer: vi.fn(),
  hasPermission: vi.fn(),
  isModuleEnabled: vi.fn(),
}));

vi.mock('../context/AppContext', () => ({
  useApp: () => ({
    transfers: ctx.transfers,
    transferMethods: ctx.transferMethods,
    createTransfer: ctx.createTransfer,
    deleteTransfer: ctx.deleteTransfer,
    hasPermission: ctx.hasPermission,
    isModuleEnabled: ctx.isModuleEnabled,
    loading: ctx.loading,
  }),
}));

import Transferts from './Transferts';

const METHODS = [
  { id: 'mt1', label: 'Western Union', is_active: true },
  { id: 'mt2', label: 'Autre', is_active: true },
];

beforeEach(() => {
  ctx.moduleEnabled = true;
  ctx.canSell = true;
  ctx.loading = false;
  ctx.transfers = [];
  ctx.transferMethods = METHODS;
  ctx.createTransfer.mockReset().mockResolvedValue({ success: true });
  ctx.deleteTransfer.mockReset().mockResolvedValue({ success: true });
  ctx.hasPermission.mockReset().mockImplementation((perm) =>
    perm === 'services.vendre' ? ctx.canSell : false,
  );
  ctx.isModuleEnabled.mockReset().mockImplementation((key) =>
    key === 'transfert_argent' ? ctx.moduleEnabled : false,
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Transferts — rendu conditionnel selon module (Req 8.1)', () => {
  it('affiche le message de module désactivé et masque le formulaire quand le module est désactivé', () => {
    ctx.moduleEnabled = false;
    render(<Transferts />);

    // Message de module désactivé affiché (Req 8.1).
    expect(screen.getByText('transferts.module_disabled')).toBeTruthy();
    // Le formulaire de saisie n'est pas rendu (pas de bouton d'enregistrement
    // ni de libellé de méthode).
    expect(screen.queryByText('transferts.save')).toBeNull();
    expect(screen.queryByText('transferts.method_label')).toBeNull();
    expect(ctx.isModuleEnabled).toHaveBeenCalledWith('transfert_argent');
  });

  it('rend le formulaire de saisie quand le module est activé et la permission accordée', () => {
    ctx.moduleEnabled = true;
    ctx.canSell = true;
    render(<Transferts />);

    // Aucun message de module désactivé.
    expect(screen.queryByText('transferts.module_disabled')).toBeNull();
    // Le formulaire est rendu (libellé de méthode + bouton d'enregistrement).
    expect(screen.getByText('transferts.method_label')).toBeTruthy();
    expect(screen.getByText('transferts.save')).toBeTruthy();
  });

  it('affiche le refus de permission et masque le formulaire sans services.vendre (Req 8.2)', () => {
    ctx.moduleEnabled = true;
    ctx.canSell = false;
    render(<Transferts />);

    // Le module est activé : pas de message de module désactivé.
    expect(screen.queryByText('transferts.module_disabled')).toBeNull();
    // Message de permission insuffisante, formulaire masqué.
    expect(screen.getByText('transferts.permission_denied')).toBeTruthy();
    expect(screen.queryByText('transferts.save')).toBeNull();
  });
});
