import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';

// ==========================================================================
// Tests d'integration RLS / cycle de vie / permissions / performance (tache 22.2)
// --------------------------------------------------------------------------
// L'autorite finale de securite est la RLS PostgreSQL : les politiques RLS et
// fonctions SECURITY DEFINER sont verifiees au niveau de la migration par
// supabase/migrations/0003_rls.test.js (assertions statiques, source de verite).
//
// Ce fichier couvre le VOLET COMPORTEMENTAL : il verifie que la commodite de
// gating cote AppContext (consommee par AgencyGate, les pages et la navigation)
// applique les memes regles que la base :
//   - isolation par agence : toute entite creee est estampillee de l'agency_id
//     courant, unique cle de cloisonnement exposee (Req 1.12, 3.6) ;
//   - suspension / reactivation : agencyState bascule et AgencyGate s'appuie sur
//     cette valeur pour bloquer/retablir l'acces (Req 5.2, 5.3, 5.4, 5.6) ;
//   - droits de module : seul l'Editeur_Plateforme modifie un Droit_Module
//     (Req 4.7, 4.8) et un module desactive refuse l'ecriture (Req 6.5) ;
//   - permissions d'ecriture : une action de tresorerie est refusee sans la
//     permission requise (Req 2.8, redouble cote base) ;
//   - concurrence : des ecritures successives ne se perdent pas (Req 17.6) ;
//   - performance : les listes sont paginees a <= 50 elements et le calcul reste
//     sous la borne de 2 s meme pour 50 000 Operations (Req 17.2, 17.5).
//
// Validates: Requirements 1.12, 2.8, 3.6, 4.7, 4.8, 5.2, 5.3, 5.4, 5.6, 17.2, 17.5, 17.6

import { paginate, MAX_PAGE_SIZE } from './utils/pagination';

// Etat hoiste pilotant le double de Supabase (cf. AppContext.agency.test.jsx).
const h = vi.hoisted(() => ({
  withUser: false,
  agencies: [],
  members: [],
  profile: { acces_autorise: true, role: 'user', user_id: 'u1', is_platform_editor: false },
}));

vi.mock('./services/supabase', () => {
  // Resultat chainable ET awaitable couvrant .order/.eq/.single de fetchData.
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
      case 'agency_members':
        return h.members;
      default:
        return [];
    }
  };

  const from = (table) => ({
    select: () => {
      if (table === 'access_profiles') {
        return makeQuery(h.profile);
      }
      return makeQuery(tableData(table));
    },
    insert: () => ({ select: () => Promise.resolve({ data: [{ id: 'mock-id' }], error: null }) }),
    update: () => ({ eq: () => ({ select: () => Promise.resolve({ data: [{}], error: null }) }) }),
    delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
    upsert: () => Promise.resolve({ error: null }),
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

import { AppProvider, useApp } from './context/AppContext';

const wrapper = ({ children }) => <AppProvider>{children}</AppProvider>;

// Monte le provider en mode demo et connecte le Proprietaire_Agence (toutes
// permissions, Droits_Module habilites — Req 2.2).
async function mountDemoOwner() {
  const { result } = renderHook(() => useApp(), { wrapper });
  await waitFor(() => expect(result.current.isUsingMock).toBe(true));
  act(() => result.current.loginAsDemo());
  await waitFor(() => expect(result.current.currentRole).toBe('proprietaire'));
  await waitFor(() => expect(result.current.agencyId).toBeTruthy());
  return result;
}

// Monte le provider en mode connecte (Supabase) avec un Compte_Employe
// `observateur` non Editeur_Plateforme, rattache a une agence dont il n'est PAS
// proprietaire.
async function mountConnectedObserver() {
  h.withUser = true;
  h.agencies = [
    {
      id: 'agency-1',
      owner_id: 'owner-x',
      name: 'Agence test',
      state: 'active',
      plan_id: null,
      created_at: '2024-01-01T00:00:00.000Z',
    },
  ];
  h.members = [
    {
      id: 'mem-1',
      agency_id: 'agency-1',
      user_id: 'u1',
      role: 'observateur',
      activation_state: 'actif',
      permission_grants: [],
      permission_denies: [],
    },
  ];
  h.profile = { acces_autorise: true, role: 'user', user_id: 'u1', is_platform_editor: false };
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');

  const { result } = renderHook(() => useApp(), { wrapper });
  await waitFor(() => expect(result.current.isUsingMock).toBe(false));
  await waitFor(() => expect(result.current.currentRole).toBe('observateur'));
  return result;
}

beforeEach(() => {
  localStorage.clear();
  h.withUser = false;
  h.agencies = [];
  h.members = [];
  h.profile = { acces_autorise: true, role: 'user', user_id: 'u1', is_platform_editor: false };
  vi.stubEnv('VITE_SUPABASE_URL', '');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

// ==========================================================================
// Isolation par agence (Req 1.12, 3.6)
// ==========================================================================
describe('Isolation par agence — estampillage agency_id (Req 1.12, 3.6)', () => {
  it('estampille chaque entite creee de l\'agency_id courant (cle de cloisonnement)', async () => {
    const result = await mountDemoOwner();
    const aid = result.current.agencyId;
    expect(aid).toBeTruthy();

    let res;
    await act(async () => {
      res = await result.current.createTransfer({
        method_id: 'tm_airtel',
        methodActive: true,
        amount: 100,
        commission: 2,
      });
    });

    expect(res.success).toBe(true);
    // Req 3.2/3.6 : l'entite porte l'agency_id de l'agence courante, jamais une autre.
    expect(res.data.agency_id).toBe(aid);
  });

  it('n\'expose que les donnees d\'une seule agence courante (cloisonnement V1)', async () => {
    const result = await mountDemoOwner();
    const aid = result.current.agencyId;

    await act(async () => {
      await result.current.createTransfer({ method_id: 'tm_airtel', methodActive: true, amount: 50, commission: 1 });
      await result.current.createSubscription({
        customer_id: 'c1',
        provider_id: 'sp_0',
        providerActive: true,
        plan: 'Premium',
        amount: 30,
        renewalDate: '2999-01-01',
        today: '2024-01-01',
      });
    });

    await waitFor(() => expect(result.current.transfers.length).toBeGreaterThan(0));
    // Toutes les entites visibles appartiennent a l'agence courante (Req 1.12).
    for (const t of result.current.transfers) {
      expect(t.agency_id).toBe(aid);
    }
    for (const s of result.current.subscriptions) {
      expect(s.agency_id).toBe(aid);
    }
  });
});

// ==========================================================================
// Suspension / reactivation d'agence (Req 5.2, 5.3, 5.4, 5.6)
// ==========================================================================
describe('Cycle de vie de l\'agence — suspension/reactivation (Req 5.2, 5.3, 5.4, 5.6)', () => {
  it('la suspension bascule agencyState a "suspendue" (signal d\'AgencyGate — Req 5.2, 5.4)', async () => {
    const result = await mountDemoOwner();
    expect(result.current.agencyState).toBe('active');

    let res;
    await act(async () => {
      res = await result.current.setAgencyState(result.current.agencyId, 'suspendue');
    });
    expect(res.success).toBe(true);

    // AgencyGate bloque l'AppShell des que agencyState === 'suspendue' (Req 5.2/5.4).
    await waitFor(() => expect(result.current.agencyState).toBe('suspendue'));
  });

  it('la reactivation retablit agencyState a "active" (Req 5.3, 5.6)', async () => {
    const result = await mountDemoOwner();
    const aid = result.current.agencyId;

    await act(async () => {
      await result.current.setAgencyState(aid, 'suspendue');
    });
    await waitFor(() => expect(result.current.agencyState).toBe('suspendue'));

    let res;
    await act(async () => {
      res = await result.current.setAgencyState(aid, 'active');
    });
    expect(res.success).toBe(true);
    await waitFor(() => expect(result.current.agencyState).toBe('active'));
  });

  it('refuse un Etat_Agence hors de l\'ensemble ferme { active, suspendue }', async () => {
    const result = await mountDemoOwner();
    let res;
    await act(async () => {
      res = await result.current.setAgencyState(result.current.agencyId, 'archivee');
    });
    expect(res.success).toBe(false);
    // L'etat courant n'est pas altere par une valeur invalide.
    expect(result.current.agencyState).toBe('active');
  });

  it('refuse la suspension/reactivation a un Utilisateur non Editeur_Plateforme (Req 5.5)', async () => {
    const result = await mountConnectedObserver();
    let res;
    await act(async () => {
      res = await result.current.setAgencyState('agency-1', 'suspendue');
    });
    expect(res.success).toBe(false);
    expect(res.permissionDenied).toBe(true);
    // L'Etat_Agence existant est conserve.
    expect(result.current.agencyState).toBe('active');
  });
});

// ==========================================================================
// Droits de module (Req 4.7, 4.8) et module desactive (Req 6.5)
// ==========================================================================
describe('Droits de module — reserve a l\'Editeur_Plateforme (Req 4.7, 4.8)', () => {
  it('refuse la modification d\'un Droit_Module a un non Editeur_Plateforme (Req 4.7, 4.8)', async () => {
    const result = await mountConnectedObserver();
    let res;
    await act(async () => {
      res = await result.current.setModuleEntitlement('agency-1', 'abonnements', true);
    });
    expect(res.success).toBe(false);
    expect(res.permissionDenied).toBe(true);
  });

  it('refuse l\'ecriture dans un Module_Additionnel desactive pour l\'agence (Req 6.5)', async () => {
    const result = await mountDemoOwner();

    // Desactive le module transfert_argent (le proprietaire le peut, sans Droit_Module requis pour desactiver).
    await act(async () => {
      await result.current.setModuleEnabled('transfert_argent', false);
    });
    await waitFor(() => expect(result.current.isModuleEnabled('transfert_argent')).toBe(false));

    let res;
    await act(async () => {
      res = await result.current.createTransfer({ method_id: 'tm_airtel', methodActive: true, amount: 100, commission: 2 });
    });
    expect(res.success).toBe(false);
    expect(res.moduleDisabled).toBe(true);
  });
});

// ==========================================================================
// Permissions d'ecriture (Req 2.8)
// ==========================================================================
describe('Permissions d\'ecriture — refus sans permission requise (Req 2.8)', () => {
  it('refuse a un observateur la creation d\'un transfert (services.vendre absent)', async () => {
    const result = await mountConnectedObserver();
    // L'observateur n'a pas services.vendre.
    expect(result.current.hasPermission('services.vendre')).toBe(false);

    let res;
    await act(async () => {
      res = await result.current.createTransfer({ method_id: 'tm_airtel', methodActive: true, amount: 100, commission: 2 });
    });
    expect(res.success).toBe(false);
    expect(res.permissionDenied).toBe(true);
    // Aucune donnee n'a ete creee (Req 2.8 : aucune modification).
    expect(result.current.transfers.length).toBe(0);
  });

  it('refuse a un observateur la gestion des employes (employes.gerer absent)', async () => {
    const result = await mountConnectedObserver();
    let res;
    await act(async () => {
      res = await result.current.createInvitation({ email: 'x@y.com', role: 'caissier' });
    });
    expect(res.success).toBe(false);
    expect(res.permissionDenied).toBe(true);
  });
});

// ==========================================================================
// Concurrence — absence de perte de mise a jour (Req 17.6)
// ==========================================================================
describe('Concurrence — ecritures successives sans perte (Req 17.6)', () => {
  // L'isolation des connexions simultanees est garantie par PostgreSQL (MVCC)
  // et les politiques RLS au niveau ligne verifiees dans 0003_rls.test.js (chaque
  // INSERT cree une ligne independante estampillee de son agency_id). Au niveau
  // du contexte applicatif, on verifie qu'une serie d'ecritures conserve toutes
  // les entites, chacune avec un identifiant unique : aucune mise a jour perdue.
  it('conserve toutes les entites creees en serie, avec des identifiants uniques', async () => {
    const result = await mountDemoOwner();
    const N = 8;

    // Chaque ecriture est confirmee (re-rendu) avant la suivante : on modelise
    // ainsi des operations qui se succedent sans s'ecraser. La liste s'allonge
    // strictement de 1 a chaque etape (aucune mise a jour perdue — Req 17.6).
    for (let i = 0; i < N; i += 1) {
      await act(async () => {
        await result.current.createTransfer({
          method_id: 'tm_airtel',
          methodActive: true,
          amount: 10 + i,
          commission: 1,
        });
      });
      await waitFor(() => expect(result.current.transfers.length).toBe(i + 1));
    }

    await waitFor(() => expect(result.current.transfers.length).toBe(N));
    const ids = result.current.transfers.map((t) => t.id);
    expect(new Set(ids).size).toBe(N); // aucun doublon, aucune perte
    // Les montants des N ecritures sont tous presents (aucune mise a jour ecrasee).
    const amounts = result.current.transfers.map((t) => t.amount).sort((a, b) => a - b);
    expect(amounts).toEqual(Array.from({ length: N }, (_, i) => 10 + i));
  });
});

// ==========================================================================
// Performance des listes paginees (Req 17.1, 17.2, 17.4, 17.5)
// ==========================================================================
describe('Performance des listes paginees (Req 17.2, 17.5)', () => {
  // Construit une liste d'Operations representative d'une agence active depuis
  // plusieurs annees : jusqu'a 50 000 elements (Req 17.2).
  const buildLargeList = (n) =>
    Array.from({ length: n }, (_, i) => ({
      id: `op-${i}`,
      agency_id: 'agency-1',
      amount: (i % 1000) + 1,
      timestamp: new Date(2020, 0, 1 + (i % 1500)).toISOString(),
    }));

  it('affiche la premiere page (<= 50 elements) d\'une liste de 50 000 en bien moins de 2 s (Req 17.2)', () => {
    const items = buildLargeList(50000);

    const start = performance.now();
    const firstPage = paginate(items, 1);
    const elapsedMs = performance.now() - start;

    expect(firstPage.items.length).toBeLessThanOrEqual(MAX_PAGE_SIZE);
    expect(firstPage.items.length).toBe(MAX_PAGE_SIZE);
    expect(firstPage.totalItems).toBe(50000);
    expect(firstPage.items[0].id).toBe('op-0');
    // Borne de 2 s (2000 ms) imposee par Req 17.2 ; le decoupage pur est ~O(pageSize).
    expect(elapsedMs).toBeLessThan(2000);
  });

  it('retourne une page filtree puis triee d\'une liste de 50 000 en moins de 2 s (Req 17.5)', () => {
    const items = buildLargeList(50000);

    const start = performance.now();
    // Filtre (montant pair) puis tri antechronologique, puis pagination.
    const filteredSorted = items
      .filter((o) => o.amount % 2 === 0)
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    const page = paginate(filteredSorted, 1);
    const elapsedMs = performance.now() - start;

    expect(page.items.length).toBeLessThanOrEqual(MAX_PAGE_SIZE);
    // Tri antechronologique : la 1re entree est la plus recente de l'ensemble filtre.
    expect(page.items[0].timestamp).toBe(filteredSorted[0].timestamp);
    expect(elapsedMs).toBeLessThan(2000);
  });

  it('garantit qu\'aucune page ne depasse 50 elements et couvre exactement la liste (Req 17.1, 17.4)', () => {
    const items = buildLargeList(50000);
    const { totalPages } = paginate(items, 1);

    const recomposed = [];
    for (let p = 1; p <= totalPages; p += 1) {
      const page = paginate(items, p);
      expect(page.items.length).toBeLessThanOrEqual(MAX_PAGE_SIZE);
      recomposed.push(...page.items);
    }
    // Couverture exacte : sans perte ni doublon (chargement progressif — Req 17.4).
    expect(recomposed.length).toBe(items.length);
    expect(recomposed[0].id).toBe('op-0');
    expect(recomposed[recomposed.length - 1].id).toBe('op-49999');
  });
});
