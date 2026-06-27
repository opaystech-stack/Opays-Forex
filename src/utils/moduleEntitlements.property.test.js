import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  BASE_MODULES,
  OPTIONAL_MODULES,
  ADDITIONAL_MODULES,
  isModuleActivatable,
  isModuleEnabled,
  defaultModuleState,
} from './moduleEntitlements';

// Ensemble fermé attendu des Modules_Additionnels (Req 4.1).
const ADDITIONAL_SET = ['transfert_argent', 'abonnements', 'billets_avion'];

// Génère une clé de module quelconque : connue (base/optionnelle/additionnelle)
// ou arbitraire, afin de couvrir tout l'espace d'entrée.
const anyModuleKey = fc.oneof(
  fc.constantFrom(
    ...BASE_MODULES,
    ...OPTIONAL_MODULES,
    ...ADDITIONAL_MODULES,
    'inconnu',
    'prets_speciaux',
    ''
  ),
  fc.string({ maxLength: 24 })
);

describe('moduleEntitlements — Property 9 : ensemble fermé des Modules_Additionnels', () => {
  // Feature: agency-operations-expansion, Property 9: Ensemble fermé des Modules_Additionnels
  // Pour toute clé de module, l'appartenance à l'ensemble des Modules_Additionnels est vraie
  // si et seulement si la clé est l'une de transfert_argent, abonnements, billets_avion.
  // Validates: Requirements 4.1

  it('appartenance vraie ssi la clé est exactement un des trois Modules_Additionnels', () => {
    fc.assert(
      fc.property(anyModuleKey, (moduleKey) => {
        const expected = ADDITIONAL_SET.includes(moduleKey);
        expect(ADDITIONAL_MODULES.includes(moduleKey)).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  it("l'ensemble exporté est exactement les trois clés attendues (fermé, sans doublon)", () => {
    expect([...ADDITIONAL_MODULES].sort()).toEqual([...ADDITIONAL_SET].sort());
    expect(ADDITIONAL_MODULES).toHaveLength(ADDITIONAL_SET.length);
  });

  it('aucune clé hors des trois additionnelles n\'est activable (verrou réservé aux additionnels)', () => {
    fc.assert(
      fc.property(
        anyModuleKey.filter((k) => !ADDITIONAL_SET.includes(k)),
        (moduleKey) => {
          // Même avec une habilitation accordée pour cette clé, une clé non additionnelle
          // n'est jamais « activable » au sens du Droit_Module.
          expect(isModuleActivatable(moduleKey, { [moduleKey]: true })).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('moduleEntitlements — Property 10 : activation des modules à deux niveaux', () => {
  // Feature: agency-operations-expansion, Property 10: Activation des modules à deux niveaux
  // Pour tout Module_Additionnel et tout état d'habilitation/activation : il est activable ssi
  // un Droit_Module lui est accordé ; il est utilisable ssi habilité ET activé. Sans Droit_Module
  // il n'est ni activable ni utilisable, et la révocation le rend immédiatement non utilisable.
  // Validates: Requirements 4.3, 4.4, 4.5, 4.6, 6.2, 6.3, 6.4, 6.5

  const additionalKey = fc.constantFrom(...ADDITIONAL_SET);

  it('un Module_Additionnel est activable ssi son Droit_Module est accordé (granted === true)', () => {
    fc.assert(
      fc.property(additionalKey, fc.boolean(), (moduleKey, granted) => {
        const entitlements = { [moduleKey]: granted };
        expect(isModuleActivatable(moduleKey, entitlements)).toBe(granted);
      }),
      { numRuns: 100 }
    );
  });

  it('un Module_Additionnel est utilisable ssi il est habilité ET activé', () => {
    fc.assert(
      fc.property(additionalKey, fc.boolean(), fc.boolean(), (moduleKey, granted, activated) => {
        const context = {
          entitlements: { [moduleKey]: granted },
          moduleStates: { [moduleKey]: activated },
        };
        expect(isModuleEnabled(moduleKey, context)).toBe(granted && activated);
      }),
      { numRuns: 100 }
    );
  });

  it('sans Droit_Module, un Module_Additionnel n\'est ni activable ni utilisable même s\'il est activé', () => {
    fc.assert(
      fc.property(
        additionalKey,
        // Habilitation absente / falsy : clé non posée, false, undefined, null, 0, ''.
        fc.constantFrom(undefined, false, null, 0, ''),
        fc.boolean(),
        (moduleKey, falsyGrant, activated) => {
          const entitlements = falsyGrant === undefined ? {} : { [moduleKey]: falsyGrant };
          expect(isModuleActivatable(moduleKey, entitlements)).toBe(false);
          expect(
            isModuleEnabled(moduleKey, { entitlements, moduleStates: { [moduleKey]: activated } })
          ).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('la révocation du Droit_Module rend immédiatement le module non utilisable, activation conservée', () => {
    fc.assert(
      fc.property(additionalKey, (moduleKey) => {
        // État initial : habilité et activé -> utilisable.
        const moduleStates = { [moduleKey]: true };
        const grantedCtx = { entitlements: { [moduleKey]: true }, moduleStates };
        expect(isModuleEnabled(moduleKey, grantedCtx)).toBe(true);

        // Révocation : l'activation agence reste true, mais le module n'est plus utilisable.
        const revokedCtx = { entitlements: { [moduleKey]: false }, moduleStates };
        expect(isModuleActivatable(moduleKey, revokedCtx.entitlements)).toBe(false);
        expect(isModuleEnabled(moduleKey, revokedCtx)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('un Module_Base est toujours utilisable, un module optionnel utilisable ssi activé (sans Droit_Module)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...BASE_MODULES),
        fc.constantFrom(...OPTIONAL_MODULES),
        fc.boolean(),
        (baseKey, optionalKey, activated) => {
          // Module_Base : utilisable quel que soit l'état, aucune habilitation requise.
          expect(isModuleEnabled(baseKey, {})).toBe(true);
          expect(isModuleEnabled(baseKey, { moduleStates: { [baseKey]: false } })).toBe(true);
          // Module optionnel : utilisable ssi activé, sans Droit_Module.
          expect(
            isModuleEnabled(optionalKey, { moduleStates: { [optionalKey]: activated } })
          ).toBe(activated);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('moduleEntitlements — Property 11 : état de modules par défaut', () => {
  // Feature: agency-operations-expansion, Property 11: État de modules par défaut
  // Pour une agence sans choix de modules enregistré, defaultModuleState active exactement les
  // Modules_Base et désactive tous les modules optionnels et tous les Modules_Additionnels.
  // Validates: Requirements 6.8

  it('active exactement les Modules_Base et désactive optionnels et additionnels', () => {
    const state = defaultModuleState();
    for (const key of BASE_MODULES) {
      expect(state[key]).toBe(true);
    }
    for (const key of OPTIONAL_MODULES) {
      expect(state[key]).toBe(false);
    }
    for (const key of ADDITIONAL_MODULES) {
      expect(state[key]).toBe(false);
    }
    // Les seules clés actives sont exactement les Modules_Base.
    const activeKeys = Object.keys(state).filter((k) => state[k] === true);
    expect(activeKeys.sort()).toEqual([...BASE_MODULES].sort());
  });

  it('retourne un nouvel objet à chaque appel, sans état partagé entre agences', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ADDITIONAL_MODULES, ...OPTIONAL_MODULES), (key) => {
        const a = defaultModuleState();
        const b = defaultModuleState();
        expect(a).not.toBe(b);
        // Une mutation locale d'une agence n'affecte pas l'état par défaut d'une autre.
        a[key] = true;
        expect(b[key]).toBe(false);
        expect(defaultModuleState()[key]).toBe(false);
      }),
      { numRuns: 100 }
    );
  });
});
