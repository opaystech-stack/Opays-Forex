import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { paginate, MAX_PAGE_SIZE } from './pagination';

// Feature: agency-operations-expansion, Property 32: Pagination bornée et couverture exacte
// Validates: Requirements 17.1, 17.4
describe('pagination — propriétés', () => {
  describe('Property 32: Pagination bornée et couverture exacte', () => {
    // Liste d'éléments distincts (Operations, Clients, Abonnements, Reservations_Billet).
    // On utilise des identifiants uniques pour détecter tout doublon ou toute perte.
    const itemsArb = fc.uniqueArray(fc.integer({ min: 0, max: 100000 }), {
      maxLength: 220,
    });
    // Taille de page candidate : valeurs valides, à la borne, et au-delà de MAX_PAGE_SIZE.
    const pageSizeArb = fc.integer({ min: 1, max: 120 });

    it('chaque page contient au plus MAX_PAGE_SIZE (50) éléments', () => {
      fc.assert(
        fc.property(itemsArb, pageSizeArb, fc.integer({ min: 1, max: 30 }), (items, pageSize, page) => {
          const result = paginate(items, page, pageSize);
          expect(result.items.length).toBeLessThanOrEqual(MAX_PAGE_SIZE);
          expect(result.items.length).toBeLessThanOrEqual(result.pageSize);
          expect(result.pageSize).toBeLessThanOrEqual(MAX_PAGE_SIZE);
        }),
        { numRuns: 100 },
      );
    });

    it("l'union ordonnée de toutes les pages est une permutation exacte de la liste d'entrée (sans perte ni doublon)", () => {
      fc.assert(
        fc.property(itemsArb, pageSizeArb, (items, pageSize) => {
          const first = paginate(items, 1, pageSize);
          const totalPages = first.totalPages;

          // Concaténation ordonnée des pages 1..totalPages (chargement page par page).
          const reconstructed = [];
          for (let p = 1; p <= totalPages; p += 1) {
            reconstructed.push(...paginate(items, p, pageSize).items);
          }

          // Couverture exacte : même longueur, même ordre, donc aucune perte ni doublon.
          expect(reconstructed).toEqual(items);
          expect(reconstructed.length).toBe(items.length);
          expect(new Set(reconstructed).size).toBe(items.length);
        }),
        { numRuns: 100 },
      );
    });

    it('les métadonnées de page sont cohérentes (totalItems, totalPages, navigation)', () => {
      fc.assert(
        fc.property(itemsArb, pageSizeArb, fc.integer({ min: 1, max: 30 }), (items, pageSize, page) => {
          const result = paginate(items, page, pageSize);
          expect(result.totalItems).toBe(items.length);
          const expectedPages = items.length === 0 ? 0 : Math.ceil(items.length / result.pageSize);
          expect(result.totalPages).toBe(expectedPages);
          expect(result.hasPrevious).toBe(result.page > 1);
          expect(result.hasNext).toBe(result.page < result.totalPages);
        }),
        { numRuns: 100 },
      );
    });
  });
});
