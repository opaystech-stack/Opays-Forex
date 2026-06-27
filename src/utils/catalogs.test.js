import { describe, expect, it } from 'vitest';
import {
  isValidCatalogLabel,
  isDeletableMethod,
  isValidCustomTransferLabel,
  TRANSFER_METHOD_OTHER,
  DEFAULT_PROVIDERS,
} from './catalogs';

describe('isValidCatalogLabel', () => {
  it('accepts a non-empty label of 1..60 characters that is not a duplicate', () => {
    expect(isValidCatalogLabel('Western Union', [])).toEqual({ ok: true });
    expect(isValidCatalogLabel('A', [])).toEqual({ ok: true });
    expect(isValidCatalogLabel('x'.repeat(60), [])).toEqual({ ok: true });
  });

  it('rejects an empty or whitespace-only label', () => {
    expect(isValidCatalogLabel('', []).ok).toBe(false);
    expect(isValidCatalogLabel('   ', []).ok).toBe(false);
  });

  it('rejects a label longer than 60 characters', () => {
    expect(isValidCatalogLabel('x'.repeat(61), []).ok).toBe(false);
  });

  it('measures length on the trimmed label', () => {
    // 60 chars surrounded by spaces is still valid.
    expect(isValidCatalogLabel(`  ${'x'.repeat(60)}  `, []).ok).toBe(true);
  });

  it('rejects a duplicate (case- and edge-space-insensitive)', () => {
    expect(isValidCatalogLabel('Orange Money', ['Orange Money']).ok).toBe(false);
    expect(isValidCatalogLabel('orange money', ['Orange Money']).ok).toBe(false);
    expect(isValidCatalogLabel('  ORANGE MONEY  ', ['Orange Money']).ok).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isValidCatalogLabel(null, []).ok).toBe(false);
    expect(isValidCatalogLabel(undefined, []).ok).toBe(false);
    expect(isValidCatalogLabel(42, []).ok).toBe(false);
  });

  it('tolerates a missing or invalid existingLabels argument', () => {
    expect(isValidCatalogLabel('MoneyGram').ok).toBe(true);
    expect(isValidCatalogLabel('MoneyGram', null).ok).toBe(true);
  });
});

describe('isDeletableMethod', () => {
  it('returns false for the permanent "Autre" method', () => {
    expect(isDeletableMethod(TRANSFER_METHOD_OTHER)).toBe(false);
    expect(isDeletableMethod('Autre')).toBe(false);
    expect(isDeletableMethod('  autre  ')).toBe(false);
  });

  it('returns true for any other method', () => {
    expect(isDeletableMethod('Western Union')).toBe(true);
    expect(isDeletableMethod('Orange Money')).toBe(true);
  });
});

describe('isValidCustomTransferLabel', () => {
  it('accepts a label of 1..60 characters', () => {
    expect(isValidCustomTransferLabel('Cash à domicile')).toBe(true);
    expect(isValidCustomTransferLabel('A')).toBe(true);
    expect(isValidCustomTransferLabel('x'.repeat(60))).toBe(true);
  });

  it('rejects an empty, whitespace-only or too-long label', () => {
    expect(isValidCustomTransferLabel('')).toBe(false);
    expect(isValidCustomTransferLabel('   ')).toBe(false);
    expect(isValidCustomTransferLabel('x'.repeat(61))).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isValidCustomTransferLabel(null)).toBe(false);
    expect(isValidCustomTransferLabel(undefined)).toBe(false);
  });
});

describe('DEFAULT_PROVIDERS', () => {
  it('contains exactly the default subscription providers', () => {
    expect(DEFAULT_PROVIDERS).toEqual(['Canal+', 'Access', 'Évasion', 'DStv']);
  });
});
