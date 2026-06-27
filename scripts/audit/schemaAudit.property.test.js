import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { summarizeFindings } from './schemaAudit.js';

// Feature: financial-ops-audit-voice-agent, Property 8: Verdict de cohérence du schéma
describe('summarizeFindings (Property 8)', () => {
  it('totalEcarts === findings.length et verdict cohérent SSI totalEcarts === 0', () => {
    // Findings arbitraires : tableaux d'objets quelconques.
    const findingsArb = fc.array(fc.object(), { maxLength: 20 });

    fc.assert(
      fc.property(findingsArb, (findings) => {
        const summary = summarizeFindings(findings);

        // totalEcarts est exactement le cardinal de l'ensemble des findings.
        expect(summary.totalEcarts).toBe(findings.length);

        // verdict === 'cohérent' SSI totalEcarts === 0, sinon 'incohérent'.
        if (summary.totalEcarts === 0) {
          expect(summary.verdict).toBe('cohérent');
        } else {
          expect(summary.verdict).toBe('incohérent');
        }
      }),
      { numRuns: 100 }
    );
  });
});
