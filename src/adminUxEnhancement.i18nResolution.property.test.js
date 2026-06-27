import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import fc from 'fast-check';

// Feature: admin-ux-enhancement, Property 4: i18n resolution never leaks empty strings and surfaces missing keys
// Validates: Requirements 9.4, 9.5
//
// This test exercises the REAL `useT` resolver from `src/i18n.js`. The resolver
// reads the active language from `useApp()` (AppContext), splits a dotted key,
// walks the translation table, and returns the raw key string whenever a node
// is missing (`if (!cur) return key`) or a leaf is falsy (`return cur || key`).
//
// We mock AppContext to control the active language, render the hook to obtain a
// concrete `t` resolver per locale, then assert two universal properties:
//   - for any key DEFINED in the active locale, t(key) is a non-empty string and
//     is NOT equal to the raw key (so it never leaks an empty/placeholder value);
//   - for any key that is NOT defined, t(key) returns the key string itself (so a
//     missing translation is always detectable, never silently blank).

// Controllable active language for the mocked AppContext.
const ctx = vi.hoisted(() => ({ language: 'fr' }));

vi.mock('./context/AppContext', () => ({
  useApp: () => ({ language: ctx.language }),
}));

// Import after the mock is registered so `useT` picks up the mocked AppContext.
const { useT } = await import('./i18n');
const translations = (await import('./i18n')).default;

const LOCALES = ['fr', 'en'];

// Flatten a locale object into the set of dotted paths that resolve to a
// NON-EMPTY STRING leaf. Arrays/objects are intermediate nodes the resolver
// returns as-is, so they are intentionally excluded from the "defined key" pool.
function collectStringLeafKeys(node, prefix, out) {
  if (node === null || node === undefined) return out;
  if (typeof node === 'string') {
    if (prefix && node.length > 0) out.push(prefix);
    return out;
  }
  if (Array.isArray(node)) {
    // Array leaves are not addressable as scalar i18n keys; skip.
    return out;
  }
  if (typeof node === 'object') {
    for (const key of Object.keys(node)) {
      const next = prefix ? `${prefix}.${key}` : key;
      collectStringLeafKeys(node[key], next, out);
    }
  }
  return out;
}

// Build a resolver `t` bound to a given locale by rendering the real hook.
function makeResolver(language) {
  ctx.language = language;
  const { result } = renderHook(() => useT());
  return result.current;
}

describe('admin-ux-enhancement / Property 4: i18n resolution behavior', () => {
  beforeEach(() => {
    ctx.language = 'fr';
  });

  for (const locale of LOCALES) {
    const definedKeys = collectStringLeafKeys(translations[locale], '', []);
    const topLevelKeys = new Set(Object.keys(translations[locale]));

    it(`[${locale}] returns a non-empty value (not the raw key) for every defined key`, () => {
      expect(definedKeys.length).toBeGreaterThan(0);
      const t = makeResolver(locale);

      fc.assert(
        fc.property(fc.constantFrom(...definedKeys), (key) => {
          const value = t(key);
          // Must resolve to a real string...
          expect(typeof value).toBe('string');
          // ...that is non-empty and non-blank (no leaked empty strings)...
          expect(value.trim().length).toBeGreaterThan(0);
          // ...and that is NOT just the raw key echoed back.
          expect(value).not.toBe(key);
        }),
        { numRuns: 100 }
      );
    });

    it(`[${locale}] returns the key itself for any undefined key (missing keys are surfaced)`, () => {
      const t = makeResolver(locale);

      // Generator for keys guaranteed absent from the locale: every key starts
      // with a sentinel top-level segment that does not exist in the table, so
      // the resolver short-circuits to returning the raw key string.
      const segArb = fc
        .string({ minLength: 1, maxLength: 8 })
        .map((s) => s.replace(/[^a-zA-Z0-9]/g, '') || 'x');

      const missingKeyArb = fc
        .array(segArb, { minLength: 0, maxLength: 3 })
        .map((parts) => ['zzmissing_sentinel', ...parts].join('.'));

      expect(topLevelKeys.has('zzmissing_sentinel')).toBe(false);

      fc.assert(
        fc.property(missingKeyArb, (key) => {
          const value = t(key);
          // A missing translation must echo the key back verbatim so callers /
          // QA can detect the gap (never a blank or placeholder).
          expect(value).toBe(key);
        }),
        { numRuns: 100 }
      );
    });
  }
});
