import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';

// Admin UX Enhancement — FormulaireCommande (Public_Form) example/branch tests.
//
// Validates the presentational enhancement of the public remote-order form
// without changing its behavior:
//   - Req 11.3: brand identity header rendered ABOVE the form fields.
//   - Req 11.6: a successful submission shows the success confirmation and
//     removes the input form from view.
//   - Req 11.7: a submission that fails after being sent shows a failure
//     message, retains entered values, and keeps the form available.
//   - Req 11.8: existing submission behavior is preserved — the same Supabase
//     calls fire with the same arguments (storage.from('order-proofs').upload
//     then rpc('submit_remote_order', { p_token, ... })).

// i18n neutralisé : `useT` renvoie une fonction `t` IDENTITÉ stable (vi.hoisted)
// pour éviter que les useMemo dépendant de `t` ne bouclent à chaque re-render.
const stableT = vi.hoisted(() => (key) => key);
vi.mock('./i18n', () => ({
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
vi.mock('./services/supabase', () => ({
  supabase: {
    storage: { from: (...args) => sb.from(...args) },
    rpc: (...args) => sb.rpc(...args),
  },
}));

import FormulaireCommande from './pages/FormulaireCommande';
import { encodeOrderLink, generateOrderToken } from './utils/orderToken';

// Construit un paramètre de lien réel à partir des helpers purs d'orderToken,
// en exposant le jeton brut pour pouvoir l'asserter côté RPC (p_token).
const buildValidLink = () => {
  const token = generateOrderToken();
  return { lien: encodeOrderLink({ agencyId: 'agency-123', token }), token };
};

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

// Remplit tous les champs requis (nom, téléphone, détails, Preuve) et retourne
// les valeurs saisies + le fichier de Preuve joint.
const fillAllRequired = () => {
  const values = {
    customerName: 'Awa Diop',
    customerPhone: '+221770000000',
    details: 'Échange 100 USD en CDF',
  };
  fillField('order-customer-name', values.customerName);
  fillField('order-customer-phone', values.customerPhone);
  fillField('order-details', values.details);
  const file = attachProof();
  return { values, file };
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

describe('FormulaireCommande — en-tête de marque au-dessus des champs (Req 11.3)', () => {
  it('rend le BrandHeader (.brand-header) AVANT le .screen-header et le formulaire', () => {
    routeParams.lien = buildValidLink().lien;

    const { container } = render(<FormulaireCommande />);

    const brandHeader = container.querySelector('.brand-header');
    const screenHeader = container.querySelector('.screen-header');
    const form = container.querySelector('form');

    expect(brandHeader).toBeTruthy();
    expect(screenHeader).toBeTruthy();
    expect(form).toBeTruthy();

    // L'en-tête de marque précède le bloc d'en-tête de l'écran en ordre DOM.
    expect(
      brandHeader.compareDocumentPosition(screenHeader) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    // L'en-tête de marque précède aussi le formulaire (champs) en ordre DOM.
    expect(
      brandHeader.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});

describe('FormulaireCommande — branche succès (Req 11.6)', () => {
  it('affiche la confirmation de succès et retire le formulaire après une soumission réussie', async () => {
    routeParams.lien = buildValidLink().lien;
    sb.uploadResult = { error: null };
    sb.rpcResult = { error: null };

    const { container } = render(<FormulaireCommande />);

    fillAllRequired();
    fireEvent.submit(container.querySelector('form'));

    // Message de succès affiché (Req 11.6).
    expect(await screen.findByText('order_form.success')).toBeTruthy();
    // Le formulaire de saisie est retiré de la vue (Req 11.6).
    await waitFor(() => {
      expect(container.querySelector('form')).toBeNull();
    });
    expect(document.getElementById('order-customer-name')).toBeNull();
  });
});

describe('FormulaireCommande — branche échec après envoi (Req 11.7)', () => {
  it('affiche un message d\'erreur, conserve les valeurs saisies et garde le formulaire disponible', async () => {
    routeParams.lien = buildValidLink().lien;
    sb.uploadResult = { error: null };
    // La RPC échoue avec une erreur générique (≠ jeton invalide/révoqué/expiré).
    sb.rpcResult = { error: { message: 'some_other_error' } };

    const { container } = render(<FormulaireCommande />);

    const { values } = fillAllRequired();
    fireEvent.submit(container.querySelector('form'));

    // Un message d'erreur (role=alert) est affiché (Req 11.7).
    const alertEl = await screen.findByRole('alert');
    expect(alertEl).toBeTruthy();
    expect(alertEl.textContent).toContain('order_form.error_missing_field');

    // Le formulaire reste disponible pour une nouvelle soumission (Req 11.7).
    expect(container.querySelector('form')).toBeTruthy();
    // Aucune confirmation de succès n'est affichée.
    expect(screen.queryByText('order_form.success')).toBeNull();

    // Les valeurs saisies sont conservées (Req 11.7).
    expect(document.getElementById('order-customer-name').value).toBe(values.customerName);
    expect(document.getElementById('order-customer-phone').value).toBe(values.customerPhone);
    expect(document.getElementById('order-details').value).toBe(values.details);
  });
});

describe('FormulaireCommande — préservation du comportement (Req 11.8)', () => {
  it('déclenche les mêmes appels Supabase avec les mêmes arguments (upload puis submit_remote_order)', async () => {
    const { lien, token } = buildValidLink();
    routeParams.lien = lien;
    sb.uploadResult = { error: null };
    sb.rpcResult = { error: null };

    const { container } = render(<FormulaireCommande />);

    const { values, file } = fillAllRequired();
    fireEvent.submit(container.querySelector('form'));

    // 1. Dépôt de la Preuve dans le bucket privé `order-proofs`.
    await waitFor(() => {
      expect(sb.from).toHaveBeenCalledWith('order-proofs');
      expect(sb.upload).toHaveBeenCalledTimes(1);
    });
    const [proofPath, uploadedFile] = sb.upload.mock.calls[0];
    expect(proofPath).toContain('agency-123/');
    expect(proofPath).toContain(`${token}/`);
    expect(uploadedFile).toBe(file);

    // 2. Enregistrement via la RPC SECURITY DEFINER avec les arguments attendus.
    await waitFor(() => {
      expect(sb.rpc).toHaveBeenCalledTimes(1);
    });
    expect(sb.rpc).toHaveBeenCalledWith('submit_remote_order', {
      p_token: token,
      p_customer_name: values.customerName,
      p_customer_phone: values.customerPhone,
      p_details: values.details,
      p_proof_path: proofPath,
    });

    // L'ordre est bien upload PUIS rpc (préservation du comportement, Req 11.8).
    expect(sb.upload.mock.invocationCallOrder[0]).toBeLessThan(
      sb.rpc.mock.invocationCallOrder[0]
    );
  });
});
