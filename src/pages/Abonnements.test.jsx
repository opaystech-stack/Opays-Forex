import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// i18n neutralisé : useT renvoie la clé (rendu déterministe et isolé).
// `t` est défini UNE SEULE FOIS via vi.hoisted (référence stable) pour éviter
// toute boucle de re-render via les useMemo dépendant de `t`.
const stableT = vi.hoisted(() => (key) => key);
vi.mock('../i18n', () => ({
  useT: () => stableT,
}));

// État et spies du contexte applicatif, hoistés pour être visibles dans vi.mock.
// `moduleEnabled` pilote l'activation du Module_Additionnel `abonnements`
// (Req 10.1) ; `canSell` pilote la permission `services.vendre` (Req 10.2).
const ctx = vi.hoisted(() => ({
  moduleEnabled: true,
  canSell: true,
  loading: false,
  subscriptions: [],
  subscriptionProviders: [],
  customers: [],
  createSubscription: vi.fn(),
  updateSubscription: vi.fn(),
  deleteSubscription: vi.fn(),
  logReminder: vi.fn(),
  hasPermission: vi.fn(),
  isModuleEnabled: vi.fn(),
}));

vi.mock('../context/AppContext', () => ({
  useApp: () => ({
    subscriptions: ctx.subscriptions,
    subscriptionProviders: ctx.subscriptionProviders,
    customers: ctx.customers,
    createSubscription: ctx.createSubscription,
    updateSubscription: ctx.updateSubscription,
    deleteSubscription: ctx.deleteSubscription,
    logReminder: ctx.logReminder,
    hasPermission: ctx.hasPermission,
    isModuleEnabled: ctx.isModuleEnabled,
    loading: ctx.loading,
  }),
}));

import Abonnements from './Abonnements';

const PROVIDERS = [
  { id: 'p1', label: 'Canal+', is_active: true },
  { id: 'p2', label: 'DStv', is_active: true },
];

beforeEach(() => {
  ctx.moduleEnabled = true;
  ctx.canSell = true;
  ctx.loading = false;
  ctx.subscriptions = [];
  ctx.subscriptionProviders = PROVIDERS;
  ctx.customers = [];
  ctx.createSubscription.mockReset().mockResolvedValue({ success: true });
  ctx.updateSubscription.mockReset().mockResolvedValue({ success: true });
  ctx.deleteSubscription.mockReset().mockResolvedValue({ success: true });
  ctx.logReminder.mockReset().mockResolvedValue({ success: true });
  ctx.hasPermission.mockReset().mockImplementation((perm) =>
    perm === 'services.vendre' ? ctx.canSell : false,
  );
  ctx.isModuleEnabled.mockReset().mockImplementation((key) =>
    key === 'abonnements' ? ctx.moduleEnabled : false,
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Abonnements — rendu conditionnel selon module (Req 10.1)', () => {
  it('affiche le message de module désactivé et masque le formulaire quand le module est désactivé', () => {
    ctx.moduleEnabled = false;
    render(<Abonnements />);

    // Message de module désactivé affiché (Req 10.1).
    expect(screen.getByText('abonnements.module_disabled')).toBeTruthy();
    // Formulaire de vente non rendu.
    expect(screen.queryByText('abonnements.save')).toBeNull();
    expect(screen.queryByText('abonnements.provider_label')).toBeNull();
    expect(ctx.isModuleEnabled).toHaveBeenCalledWith('abonnements');
  });

  it('rend le formulaire de vente quand le module est activé et la permission accordée', () => {
    ctx.moduleEnabled = true;
    ctx.canSell = true;
    render(<Abonnements />);

    expect(screen.queryByText('abonnements.module_disabled')).toBeNull();
    // Le formulaire est rendu (fournisseur + montant + seuil + bouton).
    expect(screen.getByText('abonnements.provider_label')).toBeTruthy();
    expect(screen.getByText('abonnements.threshold_label')).toBeTruthy();
    expect(screen.getByText('abonnements.save')).toBeTruthy();
  });

  it('affiche le refus de permission et masque le formulaire sans services.vendre (Req 10.2)', () => {
    ctx.moduleEnabled = true;
    ctx.canSell = false;
    render(<Abonnements />);

    expect(screen.queryByText('abonnements.module_disabled')).toBeNull();
    expect(screen.getByText('abonnements.permission_denied')).toBeTruthy();
    expect(screen.queryByText('abonnements.save')).toBeNull();
  });
});
