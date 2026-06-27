import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Tests d'exemple — Accessibilité des contrôles d'administration (tâche 9.1,
// feature admin-ux-enhancement). Sujet principal : ConsoleAdmin
// (src/pages/ConsoleAdmin.jsx).
//
// Couverture des critères d'acceptation :
//   - Req 7.1 : chaque contrôle d'action de ligne est un élément <button> natif
//     sémantique et nativement focalisable (`.focus()` ⇒ document.activeElement).
//   - Req 7.2 : l'activation au clic d'un <button> déclenche son handler
//     (fireEvent.click modélise l'activation d'un bouton natif, lui-même
//     activable au clavier via Entrée/Espace) — le clic « activer/désactiver »
//     provoque le changement d'accès (écriture Supabase).
//   - Req 7.3 / 7.4 : le contrôle icône-seule (reçu) expose un nom accessible
//     via getByLabelText('admin.view_proof') (aria-label résolu par i18n_Key).
//   - Req 7.6 : en cas d'erreur, le conteneur du message porte role="alert" ;
//     les indicateurs de chargement / état vide portent role="status".
//
// Conventions calquées sur les autres tests ConsoleAdmin de la feature
// (consoleAdminStructure / consoleAdminPreservation) :
//   - `./i18n` `useT` renvoie la clé (identité, référence STABLE via vi.hoisted) ;
//   - `./context/AppContext` `useApp` piloté par un état hoisté (`ctx.value`) ;
//   - `./services/supabase` exposé via un getter hoisté (`sb.value`) pour varier
//     entre `null` (loadData ⇒ liste vide synchrone), un double en attente
//     (chargement figé) et un double contrôlable (écritures + échec) ;
//   - `./utils/adminActions` : seul `buildAdminPage` est surchargé (rendu
//     déterministe de la page) ; les autres exports purs restent réels via
//     importOriginal.
//
// Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.6
// ---------------------------------------------------------------------------

const stableT = vi.hoisted(() => (key) => key);
vi.mock('./i18n', () => ({
  useT: () => stableT,
}));

const ctx = vi.hoisted(() => ({ value: { user: { id: 'admin-1' } } }));
vi.mock('./context/AppContext', () => ({
  useApp: () => ctx.value,
}));

// Référence Supabase pilotable par test (liaison live ESM via getter).
const sb = vi.hoisted(() => ({ value: null }));
vi.mock('./services/supabase', () => ({
  get supabase() {
    return sb.value;
  },
}));

// `buildAdminPage` surchargé : renvoie les entrées injectées par le test ;
// latestProofStatus / DEFAULT_ADMIN_PAGE_SIZE / buildActivationPatch /
// buildReviewPatch restent réels via importOriginal.
const adminMock = vi.hoisted(() => ({ entries: [] }));
vi.mock('./utils/adminActions', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    buildAdminPage: vi.fn(() => adminMock.entries),
  };
});

import ConsoleAdmin from './pages/ConsoleAdmin';

// Utilisateur représentatif : accès autorisé + preuve présente (le bouton reçu
// n'est rendu que si une preuve existe).
const sampleEntry = {
  user_id: 'u-1',
  email: 'user@example.com',
  acces_autorise: true,
  latestStatus: 'validee',
  proofs: [
    {
      id: 'p-1',
      user_id: 'u-1',
      submitted_at: '2024-01-01T00:00:00Z',
      recu_path: 'receipts/u-1/p-1.png',
      mode_paiement: 'wave',
      reference: 'REF-1',
      statut: 'validee',
    },
  ],
};

// Double Supabase dont toute requête reste en attente : loadData lance
// Promise.all([...]) qui ne résout jamais ⇒ `loading` demeure `true`.
const makePendingSupabase = () => {
  const pending = new Promise(() => {});
  pending.order = () => pending;
  pending.eq = () => pending;
  const query = { select: () => pending, order: () => pending, eq: () => pending };
  return { from: () => query };
};

// Double Supabase contrôlable pour les écritures (activation/désactivation).
// `updateError` pilote l'échec de l'update afin de tester l'affichage du
// message d'erreur (role="alert"). Les appels d'écriture sont enregistrés.
const makeControllableSupabase = ({ profiles, proofs, updateError = null } = {}) => {
  const calls = { update: [], eq: [] };
  const tableData = {
    access_profiles: { data: profiles ?? [], error: null },
    payment_proofs: { data: proofs ?? [], error: null },
  };
  const client = {
    from: (table) => ({
      select: () => {
        const result = Promise.resolve(tableData[table]);
        result.order = () => Promise.resolve(tableData[table]);
        return result;
      },
      update: (patch) => {
        calls.update.push({ table, patch });
        return {
          eq: (field, value) => {
            calls.eq.push({ table, field, value });
            return Promise.resolve({ error: updateError });
          },
        };
      },
    }),
    storage: {
      from: () => ({
        createSignedUrl: () =>
          Promise.resolve({ data: { signedUrl: 'https://signed.example/r' }, error: null }),
      }),
    },
  };
  return { client, calls };
};

beforeEach(() => {
  ctx.value = { user: { id: 'admin-1' } };
  sb.value = null;
  adminMock.entries = [];
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('admin-ux-enhancement — accessibilité des contrôles Console_Admin (Req 7.1/7.2/7.3/7.4/7.6)', () => {
  // -------------------------------------------------------------------------
  // Req 7.1 — Les contrôles d'action de ligne sont des <button> natifs
  // sémantiques et nativement focalisables.
  // -------------------------------------------------------------------------
  it('rend les contrôles d\'action de ligne comme des <button> natifs (Req 7.1)', async () => {
    adminMock.entries = [sampleEntry];

    const { container } = render(<ConsoleAdmin />);

    const actionCell = await waitFor(() => {
      const cell = container.querySelector('td[data-label="admin.col_actions"]');
      if (!cell) throw new Error('actions cell not rendered yet');
      return cell;
    });

    const controls = [...actionCell.querySelectorAll('.btn')];
    expect(controls.length).toBeGreaterThanOrEqual(2);
    // Chaque contrôle est un élément <button> natif (sémantique, focalisable).
    controls.forEach((el) => {
      expect(el.tagName).toBe('BUTTON');
    });
  });

  it('un contrôle d\'action peut recevoir le focus clavier (.focus() ⇒ activeElement) (Req 7.1)', async () => {
    adminMock.entries = [sampleEntry];

    render(<ConsoleAdmin />);

    // Le bouton désactiver (accès autorisé) est un élément nativement focalisable.
    const deactivateBtn = await screen.findByText('admin.deactivate');
    deactivateBtn.focus();
    expect(document.activeElement).toBe(deactivateBtn);
  });

  // -------------------------------------------------------------------------
  // Req 7.2 — Activation du bouton : un clic invoque son handler. Un <button>
  // natif garantit l'activation clavier (Entrée/Espace) ; fireEvent.click
  // modélise cette activation. Ici, cliquer « désactiver » déclenche le
  // changement d'accès (écriture Supabase access_profiles).
  // -------------------------------------------------------------------------
  it('cliquer le bouton « désactiver » déclenche le changement d\'accès (Req 7.2)', async () => {
    const controllable = makeControllableSupabase({
      profiles: [{ user_id: 'u-1', email: 'user@example.com', acces_autorise: true }],
    });
    sb.value = controllable.client;
    adminMock.entries = [sampleEntry];

    render(<ConsoleAdmin />);

    const deactivateBtn = await screen.findByText('admin.deactivate');
    // Le bouton natif est focalisable puis activable (clic == activation Entrée/Espace).
    deactivateBtn.focus();
    expect(document.activeElement).toBe(deactivateBtn);
    fireEvent.click(deactivateBtn);

    // Le handler a émis l'écriture de changement d'accès vers access_profiles.
    await waitFor(() => {
      expect(controllable.calls.update.find((u) => u.table === 'access_profiles')).toBeTruthy();
    });
    const upd = controllable.calls.update.find((u) => u.table === 'access_profiles');
    expect(upd.patch.acces_autorise).toBe(false);
    const eqCall = controllable.calls.eq.find((e) => e.table === 'access_profiles');
    expect(eqCall).toEqual({ table: 'access_profiles', field: 'user_id', value: 'u-1' });
  });

  // -------------------------------------------------------------------------
  // Req 7.3 / 7.4 — Le contrôle icône-seule (reçu) expose un nom accessible
  // résolu via i18n_Key (aria-label = admin.view_proof).
  // -------------------------------------------------------------------------
  it('le bouton reçu (icône seule) expose un nom accessible via getByLabelText (Req 7.3/7.4)', async () => {
    adminMock.entries = [sampleEntry];

    render(<ConsoleAdmin />);

    const receiptButton = await screen.findByLabelText('admin.view_proof');
    expect(receiptButton).toBeTruthy();
    // Élément <button> natif portant l'aria-label (nom accessible non vide).
    expect(receiptButton.tagName).toBe('BUTTON');
    expect(receiptButton.getAttribute('aria-label')).toBe('admin.view_proof');
  });

  // -------------------------------------------------------------------------
  // Req 7.6 — Indicateur de chargement : role="status".
  // -------------------------------------------------------------------------
  it('l\'indicateur de chargement porte role="status" (Req 7.6)', () => {
    sb.value = makePendingSupabase(); // requêtes en attente ⇒ loading figé à true
    adminMock.entries = [];

    render(<ConsoleAdmin />);

    const status = screen.getByRole('status');
    expect(status).toBeTruthy();
    expect(status.textContent.trim()).toBe('loading.data');
  });

  // -------------------------------------------------------------------------
  // Req 7.6 — Message d'état vide : role="status".
  // -------------------------------------------------------------------------
  it('le message d\'état vide porte role="status" (Req 7.6)', async () => {
    sb.value = null; // loadData ⇒ liste vide, loading=false
    adminMock.entries = [];

    render(<ConsoleAdmin />);

    const status = await screen.findByRole('status');
    expect(status.textContent.trim()).toBe('admin.empty');
  });

  // -------------------------------------------------------------------------
  // Req 7.6 — En cas d'échec d'une action, le message d'erreur porte
  // role="alert" (annoncé sans changement de focus).
  // -------------------------------------------------------------------------
  it('en cas d\'échec d\'une mise à jour, le message d\'erreur porte role="alert" (Req 7.6)', async () => {
    const controllable = makeControllableSupabase({
      profiles: [{ user_id: 'u-1', email: 'user@example.com', acces_autorise: true }],
      updateError: { message: 'rls denied' },
    });
    sb.value = controllable.client;
    adminMock.entries = [sampleEntry];

    render(<ConsoleAdmin />);

    fireEvent.click(await screen.findByText('admin.deactivate'));

    const alert = await screen.findByRole('alert');
    expect(alert).toBeTruthy();
    expect(alert.textContent).toContain('admin.update_error');
  });
});
