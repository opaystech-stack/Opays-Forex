import { describe, it, expect } from 'vitest';
import { computeAccessVerdict, isPaidAccessEffective, TRIAL_DURATION_DAYS } from './access.js';

// auth-access-mobile-fixes (Z4) — autorité d'accès CÔTÉ SERVEUR (Property 4).
// Le verdict d'accès doit refléter : accès libre tant que l'essai 30 jours est
// actif (now - created_at < 30j), bloqué au-delà sauf accès payant effectif.
describe('computeAccessVerdict — essai 30 jours imposé côté serveur', () => {
  const NOW = Date.parse('2024-06-15T12:00:00.000Z');
  const DAY = 24 * 60 * 60 * 1000;

  it('accorde l\'accès pendant l\'essai (< 30 jours), sans paiement', () => {
    const createdAt = new Date(NOW - 10 * DAY).toISOString();
    const v = computeAccessVerdict({ createdAt, paidAccess: false, now: NOW });
    expect(v.accessGranted).toBe(true);
    expect(v.trialActive).toBe(true);
    expect(v.paidAccess).toBe(false);
  });

  it('bloque l\'accès hors essai (>= 30 jours) sans accès payant', () => {
    const createdAt = new Date(NOW - 45 * DAY).toISOString();
    const v = computeAccessVerdict({ createdAt, paidAccess: false, now: NOW });
    expect(v.accessGranted).toBe(false);
    expect(v.trialActive).toBe(false);
  });

  it('au jour 30 pile, l\'essai est terminé (bloqué sans paiement)', () => {
    const createdAt = new Date(NOW - 30 * DAY).toISOString();
    const v = computeAccessVerdict({ createdAt, paidAccess: false, now: NOW });
    expect(v.trialActive).toBe(false);
    expect(v.accessGranted).toBe(false);
  });

  it('accorde l\'accès à un compte payant indépendamment de l\'essai', () => {
    const createdAt = new Date(NOW - 200 * DAY).toISOString();
    const v = computeAccessVerdict({ createdAt, paidAccess: true, now: NOW });
    expect(v.accessGranted).toBe(true);
    expect(v.paidAccess).toBe(true);
  });

  it('révoque l\'accès payant échu (paid_access_until dépassé)', () => {
    const createdAt = new Date(NOW - 200 * DAY).toISOString();
    const paidAccessUntil = new Date(NOW - DAY).toISOString();
    const v = computeAccessVerdict({ createdAt, paidAccess: true, paidAccessUntil, now: NOW });
    expect(v.paidAccess).toBe(false);
    expect(v.accessGranted).toBe(false);
  });

  it('expose trialEndsAt = created_at + 30 jours', () => {
    const createdAt = new Date(NOW).toISOString();
    const v = computeAccessVerdict({ createdAt, now: NOW });
    expect(v.trialEndsAt).toBe(new Date(NOW + TRIAL_DURATION_DAYS * DAY).toISOString());
  });

  it('considère l\'essai actif si la date de création est inconnue', () => {
    const v = computeAccessVerdict({ createdAt: null, paidAccess: false, now: NOW });
    expect(v.trialActive).toBe(true);
    expect(v.accessGranted).toBe(true);
  });
});

describe('isPaidAccessEffective', () => {
  const NOW = Date.parse('2024-06-15T12:00:00.000Z');
  it('faux si paidAccess !== true', () => {
    expect(isPaidAccessEffective(false, null, NOW)).toBe(false);
  });
  it('vrai si payant sans échéance', () => {
    expect(isPaidAccessEffective(true, null, NOW)).toBe(true);
  });
  it('respecte une échéance future / passée', () => {
    expect(isPaidAccessEffective(true, new Date(NOW + 1000).toISOString(), NOW)).toBe(true);
    expect(isPaidAccessEffective(true, new Date(NOW - 1000).toISOString(), NOW)).toBe(false);
  });
});
