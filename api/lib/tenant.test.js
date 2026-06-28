import { describe, it, expect } from 'vitest';
import { resolveTenant } from './tenant.js';

// Preuve d'étanchéité inter-agences (R1/R2) au niveau du verrou de locataire.
// Chaque route Fastify applique ensuite `WHERE agency_id = request.agencyId`,
// si bien que confiner `agencyId` au jeton suffit à interdire toute fuite.
describe('resolveTenant — étanchéité inter-agences (R1/R2)', () => {
  it("confine un caissier à son agence, même s'il falsifie x-agency-id", () => {
    const user = { id: 'u1', role: 'caissier', agency_id: 'agency-A' };
    const res = resolveTenant(user, { 'x-agency-id': 'agency-B' });
    expect(res.ok).toBe(true);
    expect(res.agencyId).toBe('agency-A'); // jamais agency-B
  });

  it('ignore x-agency-id pour un gérant (confinement strict)', () => {
    const user = { id: 'u3', role: 'gerant', agency_id: 'agency-A' };
    const res = resolveTenant(user, { 'x-agency-id': 'agency-Z' });
    expect(res.ok).toBe(true);
    expect(res.agencyId).toBe('agency-A');
  });

  it('refuse (403) un utilisateur non superadmin sans agence', () => {
    const res = resolveTenant({ id: 'u2', role: 'agent', agency_id: null }, {});
    expect(res.ok).toBe(false);
    expect(res.status).toBe(403);
  });

  it('rejette (401) une requête non authentifiée', () => {
    expect(resolveTenant(null, {}).ok).toBe(false);
    expect(resolveTenant(null, {}).status).toBe(401);
    expect(resolveTenant(undefined).ok).toBe(false);
  });

  it('autorise un superadmin à cibler une agence via x-agency-id', () => {
    const res = resolveTenant(
      { id: 'root', role: 'superadmin', agency_id: null },
      { 'x-agency-id': 'agency-B' }
    );
    expect(res.ok).toBe(true);
    expect(res.agencyId).toBe('agency-B');
  });

  it("retombe sur l'agence du superadmin si aucun en-tête n'est fourni", () => {
    const res = resolveTenant({ id: 'root', role: 'superadmin', agency_id: 'agency-HQ' }, {});
    expect(res.ok).toBe(true);
    expect(res.agencyId).toBe('agency-HQ');
  });
});
