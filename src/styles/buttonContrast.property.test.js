import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { BUTTON_PALETTE, contrastRatio } from './buttonPalette';

// Feature: saas-finalization, Property 15: Contraste accessible du texte des boutons dans tous les états
describe('contraste des boutons (WCAG)', () => {
  it('chaque paire texte/fond de la palette a un ratio >= 4,5:1', () => {
    const arb = fc.constantFrom(...BUTTON_PALETTE);
    fc.assert(
      fc.property(arb, (pair) => {
        expect(contrastRatio(pair.text, pair.bg)).toBeGreaterThanOrEqual(4.5);
      }),
      { numRuns: 100 }
    );
  });

  // Feature: financial-ops-audit-voice-agent, Property 25: Contraste accessible du bouton « Agent vocal »
  // _Requirements: 10.7_ — toute paire texte/fond des boutons flottants (variant === 'fab'),
  // y compris l'état « voice-agent », respecte un ratio WCAG 2.1 >= 4,5:1.
  it('chaque bouton flottant (fab), dont « Agent vocal », a un ratio >= 4,5:1', () => {
    const fabPairs = BUTTON_PALETTE.filter((p) => p.variant === 'fab');
    expect(fabPairs.length).toBeGreaterThan(0);
    expect(fabPairs.some((p) => p.state === 'voice-agent')).toBe(true);

    const arb = fc.constantFrom(...fabPairs);
    fc.assert(
      fc.property(arb, (pair) => {
        expect(contrastRatio(pair.text, pair.bg)).toBeGreaterThanOrEqual(4.5);
      }),
      { numRuns: 100 }
    );
  });

  // Feature: agency-operations-expansion, Property 35: Contraste accessible des nouveaux composants
  // _Requirements: 16.6_ — toute paire texte/fond des nouveaux écrans (success, secondary,
  // module-toggle, badge-*) ajoutée à BUTTON_PALETTE respecte un ratio WCAG 2.1 >= 4,5:1.
  // (Réutilise la logique de palette ; cible explicitement les nouvelles variantes.)
  it('chaque nouvelle paire (agency-operations-expansion) a un ratio >= 4,5:1', () => {
    const NEW_VARIANTS = [
      'success',
      'secondary',
      'module-toggle',
      'badge-pending',
      'badge-active',
      'badge-suspended',
      'badge-expired',
    ];
    const newPairs = BUTTON_PALETTE.filter((p) => NEW_VARIANTS.includes(p.variant));
    // Chaque nouvelle variante attendue est bien présente dans la palette.
    for (const variant of NEW_VARIANTS) {
      expect(newPairs.some((p) => p.variant === variant)).toBe(true);
    }

    const arb = fc.constantFrom(...newPairs);
    fc.assert(
      fc.property(arb, (pair) => {
        expect(contrastRatio(pair.text, pair.bg)).toBeGreaterThanOrEqual(4.5);
      }),
      { numRuns: 100 }
    );
  });

  // _Requirements: 7.4_ — l'état désactivé est visuellement distinct de l'état actif
  it('les fonds actif et désactivé diffèrent pour une même variante', () => {
    const byVariant = {};
    for (const p of BUTTON_PALETTE) {
      byVariant[p.variant] = byVariant[p.variant] || {};
      byVariant[p.variant][p.state] = p.bg;
    }
    for (const variant of Object.keys(byVariant)) {
      const states = byVariant[variant];
      if (states.active && states.disabled) {
        expect(states.active).not.toBe(states.disabled);
      }
    }
  });
});
