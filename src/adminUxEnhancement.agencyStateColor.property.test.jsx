// Feature: admin-ux-enhancement, Property 2: Agency states map to distinct theme colors
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import fc from 'fast-check';

// ---------------------------------------------------------------------------
// Property test — admin-ux-enhancement, tâche 6.2.
//
// Property 2 : « Agency states map to distinct theme colors » (Validates Req 6.4).
//
// EspaceAdminPlateforme rend la pastille d'état d'une Agence ainsi :
//   <span className={`badge ${isActive ? 'badge-success' : 'badge-danger'}`}>
// soit `active` → variante `.badge-success` (--color-green), tout autre état
// → `.badge-danger` (--color-red). La propriété vérifie, sur le composant rendu,
// que la variante résolue de deux états est ÉGALE si et seulement si les deux
// états sont équivalents au regard de la distinction « active vs non-active » :
// `active` est donc toujours visuellement distinct d'un état suspendu, et deux
// états non-actifs partagent la même couleur (badge-danger).
//
// Conventions reprises de `src/pages/EspaceAdminPlateforme.test.jsx` :
//   - i18n neutralisé : `useT` renvoie la clé (rendu déterministe), via une
//     référence STABLE construite avec vi.hoisted ;
//   - le contexte applicatif (`useApp`) est mocké par un état hoisté `ctx`,
//     reconfiguré avant chaque rendu ;
//   - assertions sans jest-dom (toBeTruthy / toBe), comme la base existante.
// ---------------------------------------------------------------------------

// i18n : `t(key) => key` (référence stable, cf. VoiceAgentModal.test.jsx).
const stableT = vi.hoisted(() => (key) => key);
vi.mock('./i18n', () => ({
  useT: () => stableT,
}));

// Contexte applicatif hoisté : `ctx.value` est l'objet renvoyé par useApp.
const ctx = vi.hoisted(() => ({ value: {} }));
vi.mock('./context/AppContext', () => ({
  useApp: () => ctx.value,
}));

import EspaceAdminPlateforme from './pages/EspaceAdminPlateforme';

// Contexte par défaut : Editeur_Plateforme, catalogues vides (donc la seule
// pastille `.badge` rendue est celle de l'état d'agence), une unique agence
// dont l'état est fourni par le générateur.
const makeCtx = (overrides = {}) => ({
  profilAcces: { is_platform_editor: true },
  user: { isDemo: false },
  loading: false,
  platformAgencies: [],
  platformModuleEntitlements: {},
  setModuleEntitlement: vi.fn().mockResolvedValue({ success: true }),
  setAgencyState: vi.fn().mockResolvedValue({ success: true }),
  transferMethods: [],
  subscriptionProviders: [],
  createTransferMethod: vi.fn().mockResolvedValue({ success: true }),
  updateTransferMethod: vi.fn().mockResolvedValue({ success: true }),
  createSubscriptionProvider: vi.fn().mockResolvedValue({ success: true }),
  updateSubscriptionProvider: vi.fn().mockResolvedValue({ success: true }),
  ...overrides,
});

// Variante de couleur résolue par le composant pour un état d'agence donné :
// on rend EspaceAdminPlateforme avec une unique agence de cet état, puis on lit
// la pastille `.badge` de la carte « agencies ». Retourne 'badge-success' ou
// 'badge-danger'.
const resolveBadgeVariant = (state) => {
  cleanup();
  // La garde interne honore `?debug_force_demo` dès le premier rendu (Req 2.1) ;
  // `is_platform_editor: true` suffit déjà, mais on aligne sur la garde de route.
  window.history.pushState({}, '', '/admin-plateforme?debug_force_demo');

  ctx.value = makeCtx({
    platformAgencies: [{ id: 'a-1', name: 'Agence Alpha', owner_id: 'o-1', state }],
  });

  render(<EspaceAdminPlateforme />);

  // La carte des agences contient l'unique pastille d'état (catalogues vides).
  const card = screen.getByText('platform_admin.agencies_title').closest('.card');
  const badge = card.querySelector('.badge');
  expect(badge).toBeTruthy();

  if (badge.classList.contains('badge-success')) return 'badge-success';
  if (badge.classList.contains('badge-danger')) return 'badge-danger';
  return null;
};

// Générateur d'états d'agence : états connus du domaine + chaînes arbitraires
// (états inconnus). `fc.string` peut produire 'active' : c'est volontairement
// toléré, la fonction de référence comparant strictement à 'active'.
const arbAgencyState = fc.oneof(
  fc.constantFrom('active', 'suspendue'),
  fc.string(),
);

beforeEach(() => {
  ctx.value = makeCtx();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('admin-ux-enhancement — Property 2 : agency state color mapping', () => {
  // -------------------------------------------------------------------------
  // Property 2 (Validates Req 6.4) : pour toute paire d'états, la variante de
  // couleur résolue est ÉGALE si et seulement si les deux états sont équivalents
  // au sens « active vs non-active ». Garantit qu'`active` est toujours distinct
  // d'un état non-actif (couleurs de thème distinctes).
  // -------------------------------------------------------------------------
  it('résout des variantes égales ⇔ états équivalents (active vs non-active) (Property 2, Req 6.4)', () => {
    fc.assert(
      fc.property(arbAgencyState, arbAgencyState, (s1, s2) => {
        const v1 = resolveBadgeVariant(s1);
        const v2 = resolveBadgeVariant(s2);

        // Chaque état résout vers une variante connue, non nulle.
        expect(v1 === 'badge-success' || v1 === 'badge-danger').toBe(true);
        expect(v2 === 'badge-success' || v2 === 'badge-danger').toBe(true);

        // Équivalence « active » : les deux actifs, ou les deux non-actifs.
        const stateActiveEqual = (s1 === 'active') === (s2 === 'active');
        const variantEqual = v1 === v2;

        // Distinct ⇔ distinct : couleurs distinctes pour des états distingués.
        expect(variantEqual).toBe(stateActiveEqual);
      }),
      { numRuns: 100 },
    );
  }, 60000); // 100 runs × 2 rendus complets du composant dépassent le délai par défaut.
});
