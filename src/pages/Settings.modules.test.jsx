import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

// i18n neutralisé : `useT` renvoie la clé telle quelle (rendu déterministe).
// La fonction `t` est définie UNE SEULE FOIS via vi.hoisted (référence stable)
// pour éviter que des useCallback/useEffect dépendant de `t` ne bouclent à
// l'infini en se ré-exécutant à chaque re-render.
const stableT = vi.hoisted(() => (key) => key);
vi.mock('../i18n', () => ({
  useT: () => stableT,
}));

// État et spies du contexte applicatif, hoistés pour être visibles dans vi.mock.
// Les champs sont réinitialisés dans beforeEach pour isoler chaque test.
const ctx = vi.hoisted(() => ({
  currentRole: 'proprietaire',
  // Ensembles d'états/habilitations contrôlés par test :
  enabledModules: {},
  activatableModules: {},
  setModuleEnabled: null,
}));

vi.mock('../context/AppContext', () => ({
  useApp: () => ({
    // Données de taux/portefeuilles neutres (sections non testées ici).
    rates: [],
    updateRates: vi.fn(),
    isUsingMock: false,
    resetMockData: vi.fn(),
    user: { email: 'owner@example.com' },
    logOut: vi.fn(),
    wallets: [],
    adjustWalletBalance: vi.fn(),
    language: 'fr',
    setLanguage: vi.fn(),
    // Logique des modules — pilotée par `ctx` (Req 6.2, 6.3, 6.4, 6.9).
    isModuleEnabled: (key) => ctx.enabledModules[key] === true,
    isModuleActivatable: (key) => ctx.activatableModules[key] === true,
    setModuleEnabled: (...args) => ctx.setModuleEnabled(...args),
    currentRole: ctx.currentRole,
  }),
}));

// TemplatesManager est stubé : il dépend lui aussi du contexte et n'est pas
// l'objet de ce fichier de test (modules fonctionnels uniquement).
vi.mock('../components/TemplatesManager', () => ({
  default: () => <div data-testid="templates-manager-stub" />,
}));

import SettingsPage from './Settings';

beforeEach(() => {
  ctx.currentRole = 'proprietaire';
  ctx.enabledModules = {};
  ctx.activatableModules = {};
  ctx.setModuleEnabled = vi.fn().mockResolvedValue({ success: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Settings — modules fonctionnels', () => {
  // (a) Les Modules_Additionnels n'apparaissent que si isModuleActivatable est
  // vrai (Droit_Module accordé) ; ils sont masqués sinon (Req 6.2, 6.3, 6.4).
  it("masque les Modules_Additionnels non habilités (Req 6.2, 6.4)", () => {
    // Aucun Module_Additionnel n'est activable.
    ctx.activatableModules = {};
    render(<SettingsPage />);

    expect(screen.queryByText('settings.module_transfert_argent')).toBeNull();
    expect(screen.queryByText('settings.module_abonnements')).toBeNull();
    expect(screen.queryByText('settings.module_billets_avion')).toBeNull();
  });

  it("affiche un Module_Additionnel uniquement lorsqu'il est habilité (Req 6.3, 6.4)", () => {
    // Seul `transfert_argent` est habilité au niveau plateforme.
    ctx.activatableModules = { transfert_argent: true };
    render(<SettingsPage />);

    expect(screen.getByText('settings.module_transfert_argent')).toBeTruthy();
    // Les autres Modules_Additionnels restent masqués.
    expect(screen.queryByText('settings.module_abonnements')).toBeNull();
    expect(screen.queryByText('settings.module_billets_avion')).toBeNull();
  });

  // (b) Le Propriétaire_Agence peut activer/désactiver un module : le toggle
  // appelle setModuleEnabled avec l'état inversé (Req 6.3, 6.4).
  it("appelle setModuleEnabled avec l'état inversé pour un Propriétaire_Agence", () => {
    ctx.currentRole = 'proprietaire';
    // Module optionnel `prets` actuellement désactivé.
    ctx.enabledModules = { prets: false };
    render(<SettingsPage />);

    // Le toggle d'un module optionnel porte aria-label = libellé du module.
    const toggle = screen.getByRole('button', { name: 'settings.module_prets' });
    expect(toggle.disabled).toBe(false);

    fireEvent.click(toggle);

    expect(ctx.setModuleEnabled).toHaveBeenCalledTimes(1);
    // Désactivé -> activation demandée (true).
    expect(ctx.setModuleEnabled).toHaveBeenCalledWith('prets', true);
  });

  it("demande la désactivation d'un module déjà activé (état inversé)", () => {
    ctx.currentRole = 'proprietaire';
    ctx.enabledModules = { prets: true };
    render(<SettingsPage />);

    const toggle = screen.getByRole('button', { name: 'settings.module_prets' });
    fireEvent.click(toggle);

    expect(ctx.setModuleEnabled).toHaveBeenCalledWith('prets', false);
  });

  // (c) Un Compte_Employé non propriétaire voit l'avis « réservé au
  // propriétaire » et ne peut pas basculer les modules (Req 6.9).
  it("affiche l'avis réservé au propriétaire et verrouille les toggles pour un non-propriétaire (Req 6.9)", () => {
    ctx.currentRole = 'caissier';
    ctx.enabledModules = { prets: false };
    render(<SettingsPage />);

    // L'avis owner-only est présent.
    expect(screen.getByText('settings.modules_owner_only')).toBeTruthy();

    // Le toggle du module optionnel est verrouillé (disabled).
    const toggle = screen.getByRole('button', { name: 'settings.module_prets' });
    expect(toggle.disabled).toBe(true);
  });

  it("ne déclenche aucun setModuleEnabled lorsqu'un non-propriétaire tente de basculer (Req 6.9)", () => {
    ctx.currentRole = 'gerant';
    ctx.enabledModules = { prets: false };
    render(<SettingsPage />);

    const toggle = screen.getByRole('button', { name: 'settings.module_prets' });
    // Un bouton disabled ignore les clics ; on vérifie l'absence d'appel.
    fireEvent.click(toggle);

    expect(ctx.setModuleEnabled).not.toHaveBeenCalled();
  });

  it("n'affiche pas l'avis réservé au propriétaire pour le Propriétaire_Agence", () => {
    ctx.currentRole = 'proprietaire';
    render(<SettingsPage />);

    expect(screen.queryByText('settings.modules_owner_only')).toBeNull();
  });
});
