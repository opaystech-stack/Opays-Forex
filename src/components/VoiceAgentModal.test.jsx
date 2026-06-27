import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

// i18n neutralisé : useT renvoie la clé (rendu déterministe et isolé).
// La fonction `t` est définie UNE SEULE FOIS via vi.hoisted (référence stable)
// pour éviter que les useCallback/useEffect dépendant de `t` ne se ré-exécutent
// en boucle infinie à chaque re-render.
const stableT = vi.hoisted(() => (key) => key);
vi.mock('../i18n', () => ({
  useT: () => stableT,
}));

// Spies/état du contexte applicatif, hoistés pour être visibles dans vi.mock.
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
vi.mock('../services/supabase', () => ({
  supabase: null,
}));

import VoiceAgentModal from './VoiceAgentModal';

// --- Stubs des API média du navigateur (jsdom ne les fournit pas) -----------

// MediaRecorder factice : stop() déclenche ondataavailable + onstop pour
// enchaîner sur processAudio comme le ferait le vrai enregistreur.
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

// Props par défaut avec des spies pour observer les exécutions.
const makeProps = (overrides = {}) => ({
  open: true,
  onClose: vi.fn(),
  onConfirmOperation: vi.fn().mockResolvedValue({ success: true }),
  onSearchHistory: vi.fn(),
  ...overrides,
});

beforeEach(() => {
  ctx.addTransaction.mockReset().mockResolvedValue({ success: true });
  ctx.findOrCreateCustomer.mockReset().mockResolvedValue({ success: true, data: { id: 'c-1' } });
  ctx.convertToUSD.mockReset().mockReturnValue(100);

  global.MediaRecorder = MockMediaRecorder;
  // Par défaut : micro accordé (chaque test peut le surcharger).
  global.navigator.mediaDevices = {
    getUserMedia: vi.fn().mockResolvedValue(makeFakeStream()),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('VoiceAgentModal', () => {
  it('ne rend rien lorsque open=false', () => {
    const props = makeProps({ open: false });
    const { container } = render(<VoiceAgentModal {...props} />);

    expect(container.firstChild).toBeNull();
    expect(global.navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it('refus micro → message d\'erreur affiché et dashboard inchangé (aucune exécution)', async () => {
    global.navigator.mediaDevices.getUserMedia = vi
      .fn()
      .mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'));

    const props = makeProps();
    render(<VoiceAgentModal {...props} />);

    // Le message d'autorisation micro doit apparaître (Ex. 5.6, 10.5).
    await waitFor(() => {
      expect(screen.getByText(/voice_agent\.mic_denied/)).toBeTruthy();
    });

    // Aucune opération exécutée : la validation explicite n'a pas eu lieu.
    expect(props.onConfirmOperation).not.toHaveBeenCalled();
    expect(ctx.addTransaction).not.toHaveBeenCalled();
  });

  it('Mode_Simule (supabase null) : la phase REVIEW affiche transcription + confirmation', async () => {
    const props = makeProps();
    render(<VoiceAgentModal {...props} />);

    // Attente du démarrage de l'écoute (bouton stop disponible).
    const stopBtn = await screen.findByRole('button', { name: /voice_agent\.stop/ });

    // Arrêt de l'écoute → transcription → Mode_Simule → REVIEW.
    fireEvent.click(stopBtn);

    await waitFor(() => {
      expect(screen.getByTestId('voice-agent-transcription')).toBeTruthy();
      expect(screen.getByTestId('voice-agent-confirmation')).toBeTruthy();
    });
  });

  it('aucune exécution sans validation explicite : addTransaction n\'est appelé qu\'après clic sur Confirmer', async () => {
    const props = makeProps({ onConfirmOperation: undefined });
    render(<VoiceAgentModal {...props} />);

    const stopBtn = await screen.findByRole('button', { name: /voice_agent\.stop/ });
    fireEvent.click(stopBtn);

    // On atteint la phase REVIEW avec le bouton de confirmation.
    const confirmBtn = await screen.findByTestId('voice-agent-confirm');

    // Avant validation explicite : aucune transaction enregistrée.
    expect(ctx.addTransaction).not.toHaveBeenCalled();

    // Validation explicite.
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(ctx.addTransaction).toHaveBeenCalledTimes(1);
    });
  });

  it('validation explicite via onConfirmOperation lorsque la prop est fournie', async () => {
    const props = makeProps();
    render(<VoiceAgentModal {...props} />);

    const stopBtn = await screen.findByRole('button', { name: /voice_agent\.stop/ });
    fireEvent.click(stopBtn);

    const confirmBtn = await screen.findByTestId('voice-agent-confirm');
    expect(props.onConfirmOperation).not.toHaveBeenCalled();

    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(props.onConfirmOperation).toHaveBeenCalledTimes(1);
    });
    // addTransaction n'est pas appelé quand onConfirmOperation gère l'opération.
    expect(ctx.addTransaction).not.toHaveBeenCalled();
  });
});
