import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';

// FormulaireCommande (page PUBLIQUE de commande à distance) — tests d'exemple.
//
// Couvre les exigences 14.3 (formulaire affiché sans compte pour un lien
// valide), 14.4 (enregistrement de la Commande_Distante + dépôt de la Preuve),
// 14.5 (refus d'un lien invalide) et 14.6 (refus d'un champ requis manquant).

// i18n neutralisé : `useT` renvoie une fonction `t` STABLE (vi.hoisted) pour
// éviter que les useMemo dépendant de `t` ne bouclent à chaque re-render.
const stableT = vi.hoisted(() => (key) => key);
vi.mock('../i18n', () => ({
  useT: () => stableT,
}));

// Le paramètre de route `:lien` est piloté par test via `routeParams.lien`.
const routeParams = vi.hoisted(() => ({ lien: '' }));
vi.mock('react-router-dom', () => ({
  useParams: () => ({ lien: routeParams.lien }),
}));

// Double minimal et chaînable de `services/supabase` : storage.upload et rpc.
// Pilotables par test via `sb.uploadResult` / `sb.rpcResult`.
const sb = vi.hoisted(() => ({
  uploadResult: { error: null },
  rpcResult: { error: null },
  upload: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));
vi.mock('../services/supabase', () => ({
  supabase: {
    storage: { from: (...args) => sb.from(...args) },
    rpc: (...args) => sb.rpc(...args),
  },
}));

import FormulaireCommande from './FormulaireCommande';
import { encodeOrderLink, generateOrderToken } from '../utils/orderToken';

// Construit un paramètre de lien réel à partir des helpers purs d'orderToken.
const buildValidLink = () =>
  encodeOrderLink({ agencyId: 'agency-123', token: generateOrderToken() });

const fillField = (id, value) => {
  fireEvent.change(document.getElementById(id), { target: { value } });
};

const attachProof = () => {
  const file = new File(['preuve'], 'recu.png', { type: 'image/png' });
  fireEvent.change(document.getElementById('order-proof'), {
    target: { files: [file] },
  });
  return file;
};

beforeEach(() => {
  routeParams.lien = '';
  sb.uploadResult = { error: null };
  sb.rpcResult = { error: null };
  sb.upload.mockReset();
  sb.upload.mockImplementation(() => Promise.resolve(sb.uploadResult));
  sb.rpc.mockReset();
  sb.rpc.mockImplementation(() => Promise.resolve(sb.rpcResult));
  sb.from.mockReset();
  sb.from.mockReturnValue({ upload: (...args) => sb.upload(...args) });
});

afterEach(() => {
  cleanup();
});

describe('FormulaireCommande — lien invalide (Req 14.5)', () => {
  it('affiche le message « lien invalide » et n\'affiche pas le formulaire pour un lien malformé', () => {
    routeParams.lien = 'pas-un-vrai-lien-%%%';

    render(<FormulaireCommande />);

    // Message « lien invalide » affiché (Req 14.5).
    expect(screen.getByText('order_form.link_invalid')).toBeTruthy();
    // Aucun champ du formulaire n'est rendu.
    expect(document.getElementById('order-customer-name')).toBeNull();
    expect(document.getElementById('order-proof')).toBeNull();
  });

  it('refuse aussi un lien vide', () => {
    routeParams.lien = '';

    render(<FormulaireCommande />);

    expect(screen.getByText('order_form.link_invalid')).toBeTruthy();
    expect(document.getElementById('order-customer-name')).toBeNull();
  });
});

describe('FormulaireCommande — lien valide (Req 14.3)', () => {
  it('affiche le formulaire public sans exiger de compte authentifié', () => {
    routeParams.lien = buildValidLink();

    render(<FormulaireCommande />);

    // Tous les champs requis sont rendus, sans aucune barrière d'authentification.
    expect(document.getElementById('order-customer-name')).toBeTruthy();
    expect(document.getElementById('order-customer-phone')).toBeTruthy();
    expect(document.getElementById('order-details')).toBeTruthy();
    expect(document.getElementById('order-proof')).toBeTruthy();
    // Le message d'invalidité n'est pas présent.
    expect(screen.queryByText('order_form.link_invalid')).toBeNull();
  });
});

describe('FormulaireCommande — soumission (Req 14.4, 14.6)', () => {
  it('enregistre une commande valide avec preuve : dépôt + RPC submit_remote_order', async () => {
    routeParams.lien = buildValidLink();

    render(<FormulaireCommande />);

    fillField('order-customer-name', 'Awa Diop');
    fillField('order-customer-phone', '+221770000000');
    fillField('order-details', 'Échange 100 USD en CDF');
    const file = attachProof();

    fireEvent.submit(document.querySelector('form'));

    // La Preuve est déposée dans le bucket privé `order-proofs` (Req 14.4).
    await waitFor(() => {
      expect(sb.from).toHaveBeenCalledWith('order-proofs');
      expect(sb.upload).toHaveBeenCalledTimes(1);
    });
    const [proofPath, uploadedFile] = sb.upload.mock.calls[0];
    expect(proofPath).toContain('agency-123/');
    expect(uploadedFile).toBe(file);

    // La Commande_Distante est enregistrée via la RPC SECURITY DEFINER (Req 14.4).
    await waitFor(() => {
      expect(sb.rpc).toHaveBeenCalledWith(
        'submit_remote_order',
        expect.objectContaining({
          p_customer_name: 'Awa Diop',
          p_customer_phone: '+221770000000',
          p_details: 'Échange 100 USD en CDF',
          p_proof_path: proofPath,
        })
      );
    });

    // Confirmation de transmission affichée (Req 14.4).
    expect(await screen.findByText('order_form.success')).toBeTruthy();
  });

  it('refuse la soumission si un champ requis manque, sans aucun effet de bord (Req 14.6)', async () => {
    routeParams.lien = buildValidLink();

    render(<FormulaireCommande />);

    // Nom manquant : on ne remplit que téléphone, détails et preuve.
    fillField('order-customer-phone', '+221770000000');
    fillField('order-details', 'Échange 100 USD en CDF');
    attachProof();

    fireEvent.submit(document.querySelector('form'));

    // Message d'erreur de champ manquant affiché.
    expect(await screen.findByText('order_form.error_missing_field')).toBeTruthy();
    // Aucune écriture : ni dépôt de Preuve ni RPC (Req 14.6).
    expect(sb.upload).not.toHaveBeenCalled();
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it('refuse la soumission si la Preuve est absente (Req 14.6)', async () => {
    routeParams.lien = buildValidLink();

    render(<FormulaireCommande />);

    fillField('order-customer-name', 'Awa Diop');
    fillField('order-customer-phone', '+221770000000');
    fillField('order-details', 'Échange 100 USD en CDF');
    // Pas de preuve jointe.

    fireEvent.submit(document.querySelector('form'));

    expect(await screen.findByText('order_form.error_proof_required')).toBeTruthy();
    expect(sb.upload).not.toHaveBeenCalled();
    expect(sb.rpc).not.toHaveBeenCalled();
  });
});
