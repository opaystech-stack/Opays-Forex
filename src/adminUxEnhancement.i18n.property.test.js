import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import translations from './i18n';

// Feature: admin-ux-enhancement, Property 3: New i18n keys are defined and non-empty in both locales
// Validates: Requirements 9.2, 11.4
//
// For any i18n key introduced or relied upon by the admin-ux-enhancement feature,
// the value SHALL be defined and non-empty in BOTH the `fr` and `en` locales of
// `src/i18n.js`, and the key SHALL be present in both locales.

// Keys the feature introduces / relies upon. Expressed as dot-notation paths into
// the locale dictionaries exported by src/i18n.js (default export -> { fr, en }).
const FEATURE_I18N_KEYS = [
  // Newly introduced admin-ux-enhancement keys
  'admin.subtitle',
  'admin.col_actions',
  'admin.view_proof',
  // Reused keys the feature relies on
  'nav.dashboard',
  'access.logout',
  'app.title',
  'admin.col_email',
  'admin.col_access',
  'admin.col_status',
  'admin.access_granted',
  'admin.access_revoked',
  'admin.empty',
  'loading.data',
  'admin.status_none',
];

// Resolve a dot-notation key path against a locale dictionary.
// Returns `undefined` if any segment along the path is missing.
function resolveKey(dict, keyPath) {
  return keyPath.split('.').reduce((node, segment) => {
    if (node !== null && typeof node === 'object' && segment in node) {
      return node[segment];
    }
    return undefined;
  }, dict);
}

function isDefinedNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

describe('admin-ux-enhancement i18n keys defined and non-empty across locales', () => {
  it('the fr and en locale dictionaries exist', () => {
    expect(translations.fr).toBeTruthy();
    expect(translations.en).toBeTruthy();
  });

  it('every feature i18n key resolves to a defined, non-empty string in both fr and en', () => {
    fc.assert(
      fc.property(fc.constantFrom(...FEATURE_I18N_KEYS), (keyPath) => {
        const frValue = resolveKey(translations.fr, keyPath);
        const enValue = resolveKey(translations.en, keyPath);

        // Key exists in both locales.
        expect(frValue, `Missing key in fr locale: ${keyPath}`).not.toBeUndefined();
        expect(enValue, `Missing key in en locale: ${keyPath}`).not.toBeUndefined();

        // Value is a defined, non-empty (non-blank) string in both locales.
        expect(
          isDefinedNonEmptyString(frValue),
          `fr value for ${keyPath} must be a non-empty string, got: ${JSON.stringify(frValue)}`
        ).toBe(true);
        expect(
          isDefinedNonEmptyString(enValue),
          `en value for ${keyPath} must be a non-empty string, got: ${JSON.stringify(enValue)}`
        ).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});
