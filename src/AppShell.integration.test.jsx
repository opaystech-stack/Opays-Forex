import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';

// i18n neutralisé : useT renvoie la clé pour un rendu déterministe et isolé.
vi.mock('./i18n', () => ({
  useT: () => (key) => key,
}));

// Contexte applicatif neutralisé : AppProvider passe-plat, useApp renvoie un
// état d'utilisateur authentifié et suffisamment complet pour rendre AppShell.
const mockState = {
  user: { id: 'u-1', email: 'audit@opaysfox.test' },
  loading: false,
  hasCredentials: true,
  isUsingMock: false,
  wallets: [],
  transactions: [],
  expenses: [],
  loans: [],
  customers: [],
  debts: [],
  getNetWorthUSD: () => 0,
  getDrafts: () => [],
  getCompletedTransactions: () => [],
  addTransaction: vi.fn(),
  // paid-access-control : AccessGate exige profileStatus='ready' et
  // isAccessGranted retournant true pour afficher AppShell (R2.1).
  profileStatus: 'ready',
  profilAcces: { acces_autorise: true, role: 'user' },
  isAccessGranted: () => true,
  isAdmin: () => false,
};

vi.mock('./context/AppContext', () => ({
  AppProvider: ({ children }) => children,
  useApp: () => mockState,
}));

// On isole l'en-tête : les pages lazy et la Navbar sont remplacées par des
// stubs, et VoiceAgentModal par un stub, afin de tester uniquement la
// Barre_Actions_Dashboard et le bouton « Agent vocal ».
vi.mock('./components/Navbar', () => ({
  default: () => <nav data-testid="navbar-stub" />,
}));

vi.mock('./components/VoiceAgentModal', () => ({
  default: ({ open }) => (
    <div data-testid="voice-agent-modal-stub" data-open={open ? 'true' : 'false'} />
  ),
}));

vi.mock('./pages/Dashboard', () => ({
  default: () => <div data-testid="dashboard-stub" />,
}));
vi.mock('./pages/Transactions', () => ({ default: () => <div data-testid="transactions-stub" /> }));
vi.mock('./pages/Wallets', () => ({ default: () => <div data-testid="wallets-stub" /> }));
vi.mock('./pages/Expenses', () => ({ default: () => <div data-testid="expenses-stub" /> }));
vi.mock('./pages/Loans', () => ({ default: () => <div data-testid="loans-stub" /> }));
vi.mock('./pages/Settings', () => ({ default: () => <div data-testid="settings-stub" /> }));
vi.mock('./pages/SignIn', () => ({ default: () => <div data-testid="signin-stub" /> }));
vi.mock('./pages/SignUp', () => ({ default: () => <div data-testid="signup-stub" /> }));
vi.mock('./pages/Home', () => ({ default: () => <div data-testid="home-stub" /> }));
vi.mock('./pages/Debts', () => ({ default: () => <div data-testid="debts-stub" /> }));

import App from './App';

// Rend l'AppShell authentifié sur /app/dashboard et attend que l'en-tête soit
// présent (le bouton « Agent vocal » est rendu hors Suspense, donc synchrone).
async function renderAppShell() {
  window.history.pushState({}, '', '/app/dashboard');
  const view = render(<App />);
  await waitFor(() => {
    expect(document.querySelector('.app-header')).toBeTruthy();
  });
  return view;
}

describe('AppShell — Barre_Actions_Dashboard et bouton « Agent vocal » (R10.1, R11.3, R11.4)', () => {
  beforeEach(() => {
    mockState.user = { id: 'u-1', email: 'audit@opaysfox.test' };
    mockState.loading = false;
    mockState.hasCredentials = true;
    mockState.isUsingMock = false;
  });

  afterEach(() => {
    cleanup();
  });

  it('affiche le bouton « Agent vocal » (voice-agent-btn) dans l\'en-tête quand l\'utilisateur est connecté (R10.1, R11.3)', async () => {
    await renderAppShell();

    const voiceBtn = document.querySelector('.app-header .voice-agent-btn');
    expect(voiceBtn).toBeTruthy();
    // Libellé issu de la clé i18n (useT renvoie la clé en mode test).
    expect(voiceBtn.textContent).toContain('dashboard.voice_agent');
    expect(voiceBtn.getAttribute('aria-label')).toBe('dashboard.voice_agent_aria');
  });

  it('conserve la présence des boutons existants settings-fab et clients-fab (R11.4)', async () => {
    await renderAppShell();

    expect(document.querySelector('.app-header .clients-fab')).toBeTruthy();
    expect(document.querySelector('.app-header .settings-fab')).toBeTruthy();
  });

  it('conserve l\'ordre des boutons : clients-fab puis settings-fab puis voice-agent-btn (R11.4)', async () => {
    await renderAppShell();

    const buttons = Array.from(
      document.querySelectorAll('.app-header button')
    ).map((b) => b.className.trim());

    const idxClients = buttons.indexOf('clients-fab');
    const idxSettings = buttons.indexOf('settings-fab');
    const idxVoice = buttons.indexOf('voice-agent-btn');

    expect(idxClients).toBeGreaterThanOrEqual(0);
    expect(idxSettings).toBeGreaterThan(idxClients);
    expect(idxVoice).toBeGreaterThan(idxSettings);
  });

  it('place le bouton « Agent vocal » immédiatement adjacent à « Paramètres » (R10.2, R10.3 best-effort, R11.4)', async () => {
    await renderAppShell();

    const settingsBtn = document.querySelector('.app-header .settings-fab');
    const voiceBtn = document.querySelector('.app-header .voice-agent-btn');

    // Adjacence DOM : voice-agent-btn suit directement settings-fab dans le même
    // conteneur (coexistence vérifiable sans moteur de layout).
    expect(settingsBtn.nextElementSibling).toBe(voiceBtn);
    expect(voiceBtn.parentElement).toBe(settingsBtn.parentElement);
  });

  it('rend le VoiceAgentModal (fermé par défaut) dans l\'AppShell (R12.6)', async () => {
    await renderAppShell();

    const modal = document.querySelector('[data-testid="voice-agent-modal-stub"]');
    expect(modal).toBeTruthy();
    expect(modal.getAttribute('data-open')).toBe('false');
  });
});
