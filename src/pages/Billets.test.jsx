import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { computeFlightProfit } from '../utils/flightBooking';

// i18n neutralisé : useT renvoie la clé (rendu déterministe et isolé).
// `t` est défini UNE SEULE FOIS via vi.hoisted (référence stable) pour éviter
// toute boucle de re-render via les useMemo dépendant de `t`.
const stableT = vi.hoisted(() => (key) => key);
vi.mock('../i18n', () => ({
  useT: () => stableT,
}));

// État et spies du contexte applicatif, hoistés pour être visibles dans vi.mock.
// `moduleEnabled` pilote l'activation du Module_Additionnel `billets_avion`
// (Req 12.1) ; `canSell` pilote la permission `services.vendre` (Req 12.1).
const ctx = vi.hoisted(() => ({
  moduleEnabled: true,
  canSell: true,
  loading: false,
  flightBookings: [],
  createFlightBooking: vi.fn(),
  deleteFlightBooking: vi.fn(),
  hasPermission: vi.fn(),
  isModuleEnabled: vi.fn(),
}));

vi.mock('../context/AppContext', () => ({
  useApp: () => ({
    flightBookings: ctx.flightBookings,
    createFlightBooking: ctx.createFlightBooking,
    deleteFlightBooking: ctx.deleteFlightBooking,
    hasPermission: ctx.hasPermission,
    isModuleEnabled: ctx.isModuleEnabled,
    loading: ctx.loading,
  }),
}));

import Billets from './Billets';

const fmt = new Intl.NumberFormat('fr-FR');

beforeEach(() => {
  ctx.moduleEnabled = true;
  ctx.canSell = true;
  ctx.loading = false;
  ctx.flightBookings = [];
  ctx.createFlightBooking.mockReset().mockResolvedValue({ success: true });
  ctx.deleteFlightBooking.mockReset().mockResolvedValue({ success: true });
  ctx.hasPermission.mockReset().mockImplementation((perm) =>
    perm === 'services.vendre' ? ctx.canSell : false,
  );
  ctx.isModuleEnabled.mockReset().mockImplementation((key) =>
    key === 'billets_avion' ? ctx.moduleEnabled : false,
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Billets — rendu conditionnel selon module (Req 12.1)', () => {
  it('affiche le message de module désactivé et masque le formulaire quand le module est désactivé', () => {
    ctx.moduleEnabled = false;
    render(<Billets />);

    // Message de module désactivé affiché (Req 12.1).
    expect(screen.getByText('billets.module_disabled')).toBeTruthy();
    // Formulaire de réservation non rendu.
    expect(screen.queryByText('billets.save')).toBeNull();
    expect(screen.queryByText('billets.ticket_number_label')).toBeNull();
    expect(ctx.isModuleEnabled).toHaveBeenCalledWith('billets_avion');
  });

  it('affiche le refus de permission et masque le formulaire sans services.vendre (Req 12.1)', () => {
    ctx.moduleEnabled = true;
    ctx.canSell = false;
    render(<Billets />);

    expect(screen.queryByText('billets.module_disabled')).toBeNull();
    expect(screen.getByText('billets.permission_denied')).toBeTruthy();
    expect(screen.queryByText('billets.save')).toBeNull();
  });
});

describe('Billets — réservation enrichie (Req 12.2)', () => {
  it('rend tous les champs enrichis de la Reservation_Billet quand le module est activé', () => {
    ctx.moduleEnabled = true;
    ctx.canSell = true;
    render(<Billets />);

    // L'ensemble des champs enrichis d'une Reservation_Billet est présent (Req 12.2) :
    // nom client, n° de billet, compagnie, aéroports, destination, contact WhatsApp,
    // prix agence, prix client, et le délai de rappel de vol.
    expect(screen.getByText('billets.customer_name_label')).toBeTruthy();
    expect(screen.getByText('billets.ticket_number_label')).toBeTruthy();
    expect(screen.getByText('billets.airline_label')).toBeTruthy();
    expect(screen.getByText('billets.departure_airport_label')).toBeTruthy();
    expect(screen.getByText('billets.arrival_airport_label')).toBeTruthy();
    expect(screen.getByText('billets.destination_label')).toBeTruthy();
    expect(screen.getByText('billets.whatsapp_label')).toBeTruthy();
    expect(screen.getByText('billets.agency_price_label')).toBeTruthy();
    expect(screen.getByText('billets.client_price_label')).toBeTruthy();
    expect(screen.getByText('billets.lead_time_label')).toBeTruthy();
    expect(screen.getByText('billets.flight_date_label')).toBeTruthy();
  });

  it('affiche un aperçu de marge cohérent avec computeFlightProfit (Req 12.2, 12.3)', () => {
    ctx.moduleEnabled = true;
    ctx.canSell = true;
    const { container } = render(<Billets />);

    // L'aperçu de marge est initialisé à 0 (prix vides) via computeFlightProfit.
    expect(screen.getByText(fmt.format(computeFlightProfit('', '')))).toBeTruthy();

    // Les champs prix sont les deux premiers <input type="number"> du formulaire
    // (prix agence puis prix client) ; le 3e étant le délai de rappel.
    const numberInputs = container.querySelectorAll('input[type="number"]');
    const agencyPriceInput = numberInputs[0];
    const customerPriceInput = numberInputs[1];

    fireEvent.change(agencyPriceInput, { target: { value: '300' } });
    fireEvent.change(customerPriceInput, { target: { value: '800' } });

    // La marge affichée correspond exactement à computeFlightProfit(client, agence)
    // = 800 - 300 = 500, mis en forme par le même formateur que l'écran (Req 12.3).
    const expected = fmt.format(computeFlightProfit('800', '300'));
    expect(expected).toBe('500');
    expect(screen.getByText(expected)).toBeTruthy();
  });
});
