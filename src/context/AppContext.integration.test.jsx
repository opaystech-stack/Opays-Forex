import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import fc from 'fast-check';

// État partagé (hoisté) pilotant le double de Supabase :
//  - `withUser`         : la session renvoie un utilisateur authentifié non-démo
//                         (force le mode connecté, donc `isUsingMock === false`) ;
//  - `failCustomerInsert` : l'insertion d'un client échoue (forçage de l'échec de
//                         `createCustomer` pour la tâche 7.5).
const h = vi.hoisted(() => ({ withUser: false, failCustomerInsert: false }));

// Double minimal et chaînable de `services/supabase`.
// Par défaut (`withUser === false`) la session est nulle : combiné à l'absence
// des variables d'environnement Supabase, l'application reste en mode démo
// (`isUsingMock === true`) et pilote son état via les données mock/localStorage.
vi.mock('../services/supabase', () => {
  const resolveEmpty = () => Promise.resolve({ data: [], error: null });
  // Objet de requête chaînable : couvre .order() (listes) ET .eq().single()
  // (chargement du Profil_Accès via loadProfile), évitant toute rejection non
  // gérée quand un Utilisateur non démo est monté pendant un test.
  const makeQuery = () => {
    const q = {
      order: () => resolveEmpty(),
      eq: () => q,
      single: () => Promise.resolve({ data: null, error: null }),
    };
    return q;
  };
  const from = (table) => ({
    select: () => makeQuery(),
    insert: () => ({
      select: () => {
        if (table === 'customers' && h.failCustomerInsert) {
          return Promise.resolve({
            data: null,
            error: { message: 'Création client refusée (forçage test).' },
          });
        }
        return Promise.resolve({ data: [{ id: 'mock-id' }], error: null });
      },
    }),
    update: () => ({ eq: () => ({ select: () => Promise.resolve({ data: [{}], error: null }) }) }),
    delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
  });
  return {
    supabase: {
      auth: {
        getSession: () =>
          Promise.resolve({
            data: { session: h.withUser ? { user: { id: 'u1', email: 'op@test' } } : null },
          }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
      from,
    },
  };
});

import { AppProvider, useApp } from './AppContext';

const wrapper = ({ children }) => <AppProvider>{children}</AppProvider>;

// Compteur global garantissant des `transaction_id` réseau uniques entre toutes
// les opérations enregistrées (évite la suspension pour doublon, Ex. 4.4).
let seq = 0;
const nextTxid = () => `IT-TXN-${seq++}`;

// Monte le provider en mode démo (mock/localStorage) et attend l'état stable.
async function mountDemo() {
  const { result } = renderHook(() => useApp(), { wrapper });
  await waitFor(() => expect(result.current.isUsingMock).toBe(true));
  await waitFor(() => expect(result.current.customers.length).toBeGreaterThan(0));
  return result;
}

// Enregistre une opération de type `deposit` rattachée (ou non) à un client.
// `deposit` ne crédite que la destination : aucun risque de fonds insuffisants
// ni de contrainte de portefeuilles distincts, idéal pour piloter l'historique.
async function recordDeposit(result, { customerId, amount = 10 } = {}) {
  const txid = nextTxid();
  let res;
  await act(async () => {
    res = await result.current.addTransaction({
      type: 'deposit',
      dest_wallet_id: 'w1',
      dest_amount: amount,
      transaction_id: txid,
      ...(customerId ? { customer_id: customerId } : {}),
    });
  });
  return { res, txid };
}

beforeEach(() => {
  localStorage.clear();
  seq = 0;
  h.withUser = false;
  h.failCustomerInsert = false;
  // Par défaut : mode démo. On neutralise les identifiants Supabase éventuels
  // fournis par `.env` afin que `hasCredentials` soit faux et que l'application
  // pilote son état via les données mock/localStorage.
  vi.stubEnv('VITE_SUPABASE_URL', '');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const CUSTOMER_IDS = ['c1', 'c2', 'c3'];

describe('AppContext — historique client (intégration)', () => {
  // Feature: financial-ops-audit-voice-agent, Property 20: Appartenance à l'historique du client
  // **Validates: Requirements 9.1, 9.5, 9.6**
  it('toute opération rattachée apparaît dans la fiche du client, et aucune fiche ne contient une opération sans customer_id', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...CUSTOMER_IDS),
        fc.array(fc.integer({ min: 1, max: 5000 }), { minLength: 1, maxLength: 4 }),
        async (customerId, amounts) => {
          localStorage.clear();
          seq = 0;
          const result = await mountDemo();

          // Enregistre les opérations rattachées au client choisi.
          const attachedTxids = [];
          for (const amount of amounts) {
            const { res, txid } = await recordDeposit(result, { customerId, amount });
            expect(res.success).toBe(true);
            attachedTxids.push(txid);
          }

          // Ex. 9.1/9.5 : chaque opération rattachée appartient à l'historique du client.
          const history = result.current.getCustomerHistory(customerId);
          const historyTxids = history.operations.map((o) => o.transaction_id);
          for (const txid of attachedTxids) {
            expect(historyTxids).toContain(txid);
          }
          // Toutes les opérations de l'historique portent bien le customer_id du client.
          for (const op of history.operations) {
            expect(op.customer_id).toBe(customerId);
          }

          // Ex. 9.6 : une opération sans customer_id n'apparaît dans AUCUNE fiche.
          const { res: resNoCust, txid: noCustTxid } = await recordDeposit(result, {});
          expect(resNoCust.success).toBe(true);
          for (const cid of CUSTOMER_IDS) {
            const txids = result.current
              .getCustomerHistory(cid)
              .operations.map((o) => o.transaction_id);
            expect(txids).not.toContain(noCustTxid);
          }

          cleanup();
        },
      ),
      { numRuns: 15 },
    );
  });

  // Exemple déterministe d'appui (Ex. 9.6) : opération non rattachée isolée.
  it('une opération sans customer_id laisse les fiches client inchangées', async () => {
    const result = await mountDemo();
    const before = CUSTOMER_IDS.map((cid) => result.current.getCustomerHistory(cid).total);

    const { res, txid } = await recordDeposit(result, {});
    expect(res.success).toBe(true);

    CUSTOMER_IDS.forEach((cid, i) => {
      const history = result.current.getCustomerHistory(cid);
      expect(history.total).toBe(before[i]);
      expect(history.operations.map((o) => o.transaction_id)).not.toContain(txid);
    });
  });

  // Feature: financial-ops-audit-voice-agent, Property 23: Incrément du total à l'enregistrement
  // **Validates: Requirements 12.5**
  it('enregistrer une opération rattachée incrémente le total de la fiche client de 1', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...CUSTOMER_IDS),
        fc.integer({ min: 1, max: 6 }),
        async (customerId, count) => {
          localStorage.clear();
          seq = 0;
          const result = await mountDemo();

          let previousTotal = result.current.getCustomerHistory(customerId).total;
          for (let i = 0; i < count; i++) {
            const { res } = await recordDeposit(result, { customerId });
            expect(res.success).toBe(true);

            const currentTotal = result.current.getCustomerHistory(customerId).total;
            expect(currentTotal).toBe(previousTotal + 1);
            previousTotal = currentTotal;
          }

          cleanup();
        },
      ),
      { numRuns: 20 },
    );
  });
});

describe('AppContext — échec de création client (intégration, tâche 7.5)', () => {
  // _Requirements: 8.8_
  // Monte le provider en mode connecté (Supabase) pour emprunter le chemin de
  // persistance réel, où l'insertion d'un client peut échouer.
  async function mountConnectedWithFailingCustomerInsert() {
    h.withUser = true;
    h.failCustomerInsert = true;
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    const { result } = renderHook(() => useApp(), { wrapper });
    await waitFor(() => expect(result.current.isUsingMock).toBe(false));
    return result;
  }

  it('findOrCreateCustomer renvoie { success: false } et ne rattache aucun client quand la création échoue', async () => {
    const result = await mountConnectedWithFailingCustomerInsert();

    // Aucun client existant ne correspond : le système tente une création, qui échoue.
    const customersBefore = [...result.current.customers];

    let res;
    await act(async () => {
      res = await result.current.findOrCreateCustomer({
        name: 'Client Nouveau',
        phone: '+243111222333',
      });
    });

    // Contrat Ex. 8.8 : échec explicite, aucun rattachement.
    expect(res.success).toBe(false);
    expect(res.data).toBeUndefined();
    expect(typeof res.error).toBe('string');
    expect(res.error.length).toBeGreaterThan(0);

    // Sans perte : aucun client n'a été ajouté à l'état.
    expect(result.current.customers).toEqual(customersBefore);
  });

  it('par contraste, en l\'absence d\'échec, findOrCreateCustomer crée puis rattache le client (Ex. 8.3)', async () => {
    // Mode démo : la création réussit toujours.
    const result = await mountDemo();
    const before = result.current.customers.length;

    let res;
    await act(async () => {
      res = await result.current.findOrCreateCustomer({
        name: 'Client Frais',
        phone: '+243000111222',
      });
    });

    expect(res.success).toBe(true);
    expect(res.isNew).toBe(true);
    expect(res.data).toBeTruthy();
    expect(res.data.id).toBeTruthy();
    expect(result.current.customers.length).toBe(before + 1);
  });
});
