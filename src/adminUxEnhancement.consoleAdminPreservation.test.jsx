import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Tests de PRÉSERVATION du comportement — admin-ux-enhancement, tâche 5.5.
//
// L'enhancement visuel de la Console_Admin (`src/pages/ConsoleAdmin.jsx`) ne
// modifie QUE le balisage/présentation. Ces tests figent le comportement DONNÉES
// observable et garantissent l'absence de régression fonctionnelle (Req 10.1,
// 10.5, 10.6) :
//   - 10.1 : `loadData` émet les mêmes lectures Supabase, dans le même ordre,
//     avec les mêmes filtres (select '*', order submitted_at desc) ;
//   - 10.5 : activer/désactiver et valider/rejeter émettent les mêmes écritures
//     Supabase avec des arguments identiques (patchs issus de
//     `buildActivationPatch`/`buildReviewPatch`, ciblage `eq(...)` identique) ;
//   - 10.6 : en cas d'échec d'une écriture, l'indication d'erreur est affichée
//     et l'état précédent est conservé (pas de mutation locale).
//
// Conventions reprises de `src/pages/EspaceAdminPlateforme.test.jsx` :
//   - i18n neutralisé : `useT` renvoie la clé (référence STABLE via vi.hoisted) ;
//   - contexte applicatif (`useApp`) mocké par un état hoisté `ctx` ;
//   - service Supabase remplacé par un double CONTRÔLABLE et chaînable
//     (`from/select/order/update/eq`, `storage.createSignedUrl`, `rpc`) qui
//     enregistre les appels pour assertion ;
//   - rendu async (loadData) résolu via `findBy*` / `waitFor`.
// ---------------------------------------------------------------------------

// i18n : `t(key) => key` (référence stable, cf. VoiceAgentModal.test.jsx).
const stableT = vi.hoisted(() => (key) => key);
vi.mock('./i18n', () => ({
  useT: () => stableT,
}));

// Contexte applicatif hoisté : `ctx.value` est l'objet renvoyé par useApp.
// ConsoleAdmin n'en lit que `user` (adminId = user?.id).
const ctx = vi.hoisted(() => ({ value: {} }));
vi.mock('./context/AppContext', () => ({
  useApp: () => ctx.value,
}));

// Double Supabase CONTRÔLABLE et chaînable. Toutes les opérations utilisées par
// ConsoleAdmin sont couvertes et enregistrées dans `sb.calls` :
//   - lecture : from(table).select('*')[.order(col, opts)]  → { data, error }
//   - écriture : from(table).update(patch).eq(field, value) → { error }
//   - aperçu : storage.from(bucket).createSignedUrl(path, ttl) → { data, error }
// Les données et résultats sont pilotables par test via `sb.tableData` /
// `sb.updateResult` / `sb.signedUrlResult`.
const sb = vi.hoisted(() => {
  const calls = {
    from: [],
    select: [],
    order: [],
    update: [],
    eq: [],
    createSignedUrl: [],
    rpc: [],
  };
  const tableData = {
    access_profiles: { data: [], error: null },
    payment_proofs: { data: [], error: null },
  };
  const updateResult = { error: null };
  const signedUrlResult = { data: { signedUrl: 'https://signed.example/receipt' }, error: null };

  const reset = () => {
    calls.from = [];
    calls.select = [];
    calls.order = [];
    calls.update = [];
    calls.eq = [];
    calls.createSignedUrl = [];
    calls.rpc = [];
    tableData.access_profiles = { data: [], error: null };
    tableData.payment_proofs = { data: [], error: null };
    updateResult.error = null;
    signedUrlResult.data = { signedUrl: 'https://signed.example/receipt' };
    signedUrlResult.error = null;
  };

  const client = {
    from: (table) => {
      calls.from.push(table);
      return {
        select: (...args) => {
          calls.select.push({ table, args });
          // Awaitable ET chaînable : .order() renvoie un résultat awaitable.
          const result = Promise.resolve(tableData[table]);
          result.order = (...orderArgs) => {
            calls.order.push({ table, args: orderArgs });
            return Promise.resolve(tableData[table]);
          };
          return result;
        },
        update: (patch) => {
          calls.update.push({ table, patch });
          return {
            eq: (field, value) => {
              calls.eq.push({ table, field, value });
              return Promise.resolve({ error: updateResult.error });
            },
          };
        },
      };
    },
    storage: {
      from: (bucket) => ({
        createSignedUrl: (path, expiresIn) => {
          calls.createSignedUrl.push({ bucket, path, expiresIn });
          return Promise.resolve({ data: signedUrlResult.data, error: signedUrlResult.error });
        },
      }),
    },
    rpc: (...args) => {
      calls.rpc.push(args);
      return Promise.resolve({ data: null, error: null });
    },
  };

  return { client, calls, tableData, updateResult, signedUrlResult, reset };
});

vi.mock('./services/supabase', () => ({
  supabase: sb.client,
}));

import ConsoleAdmin from './pages/ConsoleAdmin';
import { buildActivationPatch, buildReviewPatch } from './utils/adminActions';

// Jeu de données représentatif : un Profil_Accès (accès révoqué) + une
// Preuve_Paiement en attente rattachée, de sorte qu'une ligne ET une preuve
// soient rendues (bouton activer + bouton aperçu de la preuve).
const ADMIN_ID = 'admin-1';
const USER_ID = 'u-1';
const PROOF_ID = 'p-1';

const seedDataset = () => {
  sb.tableData.access_profiles = {
    data: [
      { user_id: USER_ID, email: 'user@example.com', acces_autorise: false },
    ],
    error: null,
  };
  sb.tableData.payment_proofs = {
    data: [
      {
        id: PROOF_ID,
        user_id: USER_ID,
        mode_paiement: 'wave',
        reference: 'REF-001',
        submitted_at: '2026-01-15T10:00:00.000Z',
        statut: 'en_attente',
        recu_path: 'receipts/u-1/p-1.png',
      },
    ],
    error: null,
  };
};

beforeEach(() => {
  sb.reset();
  ctx.value = { user: { id: ADMIN_ID } };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Préservation du comportement Console_Admin — admin-ux-enhancement (Req 10.1/10.5/10.6)', () => {
  // -------------------------------------------------------------------------
  // Req 10.1 — Au montage, loadData émet les MÊMES lectures Supabase, dans le
  // même ordre/filtrage : access_profiles.select('*') et
  // payment_proofs.select('*').order('submitted_at', { ascending: false }).
  // -------------------------------------------------------------------------
  it('au montage, loadData lit access_profiles.select(*) et payment_proofs.select(*).order(submitted_at desc) (Req 10.1)', async () => {
    seedDataset();

    render(<ConsoleAdmin />);

    // Attendre la fin de loadData (la ligne — donc le bouton activer — est rendue).
    await screen.findByText('admin.activate');

    // Les deux tables sont interrogées.
    expect(sb.calls.from).toContain('access_profiles');
    expect(sb.calls.from).toContain('payment_proofs');

    // select('*') sur chaque table.
    const profSelect = sb.calls.select.find((s) => s.table === 'access_profiles');
    const proofSelect = sb.calls.select.find((s) => s.table === 'payment_proofs');
    expect(profSelect).toBeTruthy();
    expect(profSelect.args).toEqual(['*']);
    expect(proofSelect).toBeTruthy();
    expect(proofSelect.args).toEqual(['*']);

    // Tri des preuves par submitted_at décroissant.
    const proofOrder = sb.calls.order.find((o) => o.table === 'payment_proofs');
    expect(proofOrder).toBeTruthy();
    expect(proofOrder.args).toEqual(['submitted_at', { ascending: false }]);

    // Aucune lecture order sur access_profiles (filtrage inchangé).
    expect(sb.calls.order.find((o) => o.table === 'access_profiles')).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Req 10.5 — Cliquer « activer » émet
  // from('access_profiles').update(buildActivationPatch(true, adminId)).eq('user_id', userId).
  // -------------------------------------------------------------------------
  it("cliquer « activer » émet update(buildActivationPatch) + eq('user_id', userId) (Req 10.5)", async () => {
    seedDataset();

    render(<ConsoleAdmin />);

    const activateBtn = await screen.findByText('admin.activate');
    fireEvent.click(activateBtn);

    // L'écriture cible access_profiles.
    const upd = await waitForCall(() => sb.calls.update.find((u) => u.table === 'access_profiles'));
    // Le patch est EXACTEMENT celui produit par buildActivationPatch(true, adminId)
    // pour l'horodatage choisi par le composant (on rejoue avec ce timestamp).
    expect(upd.patch).toEqual(buildActivationPatch(true, ADMIN_ID, upd.patch.activated_at));
    expect(upd.patch.acces_autorise).toBe(true);
    expect(upd.patch.activated_by).toBe(ADMIN_ID);
    expect(typeof upd.patch.activated_at).toBe('string');

    // Le ciblage eq est identique : user_id = USER_ID.
    const eqCall = sb.calls.eq.find((e) => e.table === 'access_profiles');
    expect(eqCall).toEqual({ table: 'access_profiles', field: 'user_id', value: USER_ID });
  });

  // -------------------------------------------------------------------------
  // Req 10.5 — Sur une preuve sélectionnée, cliquer « valider » émet
  // from('payment_proofs').update(buildReviewPatch('validee', adminId)).eq('id', proofId).
  // -------------------------------------------------------------------------
  it("cliquer « valider » sur une preuve émet update(buildReviewPatch) + eq('id', proofId) (Req 10.5)", async () => {
    seedDataset();

    render(<ConsoleAdmin />);

    // Sélectionner la preuve via le bouton d'aperçu (aria-label = clé i18n).
    const viewBtn = await screen.findByLabelText('admin.view_proof');
    fireEvent.click(viewBtn);

    // Le panneau de détails s'affiche : cliquer « valider ».
    const validateBtn = await screen.findByText('admin.validate_proof');
    fireEvent.click(validateBtn);

    const upd = await waitForCall(() => sb.calls.update.find((u) => u.table === 'payment_proofs'));
    // Patch EXACTEMENT celui de buildReviewPatch('validee', adminId) au timestamp choisi.
    expect(upd.patch).toEqual(buildReviewPatch('validee', ADMIN_ID, upd.patch.reviewed_at));
    expect(upd.patch.statut).toBe('validee');
    expect(upd.patch.reviewed_by).toBe(ADMIN_ID);
    expect(typeof upd.patch.reviewed_at).toBe('string');

    // Le ciblage eq est identique : id = PROOF_ID.
    const eqCall = sb.calls.eq.find((e) => e.table === 'payment_proofs');
    expect(eqCall).toEqual({ table: 'payment_proofs', field: 'id', value: PROOF_ID });
  });

  // -------------------------------------------------------------------------
  // Req 10.5 — Cliquer « rejeter » émet buildReviewPatch('rejetee', adminId)
  // sur la même preuve (statut alternatif préservé).
  // -------------------------------------------------------------------------
  it("cliquer « rejeter » sur une preuve émet update(buildReviewPatch 'rejetee') + eq('id', proofId) (Req 10.5)", async () => {
    seedDataset();

    render(<ConsoleAdmin />);

    fireEvent.click(await screen.findByLabelText('admin.view_proof'));
    fireEvent.click(await screen.findByText('admin.reject_proof'));

    const upd = await waitForCall(() => sb.calls.update.find((u) => u.table === 'payment_proofs'));
    expect(upd.patch).toEqual(buildReviewPatch('rejetee', ADMIN_ID, upd.patch.reviewed_at));
    expect(upd.patch.statut).toBe('rejetee');

    const eqCall = sb.calls.eq.find((e) => e.table === 'payment_proofs');
    expect(eqCall).toEqual({ table: 'payment_proofs', field: 'id', value: PROOF_ID });
  });

  // -------------------------------------------------------------------------
  // Req 10.6 — En cas d'échec de l'écriture d'activation, l'indication d'erreur
  // est affichée et l'état précédent est conservé (la ligne reste « activable »,
  // pas de bascule locale optimiste).
  // -------------------------------------------------------------------------
  it("échec de l'activation ⇒ message d'erreur affiché et état précédent conservé (Req 10.6)", async () => {
    seedDataset();
    sb.updateResult.error = { message: 'rls denied' };

    render(<ConsoleAdmin />);

    fireEvent.click(await screen.findByText('admin.activate'));

    // Message d'erreur affiché (clé i18n admin.update_error).
    expect(await screen.findByText('admin.update_error')).toBeTruthy();

    // L'état précédent est conservé : le bouton « activer » reste présent
    // (aucune bascule locale vers « désactiver »).
    expect(screen.getByText('admin.activate')).toBeTruthy();
    expect(screen.queryByText('admin.deactivate')).toBeNull();
  });
});

// Petite aide : attend qu'un appel enregistré apparaisse (les handlers sont
// asynchrones). Évite une dépendance directe à waitFor pour les recherches
// sur les tableaux d'appels du double Supabase.
async function waitForCall(getter, { timeout = 1000, interval = 10 } = {}) {
  const start = Date.now();
  while (true) {
    const value = getter();
    if (value) return value;
    if (Date.now() - start > timeout) {
      throw new Error('waitForCall: appel attendu non observé dans le délai imparti');
    }
    await new Promise((r) => setTimeout(r, interval));
  }
}
