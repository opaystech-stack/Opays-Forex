import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { computeOperationAmounts } from '../utils/finance';

// --- Mocks (mêmes patterns que VoiceAgentModal.test.jsx) --------------------

// i18n neutralisé : `useT` renvoie la clé (rendu déterministe). Référence stable
// via vi.hoisted pour éviter les ré-exécutions en boucle des useCallback/useEffect.
const stableT = vi.hoisted(() => (key) => key);
vi.mock('../i18n', () => ({
  useT: () => stableT,
}));

// Contexte applicatif hoisté pour être visible dans vi.mock.
const ctx = vi.hoisted(() => ({
  wallets: [
    { id: 'w-usd', name: 'Caisse USD Cash', currency: 'USD' },
    { id: 'w-ugx', name: 'MTN Uganda (UGX)', currency: 'UGX' },
  ],
  addTransaction: vi.fn(),
  findOrCreateCustomer: vi.fn(),
  convertToUSD: vi.fn(),
}));

vi.mock('../context/AppContext', () => ({
  useApp: () => ({
    wallets: ctx.wallets,
    addTransaction: ctx.addTransaction,
    findOrCreateCustomer: ctx.findOrCreateCustomer,
    convertToUSD: ctx.convertToUSD,
  }),
}));

// Supabase forcé à `null` : bascule Mode_Simule déterministe dans processAudio.
// La transcription simulée est une opération de change (type 'exchange',
// sourceAmount '100', destAmount '366000') — idéale pour l'ajustement de taux.
vi.mock('../services/supabase', () => ({
  supabase: null,
}));

import VoiceAgentModal from './VoiceAgentModal';

// MediaRecorder factice : stop() enchaîne ondataavailable + onstop → processAudio.
class MockMediaRecorder {
  constructor(stream) {
    this.stream = stream;
    this.state = 'inactive';
    this.ondataavailable = null;
    this.onstop = null;
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    if (this.ondataavailable) this.ondataavailable({ data: { size: 8 } });
    if (this.onstop) this.onstop();
  }
}

const makeFakeStream = () => ({
  getTracks: () => [{ stop: vi.fn() }],
});

const makeProps = (overrides = {}) => ({
  open: true,
  onClose: vi.fn(),
  onConfirmOperation: vi.fn().mockResolvedValue({ success: true }),
  onSearchHistory: vi.fn(),
  ...overrides,
});

// Atteint la phase REVIEW d'une opération de change via le Mode_Simule.
const reachReview = async (props) => {
  render(<VoiceAgentModal {...props} />);
  const stopBtn = await screen.findByRole('button', { name: /voice_agent\.stop/ });
  fireEvent.click(stopBtn);
  // La zone d'ajustement des taux n'apparaît que pour une opération de change.
  return screen.findByTestId('voice-agent-rate-adjust');
};

beforeEach(() => {
  ctx.addTransaction.mockReset().mockResolvedValue({ success: true });
  ctx.findOrCreateCustomer.mockReset().mockResolvedValue({ success: true, data: { id: 'c-1' } });
  ctx.convertToUSD.mockReset().mockReturnValue(100);

  global.MediaRecorder = MockMediaRecorder;
  global.navigator.mediaDevices = {
    getUserMedia: vi.fn().mockResolvedValue(makeFakeStream()),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('VoiceAgentModal — ajustement des taux (Req 7.7) et non-régression (Req 18.4)', () => {
  // (a) Recalcul du Montant_Service et du montant converti après ajustement des
  // taux, via computeOperationAmounts (Req 7.7).
  it('recalcule le Montant_Service et le montant converti après ajustement des taux (Req 7.7)', async () => {
    const props = makeProps();
    const rateAdjust = await reachReview(props);

    // État initial (Taux_Service vide ⇒ 0) : le montant converti est seedé sur
    // les montants extraits (366000 = 100 × 3660), sans Montant_Service.
    expect(rateAdjust.textContent).toContain('366000');

    const exchangeRateInput = within(rateAdjust).getByTestId('voice-agent-exchange-rate');
    const serviceRateInput = within(rateAdjust).getByTestId('voice-agent-service-rate');

    // Ajustement explicite des taux : Taux_Change = 4000, Taux_Service = 10 %.
    fireEvent.change(exchangeRateInput, { target: { value: '4000' } });
    fireEvent.change(serviceRateInput, { target: { value: '10' } });

    // Valeurs de référence calculées par la fonction pure du domaine.
    const expected = computeOperationAmounts({
      sourceAmount: 100,
      exchangeRate: 4000,
      serviceRate: 10,
      destDecimals: 2,
    });
    expect(expected.ok).toBe(true);
    expect(expected.montantService).toBe(10);
    expect(expected.destAmount).toBe(360000);

    // Le rendu reflète le recalcul : Montant_Service prélevé puis converti sur
    // le net (90 × 4000 = 360000), et non plus la valeur seed initiale.
    await waitFor(() => {
      expect(rateAdjust.textContent).toContain(String(expected.destAmount));
      expect(rateAdjust.textContent).toContain(String(expected.montantService));
    });
    expect(rateAdjust.textContent).not.toContain('366000');

    // Le montant converti recalculé est bien restitué dans sa ligne dédiée.
    const convertedLabel = within(rateAdjust).getByText('voice_agent.converted_amount');
    expect(convertedLabel.parentElement.textContent).toContain('360000');
  });

  // (b1) Non-régression : le flux vocal existant atteint REVIEW et la
  // Confirmation explicite déclenche l'exécution (Req 18.4).
  it('non-régression : le flux vocal atteint REVIEW et la confirmation explicite exécute l\'opération (Req 18.4)', async () => {
    const props = makeProps();
    await reachReview(props);

    const confirmBtn = await screen.findByTestId('voice-agent-confirm');
    // Avec les taux seedés valides, la Confirmation est ouverte.
    expect(confirmBtn.disabled).toBe(false);
    expect(props.onConfirmOperation).not.toHaveBeenCalled();

    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(props.onConfirmOperation).toHaveBeenCalledTimes(1);
    });
    // L'opération de change porte un Taux_Service par défaut nul (no-op, Req 7.8).
    const payload = props.onConfirmOperation.mock.calls[0][0];
    expect(payload.type).toBe('exchange');
    expect(payload.service_rate).toBe(0);
    expect(payload.service_amount).toBe(0);
  });

  // (b2) Non-régression : un Taux_Change invalide bloque la Confirmation et
  // signale l'erreur (Req 7.4 / 7.5 / 18.4).
  it('non-régression : un taux ajusté invalide bloque la confirmation et affiche l\'erreur (Req 7.4/7.5/18.4)', async () => {
    const props = makeProps();
    const rateAdjust = await reachReview(props);

    const exchangeRateInput = within(rateAdjust).getByTestId('voice-agent-exchange-rate');

    // Taux_Change nul ⇒ invalide (doit être strictement positif, Req 7.4).
    fireEvent.change(exchangeRateInput, { target: { value: '0' } });

    // Le message d'erreur de taux apparaît et la Confirmation est bloquée.
    const errorEl = await screen.findByTestId('voice-agent-rate-error');
    expect(errorEl).toBeTruthy();

    const confirmBtn = screen.getByTestId('voice-agent-confirm');
    await waitFor(() => {
      expect(confirmBtn.disabled).toBe(true);
    });

    // Aucune exécution tant que le taux est invalide.
    fireEvent.click(confirmBtn);
    expect(props.onConfirmOperation).not.toHaveBeenCalled();
    expect(ctx.addTransaction).not.toHaveBeenCalled();
  });
});
