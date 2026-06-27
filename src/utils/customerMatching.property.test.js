import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { normalizePhone, normalizeName, matchCustomer } from './customerMatching';

// Helpers de test (réplique locale de la logique de tri par ancienneté du module)
const createdAtValue = (customer) => {
  const t = Date.parse(customer && customer.created_at);
  return Number.isFinite(t) ? t : Infinity;
};

// Caractères d'espacement reconnus par \s en JS
const WHITESPACE = [' ', '\t', '\n', '\r', '\f', '\v'];

// Petits pools pour provoquer des collisions de téléphone/nom dans les listes
const NAME_POOL = ['Alice', 'alice ', ' BOB', 'bob', 'Carol', ''];
const PHONE_POOL = ['100', '1 00', '200', '+33 2', '300', ''];

// Arbitraire de client avec id / name / phone / created_at
const customerArb = fc.record({
  id: fc.uuid(),
  name: fc.constantFrom(...NAME_POOL),
  phone: fc.constantFrom(...PHONE_POOL),
  created_at: fc.oneof(
    fc.date({ min: new Date('2000-01-01'), max: new Date('2030-01-01') }).map((d) => d.toISOString()),
    fc.constant(undefined)
  ),
});

const customersArb = fc.array(customerArb, { maxLength: 6 });

// Feature: financial-ops-audit-voice-agent, Property 15: Priorité et déterminisme du rattachement client
describe('matchCustomer — priorité et déterminisme (P15)', () => {
  it('priorise le téléphone normalisé puis le nom, départage par created_at le plus ancien, ne crée jamais', () => {
    const identityArb = fc.record({
      name: fc.constantFrom(...NAME_POOL),
      phone: fc.constantFrom(...PHONE_POOL),
    });

    fc.assert(
      fc.property(customersArb, identityArb, (customers, identity) => {
        const result = matchCustomer(customers, identity);

        const np = normalizePhone(identity.phone);
        const nn = normalizeName(identity.name);

        const phoneMatches = np
          ? customers.filter((c) => normalizePhone(c.phone) !== '' && normalizePhone(c.phone) === np)
          : [];
        const nameMatches = nn
          ? customers.filter((c) => normalizeName(c.name) !== '' && normalizeName(c.name) === nn)
          : [];

        // Le téléphone est prioritaire sur le nom
        const candidates = phoneMatches.length > 0 ? phoneMatches : nameMatches;

        if (candidates.length === 0) {
          expect(result.match).toBeNull();
          expect(result.ambiguous).toBe(false);
          return;
        }

        // Ne crée jamais : la correspondance est un élément existant de la liste
        expect(customers).toContain(result.match);
        // La correspondance appartient à l'ensemble de candidats retenu (téléphone d'abord)
        expect(candidates).toContain(result.match);
        // Départage par created_at le plus ancien
        const oldest = Math.min(...candidates.map(createdAtValue));
        expect(createdAtValue(result.match)).toBe(oldest);
        // Ambiguïté signalée si plusieurs candidats
        expect(result.ambiguous).toBe(candidates.length > 1);
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: financial-ops-audit-voice-agent, Property 16: Création puis rattachement en l'absence de correspondance
describe('matchCustomer — aucune correspondance (P16)', () => {
  // Au niveau de matchCustomer, l'absence de correspondance se traduit par match=null.
  // La création effective du client puis le rattachement se font en amont
  // (AppContext.findOrCreateCustomer) sur la base de ce match=null.
  it('renvoie match=null quand un nom ou un téléphone est fourni mais ne correspond à aucun client', () => {
    // Pools disjoints (après normalisation) entre les clients existants et l'entrée
    const existingNames = ['Alice', 'bob', 'Carol', ''];
    const existingPhones = ['100', '200', '300', ''];
    const newNames = ['Zoe', 'xavier', 'Yann'];
    const newPhones = ['999', '888', '777'];

    const existingCustomerArb = fc.record({
      id: fc.uuid(),
      name: fc.constantFrom(...existingNames),
      phone: fc.constantFrom(...existingPhones),
      created_at: fc
        .date({ min: new Date('2000-01-01'), max: new Date('2030-01-01') })
        .map((d) => d.toISOString()),
    });

    // Identité fournissant un nom OU un téléphone (au moins l'un non vide), disjointe des clients
    const newIdentityArb = fc
      .record({
        name: fc.constantFrom('', ...newNames),
        phone: fc.constantFrom('', ...newPhones),
      })
      .filter((idn) => normalizeName(idn.name) !== '' || normalizePhone(idn.phone) !== '');

    fc.assert(
      fc.property(fc.array(existingCustomerArb, { maxLength: 6 }), newIdentityArb, (customers, identity) => {
        const result = matchCustomer(customers, identity);
        expect(result.match).toBeNull();
        expect(result.ambiguous).toBe(false);
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: financial-ops-audit-voice-agent, Property 17: Normalisation des numéros de téléphone (insensible aux espaces)
describe('normalizePhone — insensible aux espaces (P17)', () => {
  it("produit la même valeur quelle que soit l'insertion arbitraire d'espaces", () => {
    // chars de base d'un numéro (sans espace)
    const phoneCharArb = fc.constantFrom(...'0123456789+-#*'.split(''));
    // Intercalaires d'espaces (éventuellement vides), un par position possible d'insertion
    const fillersArb = fc.array(
      fc.array(fc.constantFrom(...WHITESPACE), { maxLength: 3 }).map((a) => a.join('')),
      { maxLength: 16 }
    );

    fc.assert(
      fc.property(fc.array(phoneCharArb, { maxLength: 15 }), fillersArb, (baseChars, fillers) => {
        const original = baseChars.join('');
        // Insère un intercalaire d'espaces avant chaque caractère, puis un en fin
        let spaced = fillers[0] || '';
        for (let i = 0; i < baseChars.length; i++) {
          spaced += baseChars[i] + (fillers[i + 1] || '');
        }
        // Deux numéros ne différant que par leurs espaces → même valeur normalisée
        expect(normalizePhone(spaced)).toBe(normalizePhone(original));
        expect(normalizePhone(spaced)).toBe(original);
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: financial-ops-audit-voice-agent, Property 18: Normalisation des noms (casse et espaces de bord)
describe('normalizeName — insensible à la casse et aux espaces de bord (P18)', () => {
  it('produit la même valeur quelles que soient la casse et les espaces de début/fin', () => {
    // Nom de base en lettres ASCII et espaces internes (la casse sera modifiée librement)
    const nameCharArb = fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz '.split(''));
    const edgeSpacesArb = fc.array(fc.constantFrom(...WHITESPACE), { maxLength: 4 }).map((a) => a.join(''));

    fc.assert(
      fc.property(
        fc.array(nameCharArb, { maxLength: 20 }),
        edgeSpacesArb,
        edgeSpacesArb,
        fc.array(fc.boolean(), { maxLength: 20 }),
        (baseChars, leading, trailing, caseFlags) => {
          const base = baseChars.join('');
          // Variation de casse caractère par caractère
          const caseVaried = baseChars
            .map((ch, i) => (caseFlags[i] ? ch.toUpperCase() : ch))
            .join('');
          const variant = leading + caseVaried + trailing;

          // Les variations de casse et d'espaces de bord sont considérées identiques
          expect(normalizeName(variant)).toBe(normalizeName(base));
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: financial-ops-audit-voice-agent, Property 19: Absence de rattachement sans identité
describe('matchCustomer — aucune identité fournie (P19)', () => {
  it('renvoie match=null quand ni nom ni téléphone ne sont fournis', () => {
    // Entrées « vides » : null, undefined, chaîne vide, espaces uniquement
    const emptyValueArb = fc.oneof(
      fc.constant(null),
      fc.constant(undefined),
      fc.constant(''),
      fc.array(fc.constantFrom(...WHITESPACE), { minLength: 1, maxLength: 5 }).map((a) => a.join(''))
    );

    fc.assert(
      fc.property(
        customersArb,
        fc.record({ name: emptyValueArb, phone: emptyValueArb }),
        (customers, identity) => {
          const result = matchCustomer(customers, identity);
          expect(result.match).toBeNull();
          expect(result.ambiguous).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
