import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  parseGeminiResponse,
  validateExtractedFields,
  validateMediaInput,
  ALLOWED_MEDIA_TYPES,
  MAX_MEDIA_SIZE_BYTES,
  AMOUNT_MIN,
  AMOUNT_MAX,
} from './voiceAgent';

const RUNS = { numRuns: 100 };

// =============================================================================
// Property 12: Robustesse de l'analyse de la réponse Gemini
// =============================================================================
describe('voiceAgent.js — Property 12 (parseGeminiResponse)', () => {
  // Feature: financial-ops-audit-voice-agent, Property 12: parseGeminiResponse ne lève jamais et renvoie une enveloppe { ok } pour TOUTE chaîne.
  it('P12 — ne lève jamais et renvoie { ok: boolean } pour toute chaîne', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        let result;
        expect(() => {
          result = parseGeminiResponse(text);
        }).not.toThrow();
        expect(result).toBeTypeOf('object');
        expect(typeof result.ok).toBe('boolean');
        if (result.ok) {
          expect(result.data).toBeTypeOf('object');
          expect(result.data).not.toBeNull();
          expect(Array.isArray(result.data)).toBe(false);
        } else {
          expect(typeof result.error).toBe('string');
        }
      }),
      RUNS
    );
  });

  // Feature: financial-ops-audit-voice-agent, Property 12: un JSON objet valide — brut ou entouré de balises markdown (``` / ```json) — donne { ok: true, data }.
  it('P12 — JSON objet valide (brut ou entouré de ``` / ```json) → { ok: true, data }', () => {
    const jsonValue = fc.oneof(
      fc.string(),
      fc.integer(),
      fc.boolean(),
      fc.constant(null),
      fc.double({ noNaN: true })
    );
    fc.assert(
      fc.property(
        fc.dictionary(fc.string(), jsonValue),
        fc.constantFrom('raw', 'fences', 'json-fences'),
        (obj, wrapKind) => {
          const jsonString = JSON.stringify(obj);
          const expected = JSON.parse(jsonString);

          let text = jsonString;
          if (wrapKind === 'fences') text = '```\n' + jsonString + '\n```';
          if (wrapKind === 'json-fences') text = '```json\n' + jsonString + '\n```';

          const result = parseGeminiResponse(text);
          expect(result.ok).toBe(true);
          expect(result.data).toEqual(expected);
        }
      ),
      RUNS
    );
  });

  // Feature: financial-ops-audit-voice-agent, Property 12: chaîne vide, blanche ou non analysable → { ok: false, error }.
  it('P12 — chaîne vide / blanche / non analysable / non-objet → { ok: false, error }', () => {
    const blankOrEmpty = fc.stringMatching(/^[ \t\n\r]*$/);
    const notParseable = fc.constantFrom(
      'not json',
      '{bad',
      '{"a":}',
      'undefined',
      '<html></html>',
      '```json\n{oops\n```'
    );
    // JSON valide mais NON-objet (primitif ou tableau) → rejeté.
    const nonObjectJson = fc.constantFrom('123', 'true', 'false', 'null', '"str"', '[1,2,3]', '[]');

    fc.assert(
      fc.property(fc.oneof(blankOrEmpty, notParseable, nonObjectJson), (text) => {
        const result = parseGeminiResponse(text);
        expect(result.ok).toBe(false);
        expect(typeof result.error).toBe('string');
        expect(result.error.length).toBeGreaterThan(0);
        expect(result.data).toBeUndefined();
      }),
      RUNS
    );
  });
});

// =============================================================================
// Property 13: Validation des champs extraits par les agents
// =============================================================================
describe('voiceAgent.js — Property 13 (validateExtractedFields)', () => {
  // Générateur d'un champ texte obligatoire : { value, valid }.
  const stringField = fc.oneof(
    // valide : chaîne non vide après trim
    fc
      .string({ minLength: 1 })
      .filter((s) => s.trim().length > 0)
      .map((value) => ({ value, valid: true })),
    // invalide : absent / vide / blanc / non-chaîne
    fc
      .oneof(
        fc.constant(undefined),
        fc.constant(null),
        fc.constant(''),
        fc.constant('   '),
        fc.integer()
      )
      .map((value) => ({ value, valid: false }))
  );

  // Générateur d'un montant obligatoire : { value, valid }.
  const amountField = fc.oneof(
    // valide : nombre dans [0,01 ; 999 999 999,99]
    fc
      .double({ min: AMOUNT_MIN, max: AMOUNT_MAX, noNaN: true })
      .map((value) => ({ value, valid: true })),
    // invalide : trop petit / trop grand / non numérique / absent
    fc
      .oneof(
        fc.double({ min: -1e9, max: 0.0099, noNaN: true }),
        fc.double({ min: 1e9, max: 1e12, noNaN: true }),
        fc.constant('abc'),
        fc.constant(undefined),
        fc.constant(null),
        fc.constant('')
      )
      .map((value) => ({ value, valid: false }))
  );

  // Feature: financial-ops-audit-voice-agent, Property 13: chaque champ obligatoire absent ou hors bornes est marqué invalide ET vidé ; les champs valides sont conservés.
  it('P13 — marque invalides et vide les champs obligatoires absents/hors bornes', () => {
    fc.assert(
      fc.property(
        stringField, // type
        stringField, // sourceWalletName
        stringField, // destWalletName
        amountField, // sourceAmount
        amountField, // destAmount
        (type, sourceWalletName, destWalletName, sourceAmount, destAmount) => {
          const fields = {
            type,
            sourceWalletName,
            destWalletName,
            sourceAmount,
            destAmount,
          };

          const data = {};
          const expectedInvalid = [];
          for (const [name, { value, valid }] of Object.entries(fields)) {
            data[name] = value;
            if (!valid) expectedInvalid.push(name);
          }

          const result = validateExtractedFields(data);

          // Ensemble des champs invalides détectés == ensemble attendu.
          expect([...result.invalidFields].sort()).toEqual([...expectedInvalid].sort());

          for (const [name, { value, valid }] of Object.entries(fields)) {
            if (valid) {
              // champ valide : conservé tel quel
              expect(result.data[name]).toBe(value);
            } else {
              // champ invalide : vidé
              expect(result.data[name]).toBe('');
            }
          }

          // La Confirmation reste bloquée tant qu'un champ obligatoire est invalide.
          const confirmationBlocked = result.invalidFields.length > 0;
          expect(confirmationBlocked).toBe(expectedInvalid.length > 0);
        }
      ),
      RUNS
    );
  });
});

// =============================================================================
// Property 14: Validation du format et de la taille des médias
// =============================================================================
describe('voiceAgent.js — Property 14 (validateMediaInput)', () => {
  const mimeArb = fc.oneof(
    fc.constantFrom(...ALLOWED_MEDIA_TYPES),
    fc.constantFrom('text/plain', 'application/zip', 'image/gif', 'audio/webm', ''),
    fc.string()
  );

  const sizeArb = fc.oneof(
    fc.double({ min: 0, max: MAX_MEDIA_SIZE_BYTES, noNaN: true }), // taille acceptable
    fc.double({ min: MAX_MEDIA_SIZE_BYTES + 1, max: MAX_MEDIA_SIZE_BYTES * 5, noNaN: true }) // trop grand
  );

  // Feature: financial-ops-audit-voice-agent, Property 14: rejet ssi type MIME non autorisé OU taille > 10 Mo ; sinon acceptation. Aucun appel proxy possible (fonction pure sans dépendance réseau).
  it('P14 — rejette tout type non autorisé ou taille > 10 Mo, accepte les couples valides', () => {
    fc.assert(
      fc.property(mimeArb, sizeArb, (mimeType, sizeBytes) => {
        const result = validateMediaInput({ mimeType, sizeBytes });

        const allowed = ALLOWED_MEDIA_TYPES.includes(mimeType);
        const sizeNum = Number(sizeBytes);
        const sizeOk = Number.isFinite(sizeNum) && sizeNum <= MAX_MEDIA_SIZE_BYTES;
        const expectedOk = allowed && sizeOk;

        expect(result.ok).toBe(expectedOk);
        if (!expectedOk) {
          expect(typeof result.error).toBe('string');
          expect(result.error.length).toBeGreaterThan(0);
        }
      }),
      RUNS
    );
  });

  // Feature: financial-ops-audit-voice-agent, Property 14: les couples explicitement valides sont toujours acceptés.
  it('P14 — accepte tous les couples (type autorisé, taille ≤ 10 Mo)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALLOWED_MEDIA_TYPES),
        fc.double({ min: 0, max: MAX_MEDIA_SIZE_BYTES, noNaN: true }),
        (mimeType, sizeBytes) => {
          const result = validateMediaInput({ mimeType, sizeBytes });
          expect(result.ok).toBe(true);
          expect(result.error).toBeUndefined();
        }
      ),
      RUNS
    );
  });
});
