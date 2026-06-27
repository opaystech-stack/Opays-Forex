import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

// i18n neutralisé : useT renvoie la clé (rendu déterministe et isolé).
// La fonction `t` est définie UNE SEULE FOIS via vi.hoisted (référence stable)
// pour éviter que les useMemo/useState dépendant de `t` ne déclenchent une
// boucle de re-render à chaque rendu.
const stableT = vi.hoisted(() => (key) => key);
vi.mock('../i18n', () => ({
  useT: () => stableT,
}));

// État et spies du contexte applicatif, hoistés pour être visibles dans vi.mock.
// `canManage` pilote la permission `employes.gerer` (Req 1.1, 1.11, 1.10).
const ctx = vi.hoisted(() => ({
  canManage: true,
  employees: [],
  invitations: [],
  loading: false,
  hasPermission: vi.fn(),
  createInvitation: vi.fn(),
  updateMemberRole: vi.fn(),
  updateMemberPermissions: vi.fn(),
  setMemberActivation: vi.fn(),
}));

vi.mock('../context/AppContext', () => ({
  useApp: () => ({
    employees: ctx.employees,
    invitations: ctx.invitations,
    loading: ctx.loading,
    hasPermission: ctx.hasPermission,
    createInvitation: ctx.createInvitation,
    updateMemberRole: ctx.updateMemberRole,
    updateMemberPermissions: ctx.updateMemberPermissions,
    setMemberActivation: ctx.setMemberActivation,
  }),
}));

import Employes from './Employes';

const ACTIVE_MEMBER = {
  id: 'm1',
  email: 'caissier@agence.test',
  role: 'caissier',
  activation_state: 'actif',
};

const DISABLED_MEMBER = {
  id: 'm2',
  email: 'ancien@agence.test',
  role: 'observateur',
  activation_state: 'désactivé',
};

const INVITATIONS = [
  { id: 'i1', email: 'pending@agence.test', role: 'gerant', state: 'en_attente', created_at: '2026-01-01T00:00:00Z' },
  { id: 'i2', email: 'accepted@agence.test', role: 'caissier', state: 'acceptée', created_at: '2026-01-02T00:00:00Z' },
  { id: 'i3', email: 'expired@agence.test', role: 'observateur', state: 'expirée', created_at: '2026-01-03T00:00:00Z' },
];

beforeEach(() => {
  ctx.canManage = true;
  ctx.employees = [];
  ctx.invitations = [];
  ctx.loading = false;
  ctx.hasPermission.mockReset().mockImplementation((perm) =>
    perm === 'employes.gerer' ? ctx.canManage : false,
  );
  ctx.createInvitation.mockReset().mockResolvedValue({ success: true });
  ctx.updateMemberRole.mockReset().mockResolvedValue({ success: true });
  ctx.updateMemberPermissions.mockReset().mockResolvedValue({ success: true });
  ctx.setMemberActivation.mockReset().mockResolvedValue({ success: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Employes — garde de permission (Req 1.1, 1.10, 1.11)', () => {
  it('affiche le message de refus et masque le formulaire sans la permission employes.gerer', () => {
    ctx.canManage = false;
    render(<Employes />);

    // Message de permission insuffisante affiché (Req 1.11).
    expect(screen.getByText('employes.permission_denied')).toBeTruthy();
    // Le formulaire d'invitation n'est pas rendu.
    expect(screen.queryByText('employes.invite_title')).toBeNull();
    expect(ctx.hasPermission).toHaveBeenCalledWith('employes.gerer');
  });

  it('affiche l\'interface de gestion (formulaire + listes) avec la permission employes.gerer', () => {
    ctx.canManage = true;
    render(<Employes />);

    // Le formulaire d'invitation et les titres de listes sont rendus (Req 1.1, 1.10).
    expect(screen.getByText('employes.invite_title')).toBeTruthy();
    expect(screen.getByText('employes.accounts_title')).toBeTruthy();
    expect(screen.getByText('employes.invitations_title')).toBeTruthy();
    // Aucun message de refus.
    expect(screen.queryByText('employes.permission_denied')).toBeNull();
  });
});

describe('Employes — rendu des listes et de leurs états (Req 1.3, 1.10)', () => {
  it('rend les Comptes_Employés avec leur e-mail et leur état d\'activation', () => {
    ctx.employees = [ACTIVE_MEMBER, DISABLED_MEMBER];
    render(<Employes />);

    expect(screen.getByText(ACTIVE_MEMBER.email)).toBeTruthy();
    expect(screen.getByText(DISABLED_MEMBER.email)).toBeTruthy();
    // États d'activation de l'ensemble fermé { actif, désactivé } (Req 1.10).
    expect(screen.getByText('employes.status_actif')).toBeTruthy();
    expect(screen.getByText('employes.status_desactive')).toBeTruthy();
  });

  it('rend les Invitations_Collaborateur avec leurs états en_attente / acceptée / expirée', () => {
    ctx.invitations = INVITATIONS;
    render(<Employes />);

    INVITATIONS.forEach((inv) => {
      expect(screen.getByText(inv.email)).toBeTruthy();
    });
    // Badges d'état couvrant l'ensemble fermé des transitions d'invitation (Req 1.3, 1.10).
    expect(screen.getByText('employes.inv_status_en_attente')).toBeTruthy();
    expect(screen.getByText('employes.inv_status_acceptee')).toBeTruthy();
    expect(screen.getByText('employes.inv_status_expiree')).toBeTruthy();
  });

  it('affiche les messages de listes vides en l\'absence de comptes et d\'invitations', () => {
    ctx.employees = [];
    ctx.invitations = [];
    render(<Employes />);

    expect(screen.getByText('employes.empty_accounts')).toBeTruthy();
    expect(screen.getByText('employes.empty_invitations')).toBeTruthy();
  });
});

describe('Employes — modification de rôle (Req 1.8)', () => {
  it('appelle updateMemberRole avec le nouveau rôle après édition et enregistrement', async () => {
    ctx.employees = [ACTIVE_MEMBER];
    const { container } = render(<Employes />);

    // Entrer en mode édition du rôle (bouton crayon, aria-label employes.edit_role).
    fireEvent.click(screen.getByLabelText('employes.edit_role'));

    // Un sélecteur de rôle apparaît dans la ligne du membre ; il propose tous
    // les rôles de l'ensemble fermé. C'est le dernier <select> du document
    // (le premier étant celui du formulaire d'invitation).
    const selects = container.querySelectorAll('select');
    const roleSelect = selects[selects.length - 1];
    fireEvent.change(roleSelect, { target: { value: 'gerant' } });

    // Enregistrer (bouton Save, qui réutilise l'aria-label employes.edit_role).
    fireEvent.click(screen.getByLabelText('employes.edit_role'));

    await waitFor(() => expect(ctx.updateMemberRole).toHaveBeenCalledTimes(1));
    expect(ctx.updateMemberRole).toHaveBeenCalledWith(ACTIVE_MEMBER.id, 'gerant');
  });

  it('n\'appelle pas updateMemberRole tant que l\'édition n\'est pas enregistrée', () => {
    ctx.employees = [ACTIVE_MEMBER];
    render(<Employes />);

    // Entrer puis annuler l'édition : aucun enregistrement de rôle.
    fireEvent.click(screen.getByLabelText('employes.edit_role'));
    fireEvent.click(screen.getByLabelText('common.no'));

    expect(ctx.updateMemberRole).not.toHaveBeenCalled();
  });
});
