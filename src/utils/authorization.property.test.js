import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  isValidRole,
  isValidInvitationEmail,
  effectivePermissions,
  isAuthorized,
  isDuplicateInvitationEmail,
  isInvitationExpired,
  INVITATION_EXPIRY_MS,
  MAX_INVITATION_EMAIL_LENGTH,
} from './authorization';

// --- Générateurs partagés -------------------------------------------------

// Ensemble fermé attendu des Rôles par défaut (Req 2.1).
const ROLE_SET = ['proprietaire', 'gerant', 'caissier', 'observateur'];

// Un rôle quelconque : valide (dans l'ensemble fermé) ou arbitraire (hors
// ensemble, casse différente, vide), afin de couvrir tout l'espace d'entrée.
const anyRole = fc.oneof(
  fc.constantFrom(...ROLE_SET, 'PROPRIETAIRE', 'admin', 'user', 'gérant', ''),
  fc.string({ maxLength: 20 })
);

// Une permission quelconque : connue (du catalogue) ou arbitraire (octroi/retrait
// d'une capacité inconnue, qui doit tout de même être traitée ensemblistement).
const anyPermission = fc.constantFrom(
  ...PERMISSIONS,
  'perm.inconnue',
  'autre.action',
  ''
);

// Caractères autorisés dans un segment d'e-mail (ni espace ni « @ »).
const emailSegmentChar = fc.constantFrom(
  ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-_+'.split('')
);
const emailSegment = fc
  .array(emailSegmentChar, { minLength: 1, maxLength: 12 })
  .map((chars) => chars.join(''));

// E-mail bien formé `partie-locale@domaine` (longueur bornée < 254).
const validEmail = fc
  .tuple(emailSegment, emailSegment)
  .map(([local, domain]) => `${local}@${domain}`);

// Forme de référence de la spec : un seul « @ », deux segments non vides, sans
// espace, longueur 1..254 (Property 4 ; identique au contrat de la fonction).
const EMAIL_FORM = /^[^\s@]+@[^\s@]+$/;
const isValidEmailByForm = (value) =>
  typeof value === 'string' &&
  value.length >= 1 &&
  value.length <= MAX_INVITATION_EMAIL_LENGTH &&
  EMAIL_FORM.test(value);

// --- Property 1 -----------------------------------------------------------

describe('authorization — Property 1 : validation du rôle dans l\'ensemble fermé', () => {
  // Feature: agency-operations-expansion, Property 1: Validation du rôle dans l'ensemble fermé
  // Pour toute chaîne de rôle, isValidRole retourne vrai si et seulement si le rôle appartient
  // exactement à {proprietaire, gerant, caissier, observateur} ; toute autre valeur est rejetée.
  // Validates: Requirements 1.5, 2.1

  it('isValidRole(role) === (role ∈ ensemble fermé), pour toute chaîne', () => {
    fc.assert(
      fc.property(anyRole, (role) => {
        expect(isValidRole(role)).toBe(ROLE_SET.includes(role));
      }),
      { numRuns: 100 }
    );
  });

  it("l'ensemble exporté ROLES est exactement les quatre rôles attendus (fermé, sans doublon)", () => {
    expect([...ROLES].sort()).toEqual([...ROLE_SET].sort());
    expect(ROLES).toHaveLength(ROLE_SET.length);
  });

  it('rejette toute valeur non chaîne (absente, nombre, objet, tableau)', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(undefined),
          fc.constant(null),
          fc.integer(),
          fc.boolean(),
          fc.object(),
          fc.array(fc.string())
        ),
        (notAString) => {
          expect(isValidRole(notAString)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// --- Property 2 -----------------------------------------------------------

describe('authorization — Property 2 : permissions effectives et priorité du retrait (deny-overrides)', () => {
  // Feature: agency-operations-expansion, Property 2: Permissions effectives et priorité du retrait (deny-overrides)
  // Pour tout rôle, tout ensemble d'octrois et tout ensemble de retraits, effectivePermissions est
  // égal à (permissions(rôle) ∪ octrois) ∖ retraits : toute permission retirée est absente même si
  // elle figure dans le rôle ou les octrois, et proprietaire sans retrait possède toutes les permissions.
  // Validates: Requirements 2.2, 2.5, 2.6

  const permissionList = fc.array(anyPermission, { maxLength: 8 });

  it('effectivePermissions === (rôle ∪ octrois) ∖ retraits (égalité ensembliste)', () => {
    fc.assert(
      fc.property(anyRole, permissionList, permissionList, (role, grants, denies) => {
        // Oracle aligné sur la production : lookup sûr par propriété PROPRE,
        // afin de ne pas résoudre un membre hérité de Object.prototype
        // (« valueOf », « toString », …) qui ferait échouer le spread.
        const base = Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, role)
          ? ROLE_PERMISSIONS[role]
          : [];
        const expected = new Set([...base, ...grants]);
        for (const d of denies) expected.delete(d);

        const actual = new Set(effectivePermissions(role, grants, denies));
        expect([...actual].sort()).toEqual([...expected].sort());
      }),
      { numRuns: 100 }
    );
  });

  it('deny-overrides : toute permission retirée est absente du résultat, même si octroyée et dans le rôle', () => {
    fc.assert(
      fc.property(anyRole, permissionList, permissionList, (role, grants, denies) => {
        const result = effectivePermissions(role, grants, denies);
        const denySet = new Set(denies);
        for (const permission of result) {
          expect(denySet.has(permission)).toBe(false);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('proprietaire sans retrait possède exactement l\'ensemble complet des permissions', () => {
    fc.assert(
      fc.property(fc.array(anyPermission, { maxLength: 6 }), (grants) => {
        const result = new Set(effectivePermissions('proprietaire', grants, []));
        for (const permission of PERMISSIONS) {
          expect(result.has(permission)).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('un rôle invalide ne contribue d\'aucune permission de base ; seuls les octrois non retirés subsistent', () => {
    fc.assert(
      fc.property(
        anyRole.filter((r) => !ROLE_SET.includes(r)),
        fc.array(anyPermission, { maxLength: 6 }),
        fc.array(anyPermission, { maxLength: 6 }),
        (invalidRole, grants, denies) => {
          const expected = new Set(grants);
          for (const d of denies) expected.delete(d);
          const actual = new Set(effectivePermissions(invalidRole, grants, denies));
          expect([...actual].sort()).toEqual([...expected].sort());
        }
      ),
      { numRuns: 100 }
    );
  });
});

// --- Property 3 -----------------------------------------------------------

describe('authorization — Property 3 : décision d\'autorisation', () => {
  // Feature: agency-operations-expansion, Property 3: Décision d'autorisation
  // Pour tout rôle, octrois, retraits et permission requise, isAuthorized retourne vrai si et
  // seulement si la permission requise appartient aux permissions effectives ; sinon refus.
  // Validates: Requirements 1.11, 2.3, 2.4

  const permissionList = fc.array(anyPermission, { maxLength: 8 });

  it('isAuthorized === (permission requise ∈ permissions effectives)', () => {
    fc.assert(
      fc.property(
        anyRole,
        permissionList,
        permissionList,
        anyPermission,
        (role, grants, denies, required) => {
          const effective = effectivePermissions(role, grants, denies);
          expect(isAuthorized(role, grants, denies, required)).toBe(
            effective.includes(required)
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('une permission retirée est toujours refusée, même si présente dans le rôle ou octroyée', () => {
    fc.assert(
      fc.property(anyRole, permissionList, anyPermission, (role, grants, required) => {
        // On force le retrait de la permission requise.
        const denies = [required];
        expect(isAuthorized(role, [...grants, required], denies, required)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('une permission octroyée et non retirée est toujours autorisée', () => {
    fc.assert(
      fc.property(anyRole, permissionList, anyPermission, (role, denies, required) => {
        // On retire la permission requise de l'ensemble des retraits.
        const cleanedDenies = denies.filter((d) => d !== required);
        expect(isAuthorized(role, [required], cleanedDenies, required)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});

// --- Property 4 -----------------------------------------------------------

describe('authorization — Property 4 : validation de l\'e-mail d\'invitation', () => {
  // Feature: agency-operations-expansion, Property 4: Validation de l'e-mail d'invitation
  // Pour toute chaîne, isValidInvitationEmail retourne vrai si et seulement si elle respecte la
  // forme partie-locale@domaine et comporte au plus 254 caractères ; vide, malformée ou > 254 rejetée.
  // Validates: Requirements 1.2, 1.4

  it('isValidInvitationEmail === conformité à la forme `partie@domaine` ∧ longueur ≤ 254', () => {
    fc.assert(
      fc.property(
        fc.oneof(validEmail, fc.string({ maxLength: 30 })),
        (candidate) => {
          expect(isValidInvitationEmail(candidate)).toBe(isValidEmailByForm(candidate));
        }
      ),
      { numRuns: 100 }
    );
  });

  it('accepte tout e-mail bien formé `partie@domaine` ≤ 254 caractères', () => {
    fc.assert(
      fc.property(validEmail, (email) => {
        expect(isValidInvitationEmail(email)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('rejette les chaînes vides, sans « @ », à « @ » multiples ou contenant un espace', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(''),
          emailSegment, // aucune arobase
          fc.tuple(emailSegment, emailSegment, emailSegment).map(
            ([a, b, c]) => `${a}@${b}@${c}` // arobases multiples
          ),
          fc.tuple(emailSegment, emailSegment).map(([a, b]) => `${a} @${b}`) // espace
        ),
        (malformed) => {
          expect(isValidInvitationEmail(malformed)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejette tout e-mail de plus de 254 caractères même bien formé', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 255, max: 400 }),
        (totalLength) => {
          const local = 'a'.repeat(totalLength - 2); // local + '@' + 'b'
          const tooLong = `${local}@b`;
          expect(tooLong.length).toBeGreaterThan(MAX_INVITATION_EMAIL_LENGTH);
          expect(isValidInvitationEmail(tooLong)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejette toute valeur non chaîne', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(undefined), fc.constant(null), fc.integer(), fc.object()),
        (notAString) => {
          expect(isValidInvitationEmail(notAString)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// --- Property 5 -----------------------------------------------------------

describe('authorization — Property 5 : rejet d\'e-mail déjà utilisé', () => {
  // Feature: agency-operations-expansion, Property 5: Rejet d'e-mail déjà utilisé
  // Pour tout ensemble d'e-mails déjà rattachés (invitation en_attente ou membre actif), toute
  // nouvelle invitation portant un e-mail équivalent (insensible à la casse/espaces de bord) est
  // détectée comme doublon et rejetée.
  // Validates: Requirements 1.6

  // Espaces de bord générés directement (jamais de « @ » ni de caractère interne).
  const edgeWhitespace = fc
    .array(fc.constantFrom(' ', '\t', '\n'), { maxLength: 3 })
    .map((chars) => chars.join(''));

  // Produit une variante équivalente d'un e-mail : casse mélangée + espaces de bord.
  const equivalentVariant = (email) =>
    fc
      .tuple(
        fc.array(fc.boolean(), { minLength: email.length, maxLength: email.length }),
        edgeWhitespace,
        edgeWhitespace
      )
      .map(([caseMask, left, right]) => {
        const mixed = email
          .split('')
          .map((ch, i) => (caseMask[i] ? ch.toUpperCase() : ch.toLowerCase()))
          .join('');
        return `${left}${mixed}${right}`;
      });

  it('un e-mail équivalent (casse/espaces) à une entrée existante est détecté comme doublon', () => {
    fc.assert(
      fc.property(
        fc.array(validEmail, { minLength: 1, maxLength: 6 }),
        fc.nat(),
        (existing, index) => {
          const target = existing[index % existing.length];
          return fc.assert(
            fc.property(equivalentVariant(target), (variant) => {
              expect(isDuplicateInvitationEmail(variant, existing)).toBe(true);
            }),
            { numRuns: 10 }
          );
        }
      ),
      { numRuns: 30 }
    );
  });

  it('un e-mail non équivalent à aucune entrée existante n\'est pas un doublon', () => {
    fc.assert(
      fc.property(
        fc.array(validEmail, { maxLength: 6 }),
        validEmail,
        (existing, candidate) => {
          const normalized = candidate.trim().toLowerCase();
          const existsEquivalent = existing.some(
            (e) => e.trim().toLowerCase() === normalized
          );
          // On ne teste l'absence de doublon que lorsque le candidat n'est réellement pas présent.
          fc.pre(!existsEquivalent);
          expect(isDuplicateInvitationEmail(candidate, existing)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('aucun doublon possible face à une liste vide, et valeurs non chaîne non doublons', () => {
    fc.assert(
      fc.property(validEmail, (candidate) => {
        expect(isDuplicateInvitationEmail(candidate, [])).toBe(false);
      }),
      { numRuns: 100 }
    );
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(undefined), fc.constant(null), fc.integer()),
        fc.array(validEmail, { maxLength: 4 }),
        (notAString, existing) => {
          expect(isDuplicateInvitationEmail(notAString, existing)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// --- Property 6 -----------------------------------------------------------

describe('authorization — Property 6 : expiration d\'invitation au-delà de 168 heures', () => {
  // Feature: agency-operations-expansion, Property 6: Expiration d'invitation au-delà de 168 heures
  // Pour tout horodatage de création et tout instant d'acceptation, l'invitation est expirée si et
  // seulement si l'écart dépasse strictement 168 heures ; une invitation expirée ne crée aucun compte.
  // Validates: Requirements 1.7

  // Horodatage plausible en millisecondes (autour d'une époque récente).
  const timestampMs = fc.integer({ min: 0, max: 4_102_444_800_000 });

  it('isInvitationExpired === (acceptedAtMs − createdAtMs > 168 h), pour tout couple fini', () => {
    fc.assert(
      fc.property(timestampMs, timestampMs, (createdAtMs, acceptedAtMs) => {
        const expected = acceptedAtMs - createdAtMs > INVITATION_EXPIRY_MS;
        expect(isInvitationExpired(createdAtMs, acceptedAtMs)).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  it('frontière exacte à 168 h : non expirée à l\'instant pile, expirée 1 ms après', () => {
    fc.assert(
      fc.property(timestampMs, (createdAtMs) => {
        const atBoundary = createdAtMs + INVITATION_EXPIRY_MS;
        const justAfter = createdAtMs + INVITATION_EXPIRY_MS + 1;
        expect(isInvitationExpired(createdAtMs, atBoundary)).toBe(false);
        expect(isInvitationExpired(createdAtMs, justAfter)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('une acceptation dans le délai (écart ≤ 168 h) n\'est jamais expirée', () => {
    fc.assert(
      fc.property(
        timestampMs,
        fc.integer({ min: 0, max: INVITATION_EXPIRY_MS }),
        (createdAtMs, delta) => {
          expect(isInvitationExpired(createdAtMs, createdAtMs + delta)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('tout horodatage non fini (NaN, Infinity, non numérique) est traité comme expiré', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(NaN), fc.constant(Infinity), fc.constant(-Infinity), fc.constant(undefined), fc.constant('x')),
        timestampMs,
        (invalid, valid) => {
          expect(isInvitationExpired(invalid, valid)).toBe(true);
          expect(isInvitationExpired(valid, invalid)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
