import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';

// ==========================================================================
// Tests d'exemple des extensions multi-agences de AppContext (tâche 13.5)
// --------------------------------------------------------------------------
// Couvre :
//   - Req 7.6 : pré-remplissage du Taux_Service par défaut d'un Client
//               (et repli à 0 si le module `taux_service` est désactivé — Req 7.8) ;
//   - Req 6.6 : persistance des états de module en mode démo (mock localStorage)
//               et refus d'activation d'un Module_Additionnel non habilité ;
//   - Req 6.7 : repli en cas d'échec de persistance — message renvoyé, état inchangé.
// ==========================================================================

// État partagé (hoisté) pilotant le double de Supabase :
//  - `withUser`              : la session renvoie un utilisateur authentifié non-démo
//                              (force le mode connecté, donc `isUsingMock === false`) ;
//  - `agencies`              : lignes renvoyées par `from('agencies').select()` ;
//  - `moduleStatesRows`      : lignes renvoyées par `from('module_states').select()` ;
//  - `failModuleStateUpsert` : l'upsert de `module_states` échoue (forçage de
//                              l'échec de persistance pour la tâche 6.7).
const h = vi.hoisted(() => ({
  withUser: false,
  agencies: [],
  moduleStatesRows: [],
  moduleEntitlementsRows: [],
  failModuleStateUpsert: false,
}));

// Double minimal et chaînable de `services/supabase`.
// Par défaut (`withUser === false`) la session est nulle : combiné à l'absence
// des variables d'environnement Supabase, l'application reste en mode démo
// (`isUsingMock === true`) et pilote son état via les données mock/localStorage.
vi.mock('../services/supabase', () => {
  // Résultat de requête chaînable ET awaitable : un Promise auquel on attache
  // `.order`, `.eq`, `.single` afin de couvrir les usages de `fetchData`.
  const makeQuery = (data) => {
    const p = Promise.resolve({ data, error: null });
    p.order = () => makeQuery(data);
    p.eq = () => makeQuery(data);
    p.single = () =>
      Promise.resolve({ data: Array.isArray(data) ? (data[0] ?? null) : data, error: null });
    return p;
  };

  const tableData = (table) => {
    switch (table) {
      case 'agencies':
        return h.agencies;
      case 'module_states':
        return h.moduleStatesRows;
      case 'module_entitlements':
        return h.moduleEntitlementsRows;
      default:
        return [];
    }
  };

  const from = (table) => ({
    select: () => {
      if (table === 'access_profiles') {
        // Profil_Accès accordé et tracé (accès autorisé en mode connecté).
        return makeQuery({
          acces_autorise: true,
          role: 'admin',
          user_id: 'u1',
          activated_by: 'admin-1',
        });
      }
      return makeQuery(tableData(table));
    },
    insert: () => ({ select: () => Promise.resolve({ data: [{ id: 'mock-id' }], error: null }) }),
    update: () => ({ eq: () => ({ select: () => Promise.resolve({ data: [{}], error: null }) }) }),
    delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
    upsert: () => {
      if (table === 'module_states' && h.failModuleStateUpsert) {
        // Échec de persistance non lié à la RLS (Req 6.7).
        return Promise.resolve({
          error: { message: "Échec d'enregistrement (forçage test)." },
        });
      }
      return Promise.resolve({ error: null });
    },
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

// Monte le provider en mode démo (mock/localStorage) ET connecte l'utilisateur
// démo (Propriétaire_Agence) afin de disposer de la permission `modules.gerer`.
async function mountDemoOwner() {
  const { result } = renderHook(() => useApp(), { wrapper });
  await waitFor(() => expect(result.current.isUsingMock).toBe(true));
  act(() => result.current.loginAsDemo());
  await waitFor(() => expect(result.current.currentRole).toBe('proprietaire'));
  await waitFor(() => expect(result.current.customers.length).toBeGreaterThan(0));
  return result;
}

beforeEach(() => {
  localStorage.clear();
  h.withUser = false;
  h.agencies = [];
  h.moduleStatesRows = [];
  h.moduleEntitlementsRows = [];
  h.failModuleStateUpsert = false;
  // Par défaut : mode démo. On neutralise les identifiants Supabase éventuels
  // fournis par `.env` afin que `hasCredentials` soit faux.
  vi.stubEnv('VITE_SUPABASE_URL', '');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe('AppContext — pré-remplissage du Taux_Service par défaut client (Req 7.6, 7.8)', () => {
  it('prefillServiceRate renvoie le default_service_rate du client quand le module taux_service est activé', async () => {
    const result = await mountDemoOwner();

    // Le module taux_service est activé par défaut en mode démo.
    expect(result.current.isModuleEnabled('taux_service')).toBe(true);

    // Définit un Taux_Service par défaut de 5 % sur le client c1.
    await act(async () => {
      await result.current.updateCustomer('c1', { default_service_rate: 5 });
    });
    await waitFor(() =>
      expect(result.current.getClientDefaultServiceRate('c1')).toBe(5),
    );

    // Req 7.6 : la valeur pré-renseignée est le taux par défaut du client.
    expect(result.current.prefillServiceRate('c1')).toBe(5);
  });

  it('getClientDefaultServiceRate renvoie null pour un client sans taux ou un taux hors bornes [0,100]', async () => {
    const result = await mountDemoOwner();

    // c2 sans default_service_rate -> null, et prefill retombe sur 0.
    expect(result.current.getClientDefaultServiceRate('c2')).toBeNull();
    expect(result.current.prefillServiceRate('c2')).toBe(0);

    // Taux hors bornes -> null (ignoré), prefill retombe sur 0.
    await act(async () => {
      await result.current.updateCustomer('c2', { default_service_rate: 150 });
    });
    await waitFor(() =>
      expect(result.current.getClientDefaultServiceRate('c2')).toBeNull(),
    );
    expect(result.current.prefillServiceRate('c2')).toBe(0);
  });

  it('prefillServiceRate renvoie 0 quand le module taux_service est désactivé (Req 7.8)', async () => {
    const result = await mountDemoOwner();

    // Le client c1 possède un taux par défaut, mais on désactive le module.
    await act(async () => {
      await result.current.updateCustomer('c1', { default_service_rate: 8 });
    });
    await waitFor(() =>
      expect(result.current.getClientDefaultServiceRate('c1')).toBe(8),
    );

    let res;
    await act(async () => {
      res = await result.current.setModuleEnabled('taux_service', false);
    });
    expect(res.success).toBe(true);
    await waitFor(() => expect(result.current.isModuleEnabled('taux_service')).toBe(false));

    // Module désactivé -> aucune commission de service pré-renseignée.
    expect(result.current.prefillServiceRate('c1')).toBe(0);
  });
});

describe('AppContext — persistance et habilitation des modules en mode démo (Req 6.6)', () => {
  it('setModuleEnabled persiste l\'état d\'un module dans le repli mock localStorage', async () => {
    const result = await mountDemoOwner();

    // `prets` est désactivé par défaut ; on l'active.
    expect(result.current.isModuleEnabled('prets')).toBe(false);

    let res;
    await act(async () => {
      res = await result.current.setModuleEnabled('prets', true);
    });
    expect(res.success).toBe(true);

    await waitFor(() => expect(result.current.isModuleEnabled('prets')).toBe(true));
    expect(result.current.moduleStates.prets).toBe(true);

    // Persistance : l'état est écrit dans localStorage (mode démo).
    const persisted = JSON.parse(localStorage.getItem('forex_module_states'));
    expect(persisted.prets).toBe(true);
  });

  it('setModuleEnabled refuse l\'activation d\'un Module_Additionnel non habilité', async () => {
    const result = await mountDemoOwner();

    // Révoque le Droit_Module de `transfert_argent` (habilité par défaut en démo).
    await act(async () => {
      await result.current.setModuleEntitlement(
        result.current.agencyId,
        'transfert_argent',
        false,
      );
    });
    await waitFor(() =>
      expect(result.current.isModuleActivatable('transfert_argent')).toBe(false),
    );

    // Tente l'activation : refus explicite (module non habilité).
    let res;
    await act(async () => {
      res = await result.current.setModuleEnabled('transfert_argent', true);
    });
    expect(res.success).toBe(false);
    expect(res.notEntitled).toBe(true);
    expect(typeof res.error).toBe('string');
    expect(res.error.length).toBeGreaterThan(0);

    // Le module reste non utilisable (non habilité).
    expect(result.current.isModuleEnabled('transfert_argent')).toBe(false);
  });
});

describe('AppContext — repli en cas d\'échec de persistance du module (Req 6.7)', () => {
  // Monte le provider en mode connecté (Supabase) où l'upsert de `module_states`
  // peut échouer. L'utilisateur est Propriétaire_Agence de l'agence courante.
  async function mountConnectedOwnerWithFailingUpsert() {
    h.withUser = true;
    h.agencies = [
      {
        id: 'agency-1',
        owner_id: 'u1',
        name: 'Agence test',
        state: 'active',
        plan_id: null,
        created_at: '2024-01-01T00:00:00.000Z',
      },
    ];
    h.moduleStatesRows = [{ agency_id: 'agency-1', module_key: 'taux_service', enabled: true }];
    h.failModuleStateUpsert = true;
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');

    const { result } = renderHook(() => useApp(), { wrapper });
    await waitFor(() => expect(result.current.isUsingMock).toBe(false));
    await waitFor(() => expect(result.current.currentRole).toBe('proprietaire'));
    return result;
  }

  it('renvoie un message d\'échec et laisse l\'état du module inchangé quand la persistance échoue', async () => {
    const result = await mountConnectedOwnerWithFailingUpsert();

    // État initial : taux_service activé.
    expect(result.current.isModuleEnabled('taux_service')).toBe(true);

    let res;
    await act(async () => {
      res = await result.current.setModuleEnabled('taux_service', false);
    });

    // Contrat Req 6.7 : échec explicite avec message, aucune modification d'état.
    expect(res.success).toBe(false);
    expect(res.persistError).toBe(true);
    expect(typeof res.error).toBe('string');
    expect(res.error.length).toBeGreaterThan(0);

    // L'état reste inchangé : taux_service toujours activé.
    expect(result.current.isModuleEnabled('taux_service')).toBe(true);
    expect(result.current.moduleStates.taux_service).toBe(true);
  });
});
