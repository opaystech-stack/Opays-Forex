import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  AGENCY_STATES,
  DEFAULT_POINT_OF_SALE_NAME,
  DEFAULT_REGISTER_NAME,
  countAgenciesByState,
  assignAgencyId,
  assignAgencyIdToAll,
  resolveDefaultPointOfSale,
  resolveDefaultRegister,
  buildOwnerAgencyMap,
  backfillAgencyId,
  isBackfillComplete,
} from './agencyStats';

// ============================================================
// Générateurs partagés
// ============================================================

// Identifiant d'agence non vide (clé de cloisonnement valide).
const agencyIdArb = fc
  .string({ minLength: 1, maxLength: 12 })
  .filter((s) => s.trim().length > 0);

// Une agence porte un identifiant, un propriétaire, un état et un horodatage.
// L'état peut appartenir à l'ensemble fermé OU être inconnu (pour éprouver le filtrage).
const stateArb = fc.oneof(
  fc.constantFrom(...AGENCY_STATES),
  fc.constantFrom('inconnu', 'archived', '', null, undefined),
);

// ============================================================
// Feature: agency-operations-expansion, Property 7: Affectation de la clé d'agence
// Validates: Requirements 3.2
// ============================================================
describe("agencyStats — Property 7: Affectation de la clé d'agence", () => {
  // Entité métier arbitraire (Operation, Client, transfert, abonnement, réservation, commande).
  const entityArb = fc.record(
    {
      id: fc.integer({ min: 0, max: 100000 }),
      label: fc.string({ maxLength: 20 }),
      agency_id: fc.option(fc.string({ maxLength: 8 }), { nil: undefined }),
    },
    { requiredKeys: ['id'] },
  );

  it("toute entité créée reçoit un agency_id non nul égal à l'agence courante", () => {
    fc.assert(
      fc.property(entityArb, agencyIdArb, (entity, agencyId) => {
        const result = assignAgencyId(entity, agencyId);
        expect(result.agency_id).toBe(agencyId);
        expect(result.agency_id).not.toBeNull();
        expect(result.agency_id).not.toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });

  it("l'affectation ne mute pas l'entité d'entrée et préserve ses autres champs", () => {
    fc.assert(
      fc.property(entityArb, agencyIdArb, (entity, agencyId) => {
        const snapshot = JSON.stringify(entity);
        const result = assignAgencyId(entity, agencyId);
        // L'entrée est inchangée.
        expect(JSON.stringify(entity)).toBe(snapshot);
        // Les autres champs sont préservés sur la sortie.
        expect(result.id).toBe(entity.id);
        expect(result.label).toBe(entity.label);
      }),
      { numRuns: 100 },
    );
  });

  it('une affectation par lot pose le même agency_id sur chaque entité', () => {
    fc.assert(
      fc.property(fc.array(entityArb, { maxLength: 30 }), agencyIdArb, (entities, agencyId) => {
        const result = assignAgencyIdToAll(entities, agencyId);
        expect(result).toHaveLength(entities.length);
        for (const e of result) {
          expect(e.agency_id).toBe(agencyId);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('aucune entité ne peut être créée sans clé de cloisonnement valide (erreur levée)', () => {
    const invalidIdArb = fc.oneof(
      fc.constant(''),
      fc.constant('   '),
      fc.constant(null),
      fc.constant(undefined),
      fc.integer(),
    );
    fc.assert(
      fc.property(entityArb, invalidIdArb, (entity, badId) => {
        expect(() => assignAgencyId(entity, badId)).toThrow();
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Feature: agency-operations-expansion, Property 8: Point de vente et caisse par défaut implicites
// Validates: Requirements 3.4
// ============================================================
describe('agencyStats — Property 8: Point de vente et caisse par défaut implicites', () => {
  it('une agence sans Point_De_Vente explicite reçoit un PDV par défaut implicite unique et déterministe', () => {
    fc.assert(
      fc.property(agencyIdArb, (agencyId) => {
        const a = resolveDefaultPointOfSale(agencyId, []);
        const b = resolveDefaultPointOfSale(agencyId, []);
        // Implicite, par défaut, et nommé selon la valeur de schéma.
        expect(a.implicit).toBe(true);
        expect(a.is_default).toBe(true);
        expect(a.name).toBe(DEFAULT_POINT_OF_SALE_NAME);
        expect(a.agency_id).toBe(agencyId);
        // Identique d'un appel à l'autre (unicité déterministe).
        expect(a).toEqual(b);
      }),
      { numRuns: 100 },
    );
  });

  it('un Point_De_Vente sans Caisse explicite reçoit une caisse par défaut implicite unique et déterministe', () => {
    fc.assert(
      fc.property(agencyIdArb, (posId) => {
        const a = resolveDefaultRegister(posId, []);
        const b = resolveDefaultRegister(posId, []);
        expect(a.implicit).toBe(true);
        expect(a.is_default).toBe(true);
        expect(a.name).toBe(DEFAULT_REGISTER_NAME);
        expect(a.pos_id).toBe(posId);
        expect(a).toEqual(b);
      }),
      { numRuns: 100 },
    );
  });

  it('deux agences distinctes obtiennent des PDV par défaut implicites distincts', () => {
    fc.assert(
      fc.property(agencyIdArb, agencyIdArb, (id1, id2) => {
        fc.pre(id1 !== id2);
        const p1 = resolveDefaultPointOfSale(id1, []);
        const p2 = resolveDefaultPointOfSale(id2, []);
        expect(p1.id).not.toBe(p2.id);
      }),
      { numRuns: 100 },
    );
  });

  it("en présence de Point_De_Vente explicites, la résolution ne crée pas d'implicite", () => {
    const posArb = fc.record({
      id: fc.string({ minLength: 1, maxLength: 8 }),
      name: fc.string({ maxLength: 12 }),
      is_default: fc.boolean(),
    });
    fc.assert(
      fc.property(agencyIdArb, fc.array(posArb, { minLength: 1, maxLength: 6 }), (agencyId, explicits) => {
        const result = resolveDefaultPointOfSale(agencyId, explicits);
        expect(result.implicit).toBe(false);
        expect(result.agency_id).toBe(agencyId);
        // S'il existe un PDV marqué par défaut, c'est lui qui est choisi.
        const defaulted = explicits.find((p) => p.is_default);
        if (defaulted) {
          expect(result.id).toBe(defaulted.id);
        } else {
          expect(result.id).toBe(explicits[0].id);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Feature: agency-operations-expansion, Property 33: Statistique du nombre d'agences par état
// Validates: Requirements 5.8
// ============================================================
describe("agencyStats — Property 33: Statistique du nombre d'agences par état", () => {
  const agencyArb = fc.record({
    id: fc.string({ minLength: 1, maxLength: 8 }),
    state: stateArb,
  });

  it('le compte par état correspond au cardinal exact du sous-ensemble et total = longueur', () => {
    fc.assert(
      fc.property(fc.array(agencyArb, { maxLength: 80 }), (agencies) => {
        const counts = countAgenciesByState(agencies);

        // Le total est exactement le nombre d'agences fournies.
        expect(counts.total).toBe(agencies.length);

        // Pour chaque état de l'ensemble fermé, le compte est le cardinal exact.
        for (const state of AGENCY_STATES) {
          const expected = agencies.filter((a) => a.state === state).length;
          expect(counts[state]).toBe(expected);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("la somme des comptes par état connu n'excède jamais le total", () => {
    fc.assert(
      fc.property(fc.array(agencyArb, { maxLength: 80 }), (agencies) => {
        const counts = countAgenciesByState(agencies);
        const sumKnown = AGENCY_STATES.reduce((acc, s) => acc + counts[s], 0);
        expect(sumKnown).toBeLessThanOrEqual(counts.total);
      }),
      { numRuns: 100 },
    );
  });

  it('lorsque toutes les agences portent un état connu, la somme par état égale le total', () => {
    const knownAgencyArb = fc.record({
      id: fc.string({ minLength: 1, maxLength: 8 }),
      state: fc.constantFrom(...AGENCY_STATES),
    });
    fc.assert(
      fc.property(fc.array(knownAgencyArb, { maxLength: 80 }), (agencies) => {
        const counts = countAgenciesByState(agencies);
        const sumKnown = AGENCY_STATES.reduce((acc, s) => acc + counts[s], 0);
        expect(sumKnown).toBe(counts.total);
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Feature: agency-operations-expansion, Property 34: Rattachement complet des données à la migration
// Validates: Requirements 18.6
// ============================================================
describe('agencyStats — Property 34: Rattachement complet des données à la migration', () => {
  // Ensemble fini de propriétaires, chacun possédant au moins une agence par défaut.
  const ownerIdArb = fc.constantFrom('owner-A', 'owner-B', 'owner-C', 'owner-D');

  it("après backfill, chaque ligne d'un propriétaire connu porte l'agency_id de son agence par défaut", () => {
    const agencyArb = fc.record({
      id: fc.string({ minLength: 1, maxLength: 8 }),
      owner_id: ownerIdArb,
      created_at: fc.integer({ min: 0, max: 1_000_000 }).map((n) => String(n).padStart(8, '0')),
    });
    const rowArb = fc.record(
      {
        id: fc.integer({ min: 0, max: 100000 }),
        user_id: ownerIdArb,
      },
      { requiredKeys: ['id', 'user_id'] },
    );

    fc.assert(
      fc.property(
        fc.array(agencyArb, { minLength: 1, maxLength: 12 }),
        fc.array(rowArb, { maxLength: 40 }),
        (agencies, rows) => {
          const map = buildOwnerAgencyMap(agencies);
          const result = backfillAgencyId(rows, map, 'user_id');

          // Toute ligne dont le propriétaire possède une agence est rattachée à celle-ci.
          for (const row of result) {
            if (Object.prototype.hasOwnProperty.call(map, row.user_id)) {
              expect(row.agency_id).toBe(map[row.user_id]);
              expect(row.agency_id).not.toBeNull();
            }
          }

          // Si tous les propriétaires des lignes possèdent une agence, le backfill est complet.
          const allOwnersMapped = rows.every((r) =>
            Object.prototype.hasOwnProperty.call(map, r.user_id),
          );
          if (allOwnersMapped) {
            expect(isBackfillComplete(result)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("l'agence par défaut est la première créée du propriétaire (ordre created_at puis id)", () => {
    const agencyArb = fc.record({
      id: fc.string({ minLength: 1, maxLength: 8 }),
      owner_id: ownerIdArb,
      created_at: fc.integer({ min: 0, max: 1_000_000 }).map((n) => String(n).padStart(8, '0')),
    });
    fc.assert(
      fc.property(fc.array(agencyArb, { minLength: 1, maxLength: 12 }), (agencies) => {
        const map = buildOwnerAgencyMap(agencies);
        // Pour chaque propriétaire présent, l'agence retenue minimise (created_at, id).
        const byOwner = {};
        for (const a of agencies) {
          (byOwner[a.owner_id] ??= []).push(a);
        }
        for (const [ownerId, list] of Object.entries(byOwner)) {
          const sorted = [...list].sort((x, y) =>
            x.created_at < y.created_at
              ? -1
              : x.created_at > y.created_at
                ? 1
                : x.id < y.id
                  ? -1
                  : x.id > y.id
                    ? 1
                    : 0,
          );
          expect(map[ownerId]).toBe(sorted[0].id);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('une ligne déjà rattachée (agency_id non nul) est préservée par le backfill', () => {
    const rowArb = fc.record({
      id: fc.integer({ min: 0, max: 100000 }),
      user_id: ownerIdArb,
      agency_id: fc.string({ minLength: 1, maxLength: 6 }),
    });
    fc.assert(
      fc.property(fc.array(rowArb, { maxLength: 30 }), (rows) => {
        const map = { 'owner-A': 'AG-DEFAULT' };
        const result = backfillAgencyId(rows, map, 'user_id');
        result.forEach((row, i) => {
          expect(row.agency_id).toBe(rows[i].agency_id);
        });
      }),
      { numRuns: 100 },
    );
  });
});
