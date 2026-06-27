import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';

// i18n neutralisé : `useT` renvoie la clé pour un rendu isolé et déterministe,
// sauf pour les clés qui sont testées sur leur contenu textuel.
vi.mock('../i18n', () => ({
  useT: () => (key) => {
    const overrides = {
      'transactions.same_wallet_error': 'Le portefeuille de départ doit être différent du portefeuille de destination.',
    };
    return overrides[key] ?? key;
  },
}));

// Mode_Simule déterministe : sans Supabase, les flux agents basculent sur les
// données simulées (`simulateOcrResult` / `simulateVoiceResult`).
vi.mock('../services/supabase', () => ({ supabase: null }));

// Spies et état applicatif contrôlés via `vi.hoisted` (référencés dans le
// factory `vi.mock` hissé en tête de module).
const mocks = vi.hoisted(() => ({
  addTransaction: vi.fn(),
  confirmDraft: vi.fn(),
  findOrCreateCustomer: vi.fn(),
  convertToUSD: vi.fn(() => 0),
  wallets: [],
}));

vi.mock('../context/AppContext', () => ({
  useApp: () => ({
    wallets: mocks.wallets,
    addTransaction: mocks.addTransaction,
    confirmDraft: mocks.confirmDraft,
    convertToUSD: mocks.convertToUSD,
    customers: [],
    findOrCreateCustomer: mocks.findOrCreateCustomer,
  }),
}));

import Transactions from './Transactions';

const TWO_WALLETS = [
  { id: 'w1', name: 'Caisse USD', currency: 'USD', balance: 10000 },
  { id: 'w2', name: 'MTN UGX', currency: 'UGX', balance: 10000000 },
];

beforeEach(() => {
  mocks.addTransaction.mockReset();
  mocks.addTransaction.mockResolvedValue({ success: true });
  mocks.confirmDraft.mockReset();
  mocks.confirmDraft.mockResolvedValue({ success: true });
  mocks.findOrCreateCustomer.mockReset();
  mocks.findOrCreateCustomer.mockResolvedValue({
    success: true,
    data: { id: 'c1', name: 'Client Simulé' },
    isNew: false,
  });
  mocks.convertToUSD.mockReset();
  mocks.convertToUSD.mockReturnValue(0);
  mocks.wallets = TWO_WALLETS;

  // Stubs globaux pour l'environnement jsdom.
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock');
  globalThis.navigator.mediaDevices = {
    getUserMedia: vi.fn(() => Promise.reject(new Error('mic refusé'))),
  };
  globalThis.MediaRecorder = vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    state: 'inactive',
  }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const getFileInput = (container) => container.querySelector('input[type="file"]');

describe('Transactions — validation des médias (Ex. 6.6, 6.7)', () => {
  it('rejette un fichier au type MIME non supporté sans aucun traitement ni transmission', () => {
    const { container } = render(<Transactions clearDraftToEdit={() => {}} />);

    const file = new File(['contenu texte'], 'note.txt', { type: 'text/plain' });
    fireEvent.change(getFileInput(container), { target: { files: [file] } });

    // Message d'erreur de format issu de `validateMediaInput` (libellé littéral).
    expect(screen.getByText(/Format non supporté/)).toBeTruthy();

    // Aucun traitement / transmission : ni OCR simulé (findOrCreateCustomer),
    // ni enregistrement (addTransaction).
    expect(mocks.findOrCreateCustomer).not.toHaveBeenCalled();
    expect(mocks.addTransaction).not.toHaveBeenCalled();
  });
});

describe('Transactions — Mode_Simule OCR (Ex. 5.5, 4.6)', () => {
  it('pré-remplit le formulaire après upload d\'une image valide (simulateOcrResult)', async () => {
    const { container } = render(<Transactions clearDraftToEdit={() => {}} />);

    const file = new File(['img'], 'recu.png', { type: 'image/png' });
    fireEvent.change(getFileInput(container), { target: { files: [file] } });

    // Le flux Mode_Simule applique le reçu simulé après un délai (~1,5 s).
    await waitFor(
      () => {
        const [sourceAmount] = container.querySelectorAll('input[type="number"]');
        // Les deux jeux simulés possibles fournissent un montant source non vide.
        expect(['150', '200']).toContain(sourceAmount.value);
      },
      { timeout: 3000 }
    );

    const [, destAmount] = container.querySelectorAll('input[type="number"]');
    expect(Number(destAmount.value)).toBeGreaterThan(0);
  });
});

describe('Transactions — confirmation explicite via handleSubmit (Ex. 5.6, 7.4)', () => {
  it('n\'enregistre pas tant que les champs requis d\'un échange sont incomplets', () => {
    const { container } = render(<Transactions clearDraftToEdit={() => {}} />);

    // Type « exchange » par défaut, montants laissés vides.
    fireEvent.submit(container.querySelector('form'));

    expect(mocks.addTransaction).not.toHaveBeenCalled();
    // Message d'erreur « champs requis » (clé i18n via useT mocké).
    expect(screen.getByText('transactions.required_exchange')).toBeTruthy();
  });

  it('refuse un échange dont les portefeuilles source et destination sont identiques, sans addTransaction', () => {
    // Un seul portefeuille : source et destination convergent sur le même id.
    mocks.wallets = [{ id: 'w1', name: 'Caisse USD', currency: 'USD' }];
    const { container } = render(<Transactions clearDraftToEdit={() => {}} />);

    const [sourceAmount, destAmount] = container.querySelectorAll('input[type="number"]');
    fireEvent.change(sourceAmount, { target: { value: '100' } });
    fireEvent.change(destAmount, { target: { value: '360000' } });

    fireEvent.submit(container.querySelector('form'));

    expect(screen.getByText(/portefeuille de départ doit être différent/)).toBeTruthy();
    expect(mocks.addTransaction).not.toHaveBeenCalled();
  });

  it('enregistre l\'échange via addTransaction lorsque tous les champs requis sont remplis', async () => {
    const { container } = render(<Transactions clearDraftToEdit={() => {}} />);

    const [sourceAmount, destAmount] = container.querySelectorAll('input[type="number"]');
    fireEvent.change(sourceAmount, { target: { value: '100' } });
    fireEvent.change(destAmount, { target: { value: '360000' } });

    fireEvent.submit(container.querySelector('form'));

    await waitFor(() => expect(mocks.addTransaction).toHaveBeenCalledTimes(1));
    const payload = mocks.addTransaction.mock.calls[0][0];
    expect(payload).toMatchObject({
      type: 'exchange',
      source_wallet_id: 'w1',
      dest_wallet_id: 'w2',
      source_amount: 100,
      dest_amount: 360000,
    });
  });
});
