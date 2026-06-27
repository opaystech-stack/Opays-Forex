import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import CustomerCard from './CustomerCard';

// On neutralise le hook i18n : `t(key)` renvoie la clé elle-même, ce qui rend
// le composant isolément et rend les libellés déterministes dans les tests.
vi.mock('../i18n', () => ({
  useT: () => (key) => key,
}));

afterEach(() => {
  cleanup();
});

// Tests UI de la Fiche_Client (Exigences 9.2, 9.3, 9.4, 9.7).
describe('CustomerCard', () => {
  const customer = { name: 'Awa Diop', phone: '+221 77 123 45 67' };

  it("liste vide : total 0 et message d'absence (Ex. 9.3, 9.4)", () => {
    render(<CustomerCard customer={customer} operations={[]} />);

    // La carte est rendue.
    expect(screen.getByTestId('customer-card')).toBeTruthy();

    // Le total affiché vaut 0.
    expect(screen.getByTestId('customer-card-total').textContent).toBe('0');

    // Le message d'absence est présent.
    expect(screen.getByTestId('customer-card-empty')).toBeTruthy();
  });

  it('avec opérations : total correct, tri décroissant, dates JJ/MM/AAAA et montants à 2 décimales (Ex. 9.2, 9.3, 9.7)', () => {
    // Dates locales (sans 'Z') pour éviter tout décalage de fuseau horaire.
    const operations = [
      { id: 'a', timestamp: '2024-03-10T09:00:00', source_amount: 50.5, type: 'exchange' },
      { id: 'b', timestamp: '2024-05-20T09:00:00', amount: 200, type: 'deposit' },
      { id: 'c', timestamp: '2024-01-05T09:00:00', dest_amount: 30, type: 'withdrawal' },
    ];

    render(<CustomerCard customer={customer} operations={operations} />);

    // Total = nombre d'opérations.
    expect(screen.getByTestId('customer-card-total').textContent).toBe('3');

    // Le message d'absence ne doit PAS être présent.
    expect(screen.queryByTestId('customer-card-empty')).toBeNull();

    // Récupère les lignes de l'historique dans l'ordre d'affichage.
    const rows = Array.from(document.querySelectorAll('tbody tr.customer-card-row'));
    expect(rows.length).toBe(3);

    const cellsOf = (row) => Array.from(row.querySelectorAll('td')).map((td) => td.textContent.trim());

    // Tri décroissant : plus récent (mai) d'abord, puis mars, puis janvier.
    const [r0, r1, r2] = rows.map(cellsOf);
    expect(r0[0]).toBe('20/05/2024'); // date JJ/MM/AAAA
    expect(r1[0]).toBe('10/03/2024');
    expect(r2[0]).toBe('05/01/2024');

    // Montants à exactement 2 décimales, valeur correcte selon la source choisie.
    expect(r0[1]).toBe('200.00'); // amount
    expect(r1[1]).toBe('50.50'); // source_amount
    expect(r2[1]).toBe('30.00'); // dest_amount
    rows.forEach((row) => {
      const amount = cellsOf(row)[1];
      expect(amount).toMatch(/^\d+\.\d{2}$/);
    });

    // Libellés de type (via les clés i18n mockées).
    expect(r0[2]).toBe('transactions.deposit_label');
    expect(r1[2]).toBe('transactions.exchange_label');
    expect(r2[2]).toBe('transactions.withdrawal_label');
  });

  it('opérations de même date : la plus récemment enregistrée est affichée en premier (Ex. 9.7)', () => {
    const operations = [
      { id: 'first', timestamp: '2024-02-01T09:00:00', amount: 10, type: 'deposit' },
      { id: 'second', timestamp: '2024-02-01T09:00:00', amount: 20, type: 'deposit' },
    ];

    render(<CustomerCard customer={customer} operations={operations} />);

    const rows = Array.from(document.querySelectorAll('tbody tr.customer-card-row'));
    expect(rows.length).toBe(2);

    // L'opération enregistrée en dernier (index le plus élevé) apparaît en premier.
    const amounts = rows.map((row) => row.querySelectorAll('td')[1].textContent.trim());
    expect(amounts).toEqual(['20.00', '10.00']);
  });

  it("identité : nom et téléphone rendus quand présents (Ex. 9.1)", () => {
    const { container } = render(<CustomerCard customer={customer} operations={[]} />);

    const card = within(container.querySelector('.customer-card'));
    expect(card.getByText('Awa Diop')).toBeTruthy();
    expect(card.getByText('+221 77 123 45 67')).toBeTruthy();
  });

  it('identité : replis affichés quand nom/téléphone absents', () => {
    render(<CustomerCard customer={{}} operations={[]} />);

    // Repli sur les clés i18n mockées.
    expect(screen.getByText('customer_card.no_name')).toBeTruthy();
    expect(screen.getByText('customer_card.no_phone')).toBeTruthy();
  });
});
