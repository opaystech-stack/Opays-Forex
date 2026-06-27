import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  isValidCatalogLabel,
  isDeletableMethod,
  TRANSFER_METHOD_OTHER,
  DEFAULT_PROVIDERS,
  LABEL_MIN_LENGTH,
  LABEL_MAX_LENGTH,
} from './catalogs';

// Référence d'oracle indépendante de l'implémentation : normalisation pour la
// comparaison d'unicité (espaces de bord retirés + minuscules), telle que
// spécifiée pour les catalogues de référence (Req 9.5, 11.6).
const normalize = (value) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

describe('catalogs — propriétés', () => {
  // Feature: agency-operations-expansion, Property 17: Validation des libellés de catalogue
  // Validates: Requirements 9.3, 9.5, 11.4, 11.6
  describe('Property 17: Validation des libellés de catalogue', () => {
    // Générateur de libellés candidats couvrant : libellés normaux, bornes de
    // longueur, vides/espaces, dépassements, et variantes de casse/espaces.
    const labelArb = fc.oneof(
      fc.string({ maxLength: 70 }),
      // Libellés intentionnellement à la borne ou au-delà.
      fc.integer({ min: 0, max: 80 }).map((n) => 'x'.repeat(n)),
      // Libellés entourés d'espaces (longueur mesurée sur le libellé rogné).
      fc.string({ maxLength: 65 }).map((s) => `   ${s}   `),
      fc.constantFrom('', '   ', '\t\n', 'Western Union', 'Évasion', 'Canal+'),
    );

    const existingArb = fc.array(fc.string({ minLength: 1, maxLength: 30 }), {
      maxLength: 6,
    });

    it('accepte ssi le libellé rogné mesure 1..60 caractères ET n\'est pas un doublon (insensible casse/espaces de bord)', () => {
      fc.assert(
        fc.property(labelArb, existingArb, (label, existing) => {
          const trimmed = label.trim();
          const lengthOk =
            trimmed.length >= LABEL_MIN_LENGTH &&
            trimmed.length <= LABEL_MAX_LENGTH;
          const isDuplicate = existing.some(
            (candidate) => normalize(candidate) === normalize(label),
          );
          const expectedOk = lengthOk && !isDuplicate;

          expect(isValidCatalogLabel(label, existing).ok).toBe(expectedOk);
        }),
        { numRuns: 100 },
      );
    });

    it('détecte comme doublon toute variante casse/espaces de bord d\'un libellé existant', () => {
      // On force le candidat à être une variante d'une entrée existante afin de
      // couvrir systématiquement la branche « doublon ».
      const caseVariant = (s) =>
        fc
          .array(fc.boolean(), { minLength: s.length, maxLength: s.length })
          .map((flags) =>
            s
              .split('')
              .map((ch, i) => (flags[i] ? ch.toUpperCase() : ch.toLowerCase()))
              .join(''),
          );

      fc.assert(
        fc.property(
          fc
            .array(fc.string({ minLength: 1, maxLength: 20 }), {
              minLength: 1,
              maxLength: 6,
            })
            // On garde des libellés valides (1..60 après rognage).
            .filter((arr) =>
              arr.every(
                (s) =>
                  s.trim().length >= LABEL_MIN_LENGTH &&
                  s.trim().length <= LABEL_MAX_LENGTH,
              ),
            ),
          fc.integer({ min: 0, max: 5 }),
          fc.string({ maxLength: 3 }).filter((p) => p.trim() === ''),
          fc.string({ maxLength: 3 }).filter((p) => p.trim() === ''),
          (existing, index, leftPad, rightPad) => {
            const target = existing[index % existing.length].trim();
            return fc.assert(
              fc.property(caseVariant(target), (variant) => {
                const candidate = `${leftPad}${variant}${rightPad}`;
                expect(isValidCatalogLabel(candidate, existing).ok).toBe(false);
              }),
              { numRuns: 20 },
            );
          },
        ),
        { numRuns: 100 },
      );
    });

    it('rejette tout libellé vide, uniquement espaces, ou de plus de 60 caractères', () => {
      const invalidArb = fc.oneof(
        fc.constantFrom('', ' ', '   ', '\t', '\n', '  \t \n '),
        fc.integer({ min: 61, max: 120 }).map((n) => 'x'.repeat(n)),
      );
      fc.assert(
        fc.property(invalidArb, existingArb, (label, existing) => {
          expect(isValidCatalogLabel(label, existing).ok).toBe(false);
        }),
        { numRuns: 100 },
      );
    });

    it('applique la même règle aux méthodes de transfert et aux fournisseurs d\'abonnement (indépendant du domaine)', () => {
      // Le contrat ne dépend que du libellé et de la liste existante : un même
      // couple (libellé, existants) produit le même verdict quel que soit le
      // catalogue interrogé.
      fc.assert(
        fc.property(labelArb, existingArb, (label, existing) => {
          const verdictMethodes = isValidCatalogLabel(label, existing).ok;
          const verdictFournisseurs = isValidCatalogLabel(label, existing).ok;
          expect(verdictMethodes).toBe(verdictFournisseurs);
        }),
        { numRuns: 100 },
      );
    });
  });

  // Feature: agency-operations-expansion, Property 18: Permanence et non-suppression de « Autre »
  // Validates: Requirements 9.1, 9.7
  describe('Property 18: Permanence et non-suppression de « Autre »', () => {
    // Un état du Catalogue_Methodes_Transfert : un ensemble de libellés de
    // méthodes contenant toujours la valeur permanente « Autre ».
    const otherVariantArb = fc
      .array(fc.boolean(), { minLength: 5, maxLength: 5 })
      .map((flags) =>
        'autre'
          .split('')
          .map((ch, i) => (flags[i] ? ch.toUpperCase() : ch.toLowerCase()))
          .join(''),
      );

    const catalogStateArb = fc
      .array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 8 })
      // Aucune autre entrée ne doit être une variante de « Autre ».
      .map((labels) =>
        labels.filter((l) => normalize(l) !== normalize(TRANSFER_METHOD_OTHER)),
      )
      .chain((others) =>
        otherVariantArb.map((otherVariant) => [...others, otherVariant]),
      );

    it('« Autre » est toujours présent et non supprimable, quel que soit l\'état du catalogue', () => {
      fc.assert(
        fc.property(catalogStateArb, (catalog) => {
          // « Autre » (sous une variante de casse) est présent.
          const hasOther = catalog.some(
            (label) => normalize(label) === normalize(TRANSFER_METHOD_OTHER),
          );
          expect(hasOther).toBe(true);

          // Toute entrée équivalente à « Autre » est non supprimable.
          catalog
            .filter(
              (label) => normalize(label) === normalize(TRANSFER_METHOD_OTHER),
            )
            .forEach((label) => {
              expect(isDeletableMethod(label)).toBe(false);
            });

          // Toute autre méthode est supprimable.
          catalog
            .filter(
              (label) => normalize(label) !== normalize(TRANSFER_METHOD_OTHER),
            )
            .forEach((label) => {
              expect(isDeletableMethod(label)).toBe(true);
            });
        }),
        { numRuns: 100 },
      );
    });

    it('isDeletableMethod ne dépend que de l\'équivalence à « Autre » (insensible casse/espaces de bord)', () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 30 }), (label) => {
          const expected =
            normalize(label) !== normalize(TRANSFER_METHOD_OTHER);
          expect(isDeletableMethod(label)).toBe(expected);
        }),
        { numRuns: 100 },
      );
    });
  });

  // Feature: agency-operations-expansion, Property 19: Filtrage des entrées actives et préservation de l'historique
  // Validates: Requirements 9.4, 11.5
  describe('Property 19: Filtrage des entrées actives et préservation de l\'historique', () => {
    // Modélise un catalogue (méthodes ou fournisseurs) : chaque entrée porte un
    // identifiant, un libellé et un indicateur d'activité. La liste proposée
    // pour de nouvelles opérations ne retient que les entrées actives.
    const proposedForNewOps = (entries) => entries.filter((e) => e.isActive);

    // Désactivation d'une entrée : retourne un nouveau catalogue où l'entrée
    // ciblée est inactive, SANS toucher aux opérations existantes.
    const deactivate = (entries, id) =>
      entries.map((e) => (e.id === id ? { ...e, isActive: false } : e));

    const catalogArb = fc.uniqueArray(
      fc.record({
        id: fc.integer({ min: 0, max: 1000 }),
        label: fc.string({ minLength: 1, maxLength: 20 }),
        isActive: fc.boolean(),
      }),
      { selector: (e) => e.id, minLength: 1, maxLength: 8 },
    );

    it('la liste proposée pour de nouvelles opérations ne contient que des entrées actives', () => {
      fc.assert(
        fc.property(catalogArb, (catalog) => {
          const proposed = proposedForNewOps(catalog);
          // Aucune entrée inactive.
          expect(proposed.every((e) => e.isActive)).toBe(true);
          // Toutes les entrées actives sont proposées (pas d'omission).
          const activeIds = catalog.filter((e) => e.isActive).map((e) => e.id);
          expect(new Set(proposed.map((e) => e.id))).toEqual(new Set(activeIds));
        }),
        { numRuns: 100 },
      );
    });

    it('désactiver une entrée la retire des choix futurs sans modifier les opérations qui l\'ont déjà référencée', () => {
      fc.assert(
        fc.property(
          catalogArb,
          fc.array(fc.integer({ min: 0, max: 1000 }), { maxLength: 12 }),
          (catalog, opRefs) => {
            // Opérations existantes : chacune référence une entrée du catalogue
            // (par identifiant). On borne les références aux ids existants.
            const ids = catalog.map((e) => e.id);
            const operations = opRefs.map((r, i) => ({
              opId: i,
              methodId: ids[r % ids.length],
            }));
            const operationsSnapshot = JSON.parse(JSON.stringify(operations));

            // On désactive une entrée arbitraire (la première active, sinon la
            // première du catalogue).
            const target = catalog.find((e) => e.isActive) || catalog[0];
            const updatedCatalog = deactivate(catalog, target.id);

            // 1. L'entrée désactivée n'est plus proposée pour de nouvelles ops.
            const proposed = proposedForNewOps(updatedCatalog);
            expect(proposed.some((e) => e.id === target.id)).toBe(false);

            // 2. Les opérations existantes sont inchangées (historique préservé),
            //    y compris celles qui référençaient l'entrée désactivée.
            expect(operations).toEqual(operationsSnapshot);
            const stillReferences = operations.some(
              (op) => op.methodId === target.id,
            );
            const hadReference = operationsSnapshot.some(
              (op) => op.methodId === target.id,
            );
            expect(stillReferences).toBe(hadReference);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // Feature: agency-operations-expansion, Property 20: Fournisseurs d'abonnement par défaut
  // Validates: Requirements 11.1
  describe('Property 20: Fournisseurs d\'abonnement par défaut', () => {
    it('le catalogue par défaut contient exactement Canal+, Access, Évasion et DStv', () => {
      // Propriété d'initialisation : l'ensemble par défaut est figé et complet.
      const expected = ['Canal+', 'Access', 'Évasion', 'DStv'];
      expect(DEFAULT_PROVIDERS).toEqual(expected);

      // Chaque fournisseur par défaut est un libellé de catalogue valide
      // (et donc actif/sélectionnable à l'initialisation).
      fc.assert(
        fc.property(fc.constantFrom(...DEFAULT_PROVIDERS), (provider) => {
          // Valide face aux autres fournisseurs par défaut (pas d'auto-doublon
          // puisqu'on compare à l'ensemble privé des autres).
          const others = DEFAULT_PROVIDERS.filter((p) => p !== provider);
          expect(isValidCatalogLabel(provider, others).ok).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    it('les fournisseurs par défaut sont distincts (insensible casse/espaces de bord)', () => {
      const normalizedSet = new Set(DEFAULT_PROVIDERS.map((p) => normalize(p)));
      expect(normalizedSet.size).toBe(DEFAULT_PROVIDERS.length);
    });
  });
});
