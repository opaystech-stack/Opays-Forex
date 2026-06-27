import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  TOKEN_BYTE_LENGTH,
  REQUIRED_ORDER_FIELDS,
  generateOrderToken,
  isWellFormedToken,
  encodeOrderLink,
  decodeOrderLink,
  isOrderLinkValid,
  validateOrderForm,
} from './orderToken';

// --- Générateurs partagés -------------------------------------------------

// Un identifiant d'agence non vide (UUID-like ou chaîne arbitraire non vide).
const anyAgencyId = fc
  .string({ minLength: 1, maxLength: 40 })
  .filter((s) => s.length > 0);

// Décode un jeton base64url en nombre d'octets (réplique de la logique du module,
// limitée au comptage : longueur en caractères -> longueur en octets sans padding).
const tokenByteLength = (token) => {
  const groups = Math.floor(token.length / 4);
  const remainder = token.length % 4;
  // 2 caractères -> 1 octet, 3 -> 2, 4 -> 3.
  const tail = remainder === 0 ? 0 : remainder - 1;
  return groups * 3 + tail;
};

// Un jeton bien formé arbitraire (≥ 16 octets) construit à partir d'octets
// aléatoires encodés comme le ferait le module : on réutilise generateOrderToken
// et on concatène éventuellement pour dépasser 16 octets.
const anyWellFormedToken = fc
  .integer({ min: 0, max: 3 })
  .map((extra) => {
    let token = generateOrderToken();
    for (let i = 0; i < extra; i += 1) {
      token += generateOrderToken();
    }
    return token;
  });

// --- Property 27 ----------------------------------------------------------

describe('orderToken — Property 27 : round-trip et entropie du jeton de commande', () => {
  // Feature: agency-operations-expansion, Property 27: Round-trip et entropie du jeton de commande
  // Pour tout couple {agencyId, token} où token est produit par generateOrderToken,
  // decodeOrderLink(encodeOrderLink({agencyId, token})) retourne {ok: true, agencyId, token}
  // identique à l'entrée ; et tout jeton généré comporte au moins 128 bits d'entropie
  // (16 octets aléatoires).
  // Validates: Requirements 14.2

  it('decodeOrderLink(encodeOrderLink({agencyId, token})) === {ok, agencyId, token} (round-trip exact)', () => {
    fc.assert(
      fc.property(anyAgencyId, (agencyId) => {
        const token = generateOrderToken();
        const encoded = encodeOrderLink({ agencyId, token });
        expect(typeof encoded).toBe('string');

        const decoded = decodeOrderLink(encoded);
        expect(decoded).toEqual({ ok: true, agencyId, token });
      }),
      { numRuns: 100 }
    );
  });

  it('round-trip exact pour des jetons bien formés arbitraires (incluant Unicode dans agencyId)', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 60 }), anyWellFormedToken, (agencyId, token) => {
        fc.pre(agencyId.length > 0);
        const decoded = decodeOrderLink(encodeOrderLink({ agencyId, token }));
        expect(decoded.ok).toBe(true);
        expect(decoded.agencyId).toBe(agencyId);
        expect(decoded.token).toBe(token);
      }),
      { numRuns: 100 }
    );
  });

  it('tout jeton généré porte au moins 128 bits (≥ 16 octets) et est bien formé', () => {
    fc.assert(
      fc.property(fc.integer(), () => {
        const token = generateOrderToken();
        // Bien formé selon le module.
        expect(isWellFormedToken(token)).toBe(true);
        // Au moins TOKEN_BYTE_LENGTH (16) octets = 128 bits d'entropie.
        expect(tokenByteLength(token)).toBeGreaterThanOrEqual(TOKEN_BYTE_LENGTH);
      }),
      { numRuns: 100 }
    );
  });

  it('les jetons générés sont quasi uniques (non devinables) sur un large échantillon', () => {
    const seen = new Set();
    for (let i = 0; i < 1000; i += 1) {
      seen.add(generateOrderToken());
    }
    // 16 octets aléatoires : aucune collision attendue sur 1000 tirages.
    expect(seen.size).toBe(1000);
  });
});

// --- Property 28 ----------------------------------------------------------

describe('orderToken — Property 28 : validité d\'un lien de commande', () => {
  // Feature: agency-operations-expansion, Property 28: Validité d'un lien de commande
  // Pour tout lien de commande, l'accès au Formulaire_Commande est autorisé si et seulement si
  // le jeton est bien formé, connu, non révoqué et non expiré ; un jeton inconnu, révoqué ou
  // expiré est refusé.
  // Validates: Requirements 14.5

  // Un jeton candidat : bien formé (généré) ou mal formé (caractères/longueur invalides).
  const anyCandidateToken = fc.oneof(
    anyWellFormedToken,
    fc.constantFrom('', 'abc', '!!!', 'court', 'a b c'),
    fc.string({ maxLength: 10 })
  );

  it('isOrderLinkValid === (bien formé ∧ connu ∧ non révoqué ∧ non expiré)', () => {
    fc.assert(
      fc.property(
        anyCandidateToken,
        fc.boolean(), // le lien stocké correspond-il au jeton présenté ?
        fc.boolean(), // révoqué ?
        fc.option(fc.integer({ min: 0, max: 4_000_000_000_000 }), { nil: undefined }), // expiresAt (ms) ou jamais
        fc.integer({ min: 0, max: 4_000_000_000_000 }), // nowMs
        (token, matches, revoked, expiresAt, nowMs) => {
          const linkRecord = {
            token: matches ? token : `${token}-different`,
            revoked,
            expiresAt,
          };

          const wellFormed = isWellFormedToken(token);
          const known = linkRecord.token === token;
          const notRevoked = revoked !== true;
          const notExpired =
            expiresAt === null || expiresAt === undefined ? true : nowMs < expiresAt;

          const expected = wellFormed && known && notRevoked && notExpired;

          expect(isOrderLinkValid(token, linkRecord, nowMs)).toBe(expected);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('un jeton mal formé est toujours refusé, quel que soit l\'enregistrement', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('', 'abc', '!!!', 'a b', '../etc'),
        fc.boolean(),
        (badToken, revoked) => {
          expect(
            isOrderLinkValid(badToken, { token: badToken, revoked, expiresAt: null })
          ).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('un jeton inconnu (aucun enregistrement) est refusé', () => {
    fc.assert(
      fc.property(anyWellFormedToken, (token) => {
        expect(isOrderLinkValid(token, null)).toBe(false);
        expect(isOrderLinkValid(token, undefined)).toBe(false);
        // Enregistrement présent mais jeton différent : inconnu.
        expect(
          isOrderLinkValid(token, { token: `${token}x`, revoked: false, expiresAt: null })
        ).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('un jeton révoqué ou expiré est refusé, même bien formé et connu', () => {
    fc.assert(
      fc.property(
        anyWellFormedToken,
        fc.integer({ min: 1, max: 4_000_000_000_000 }),
        (token, nowMs) => {
          // Révoqué.
          expect(
            isOrderLinkValid(token, { token, revoked: true, expiresAt: null }, nowMs)
          ).toBe(false);
          // Expiré : expiration à l'instant présent ou dans le passé.
          expect(
            isOrderLinkValid(token, { token, revoked: false, expiresAt: nowMs }, nowMs)
          ).toBe(false);
          expect(
            isOrderLinkValid(token, { token, revoked: false, expiresAt: nowMs - 1 }, nowMs)
          ).toBe(false);
          // Non révoqué, non expiré (expiration future) : accepté.
          expect(
            isOrderLinkValid(token, { token, revoked: false, expiresAt: nowMs + 1 }, nowMs)
          ).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// --- Property 29 ----------------------------------------------------------

describe('orderToken — Property 29 : champs requis de la commande à distance', () => {
  // Feature: agency-operations-expansion, Property 29: Champs requis de la commande à distance
  // Pour toute soumission du Formulaire_Commande, l'enregistrement est accepté si et seulement si
  // tous les champs requis sont présents ; toute soumission à laquelle manque un champ requis est
  // rejetée sans créer de Commande_Distante.
  // Validates: Requirements 14.6

  // Une valeur présente pour un champ : chaîne non vide (non blanche) ou objet Preuve.
  const presentValue = fc.oneof(
    fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
    fc.record({ url: fc.string({ minLength: 1, maxLength: 20 }) }),
    fc.integer()
  );

  // Une valeur absente : null, undefined, chaîne vide ou uniquement des espaces.
  const absentValue = fc.constantFrom(null, undefined, '', '   ', '\t', '\n');

  it('validateOrderForm.ok === (tous les champs requis présents)', () => {
    fc.assert(
      fc.property(
        // Pour chaque champ requis, choisir s'il est présent ou absent.
        fc.dictionary(
          fc.constantFrom(...REQUIRED_ORDER_FIELDS),
          fc.boolean()
        ),
        presentValue,
        absentValue,
        (presenceChoice, present, absent) => {
          const form = {};
          for (const field of REQUIRED_ORDER_FIELDS) {
            const isPresent = presenceChoice[field] ?? true;
            form[field] = isPresent ? present : absent;
          }

          const allPresent = REQUIRED_ORDER_FIELDS.every(
            (field) => (presenceChoice[field] ?? true)
          );

          const result = validateOrderForm(form);
          expect(result.ok).toBe(allPresent);
          if (!allPresent) {
            // Un champ manquant est signalé et fait partie des champs requis.
            expect(REQUIRED_ORDER_FIELDS).toContain(result.missingField);
            expect(typeof result.error).toBe('string');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('une commande complète (tous champs présents) est acceptée', () => {
    fc.assert(
      fc.property(
        fc.record({
          customerName: presentValue,
          customerPhone: presentValue,
          details: presentValue,
          proof: presentValue,
        }),
        (form) => {
          expect(validateOrderForm(form)).toEqual({ ok: true });
        }
      ),
      { numRuns: 100 }
    );
  });

  it('toute soumission à laquelle manque un champ requis est rejetée (aucune création)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...REQUIRED_ORDER_FIELDS),
        presentValue,
        absentValue,
        (missingField, present, absent) => {
          const form = {};
          for (const field of REQUIRED_ORDER_FIELDS) {
            form[field] = field === missingField ? absent : present;
          }
          const result = validateOrderForm(form);
          expect(result.ok).toBe(false);
          // Le premier champ manquant rencontré (dans l'ordre canonique) est signalé.
          const expectedFirstMissing = REQUIRED_ORDER_FIELDS.find(
            (field) => field === missingField
          );
          expect(result.missingField).toBe(expectedFirstMissing);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('un formulaire vide ou absent est rejeté en signalant le premier champ requis', () => {
    for (const empty of [undefined, null, {}, 'not-an-object', 42]) {
      const result = validateOrderForm(empty);
      expect(result.ok).toBe(false);
      expect(result.missingField).toBe(REQUIRED_ORDER_FIELDS[0]);
    }
  });
});
