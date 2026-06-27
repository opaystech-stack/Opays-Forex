import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Force le mode démo (mock/localStorage) en neutralisant Supabase.
vi.mock('../services/supabase', () => ({ supabase: null }));

import { AppProvider, useApp } from './AppContext';

// En environnement de test, Supabase n'est pas configuré => mode mock (localStorage).
const wrapper = ({ children }) => <AppProvider>{children}</AppProvider>;

async function mountApp() {
  const { result } = renderHook(() => useApp(), { wrapper });
  await waitFor(() => expect(result.current.isUsingMock).toBe(true));
  await waitFor(() => expect(result.current.debts.length).toBeGreaterThan(0));
  return result;
}

beforeEach(() => {
  localStorage.clear();
});

describe('Registre des dettes (AppContext)', () => {
  // Feature: saas-finalization, Property 7: Round-trip de création d'une dette
  it('conserve les champs et démarre au statut pending', async () => {
    const result = await mountApp();
    await act(async () => {
      await result.current.createDebt({ type: 'receivable', amount: 320, currency: 'KES', counterparty_name: 'Ali', note: 'avance' });
    });
    const created = result.current.debts.find((d) => d.counterparty_name === 'Ali');
    expect(created).toBeTruthy();
    expect(created.type).toBe('receivable');
    expect(created.amount).toBe(320);
    expect(created.currency).toBe('KES');
    expect(created.note).toBe('avance');
    expect(created.status).toBe('pending');
  });

  // Feature: saas-finalization, Property 8: Validation des champs obligatoires d'une dette
  it('rejette une dette invalide sans modifier le grand livre', async () => {
    const result = await mountApp();
    const before = result.current.debts.length;
    let res;
    await act(async () => {
      res = await result.current.createDebt({ type: 'receivable', currency: 'USD' }); // montant manquant
    });
    expect(res.success).toBe(false);
    await act(async () => {
      res = await result.current.createDebt({ amount: 10, currency: 'USD' }); // type manquant
    });
    expect(res.success).toBe(false);
    await act(async () => {
      res = await result.current.createDebt({ type: 'payable', amount: 10 }); // devise manquante
    });
    expect(res.success).toBe(false);
    expect(result.current.debts.length).toBe(before);
  });

  // Feature: saas-finalization, Property 9: Séparation des totaux créances / dettes
  it('sépare les totaux créances et dettes en USD', async () => {
    const result = await mountApp();
    // État initial mock : d1 receivable 200 USD, d2 payable 150000 CDF (taux 2500 => 60 USD)
    const totals = result.current.getDebtTotals();
    expect(totals.receivableUSD).toBeCloseTo(200, 4);
    expect(totals.payableUSD).toBeCloseTo(60, 4);
  });

  // Feature: saas-finalization, Property 10: Règlement immédiat et idempotent d'une dette
  it('règle immédiatement et de façon idempotente', async () => {
    const result = await mountApp();
    const target = result.current.debts[0];
    await act(async () => {
      await result.current.updateDebtStatus(target.id, 'settled');
    });
    expect(result.current.debts.find((d) => d.id === target.id).status).toBe('settled');
    await act(async () => {
      await result.current.updateDebtStatus(target.id, 'settled');
    });
    expect(result.current.debts.find((d) => d.id === target.id).status).toBe('settled');
  });

  // Feature: saas-finalization, Property 11: Le registre des dettes n'affecte pas les soldes des portefeuilles
  it('ne modifie pas les soldes des portefeuilles', async () => {
    const result = await mountApp();
    const before = result.current.wallets.map((w) => ({ id: w.id, balance: w.balance }));
    await act(async () => {
      await result.current.createDebt({ type: 'payable', amount: 999, currency: 'USD' });
    });
    const after = result.current.wallets.map((w) => ({ id: w.id, balance: w.balance }));
    expect(after).toEqual(before);
  });

  // _Requirements: 5.8_ — persistance en mode démo dans localStorage
  it('persiste les dettes dans localStorage en mode démo', async () => {
    const result = await mountApp();
    await act(async () => {
      await result.current.createDebt({ type: 'receivable', amount: 42, currency: 'USD', counterparty_name: 'Persist' });
    });
    const stored = JSON.parse(localStorage.getItem('forex_debts'));
    expect(stored.some((d) => d.counterparty_name === 'Persist')).toBe(true);
  });
});
