import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

// i18n neutralisé : useT renvoie la clé (rendu déterministe et isolé).
// `t` est défini UNE SEULE FOIS via vi.hoisted (référence STABLE) pour éviter
// que les useMemo/useCallback dépendant de `t` ne se ré-exécutent en boucle
// (cf. VoiceAgentModal.test.jsx).
const stableT = vi.hoisted(() => (key) => key);
vi.mock('../i18n', () => ({
  useT: () => stableT,
}));

// État et spies du contexte applicatif, hoistés pour être visibles dans vi.mock.
// `ctx.value` est l'objet retourné par useApp ; chaque test peut le reconfigurer
// avant le rendu (rôle éditeur, agences, droits de module…).
const ctx = vi.hoisted(() => ({ value: {} }));
vi.mock('../context/AppContext', () => ({
  useApp: () => ctx.value,
}));

import EspaceAdminPlateforme from './EspaceAdminPlateforme';

// Construit une valeur de contexte par défaut (Editeur_Plateforme, données vides),
// surchargée au cas par cas par chaque test.
const makeCtx = (overrides = {}) => ({
  profilAcces: { is_platform_editor: true },
  user: { isDemo: false },
  loading: false,
  platformAgencies: [],
  platformModuleEntitlements: {},
  setModuleEntitlement: vi.fn().mockResolvedValue({ success: true }),
  setAgencyState: vi.fn().mockResolvedValue({ success: true }),
  transferMethods: [],
  subscriptionProviders: [],
  createTransferMethod: vi.fn().mockResolvedValue({ success: true }),
  updateTransferMethod: vi.fn().mockResolvedValue({ success: true }),
  createSubscriptionProvider: vi.fn().mockResolvedValue({ success: true }),
  updateSubscriptionProvider: vi.fn().mockResolvedValue({ success: true }),
  ...overrides,
});

// Retrouve la valeur affichée (stat-value) associée à un libellé de statistique.
const statValueFor = (labelKey) => {
  const label = screen.getByText(labelKey);
  const box = label.closest('.stat-box');
  return box?.querySelector('.stat-value')?.textContent;
};

beforeEach(() => {
  ctx.value = makeCtx();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('EspaceAdminPlateforme', () => {
  // ---- Rendu réservé à l'Editeur_Plateforme (Req 4.2, 5.1) ----

  it("affiche le message de refus pour un Utilisateur sans rôle Editeur_Plateforme (Req 4.7)", () => {
    ctx.value = makeCtx({
      profilAcces: { is_platform_editor: false },
      user: { isDemo: false },
      platformAgencies: [{ id: 'a-1', name: 'Agence 1', state: 'active' }],
    });

    render(<EspaceAdminPlateforme />);

    // Refus d'accès affiché, aucune UI d'administration exposée.
    expect(screen.getByText('platform_admin.permission_denied')).toBeTruthy();
    expect(screen.queryByText('platform_admin.agencies_title')).toBeNull();
    expect(screen.queryByText('platform_admin.stats_title')).toBeNull();
  });

  it("affiche l'UI complète d'administration pour l'Editeur_Plateforme (Req 4.2, 5.1)", () => {
    ctx.value = makeCtx({
      platformAgencies: [
        { id: 'a-1', name: 'Agence Alpha', owner_id: 'o-1', state: 'active' },
      ],
    });

    render(<EspaceAdminPlateforme />);

    // Aucun message de refus ; sections d'administration présentes.
    expect(screen.queryByText('platform_admin.permission_denied')).toBeNull();
    expect(screen.getByText('platform_admin.stats_title')).toBeTruthy();
    expect(screen.getByText('platform_admin.agencies_title')).toBeTruthy();
    expect(screen.getByText('platform_admin.col_modules')).toBeTruthy();
    // L'agence listée est rendue (liste des Agences — Req 5.1).
    expect(screen.getByText('Agence Alpha')).toBeTruthy();
  });

  // ---- Enregistrement d'un Droit_Module (Req 4.9) ----

  it("bascule un Droit_Module et appelle setModuleEntitlement(agencyId, moduleKey, true) (Req 4.9)", async () => {
    ctx.value = makeCtx({
      platformAgencies: [
        { id: 'a-1', name: 'Agence Alpha', owner_id: 'o-1', state: 'active' },
      ],
      // Aucun droit accordé : le bouton propose donc l'octroi (grant).
      platformModuleEntitlements: { 'a-1': {} },
    });

    render(<EspaceAdminPlateforme />);

    // Bouton du Module_Additionnel 'transfert_argent' (texte = clé i18n).
    const moduleLabel = screen.getByText('platform_admin.module_transfert_argent');
    const moduleButton = moduleLabel.closest('button');
    expect(moduleButton).toBeTruthy();

    fireEvent.click(moduleButton);

    await waitFor(() => {
      expect(ctx.value.setModuleEntitlement).toHaveBeenCalledTimes(1);
    });
    // Octroi du Droit_Module : passage de false -> true (Req 4.9).
    expect(ctx.value.setModuleEntitlement).toHaveBeenCalledWith('a-1', 'transfert_argent', true);
  });

  it("révoque un Droit_Module déjà accordé via setModuleEntitlement(..., false) (Req 4.9)", async () => {
    ctx.value = makeCtx({
      platformAgencies: [
        { id: 'a-1', name: 'Agence Alpha', owner_id: 'o-1', state: 'active' },
      ],
      // Droit déjà accordé : le bouton propose la révocation.
      platformModuleEntitlements: { 'a-1': { transfert_argent: true } },
    });

    render(<EspaceAdminPlateforme />);

    const moduleButton = screen
      .getByText('platform_admin.module_transfert_argent')
      .closest('button');
    fireEvent.click(moduleButton);

    await waitFor(() => {
      expect(ctx.value.setModuleEntitlement).toHaveBeenCalledWith('a-1', 'transfert_argent', false);
    });
  });

  // ---- Statistique des Agences par Etat_Agence (Req 5.8) ----

  it("affiche les comptes corrects par état via countAgenciesByState (Req 5.8)", () => {
    ctx.value = makeCtx({
      platformAgencies: [
        { id: 'a-1', name: 'A1', state: 'active' },
        { id: 'a-2', name: 'A2', state: 'active' },
        { id: 'a-3', name: 'A3', state: 'suspendue' },
      ],
    });

    render(<EspaceAdminPlateforme />);

    // 2 actives, 1 suspendue, total 3 (somme conservée).
    expect(statValueFor('platform_admin.stats_active')).toBe('2');
    expect(statValueFor('platform_admin.stats_suspended')).toBe('1');
    expect(statValueFor('platform_admin.stats_total')).toBe('3');
  });

  it("affiche des comptes nuls lorsqu'aucune agence n'existe (Req 5.8)", () => {
    ctx.value = makeCtx({ platformAgencies: [] });

    render(<EspaceAdminPlateforme />);

    expect(statValueFor('platform_admin.stats_active')).toBe('0');
    expect(statValueFor('platform_admin.stats_suspended')).toBe('0');
    expect(statValueFor('platform_admin.stats_total')).toBe('0');
  });
});
