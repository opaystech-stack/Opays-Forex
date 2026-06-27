import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import translations from './i18n';

// Feature: agency-operations-expansion, Property 36: Parité des clés de traduction fr/en
// _Requirements: 16.7_ — Pour toute clé de texte présente dans le dictionnaire `fr`, la même
// clé existe dans le dictionnaire `en`, et réciproquement (parité structurelle complète).

// Aplatit récursivement un dictionnaire en l'ensemble de ses chemins de clés feuilles.
// Recurse dans les objets ET les tableaux (les index font partie du chemin) afin de
// détecter aussi bien une clé manquante qu'une différence de structure/longueur.
function collectKeyPaths(node, prefix = '', acc = new Set()) {
  if (Array.isArray(node)) {
    node.forEach((item, index) => {
      collectKeyPaths(item, prefix === '' ? String(index) : `${prefix}.${index}`, acc);
    });
    if (node.length === 0) acc.add(prefix);
    return acc;
  }
  if (node !== null && typeof node === 'object') {
    const keys = Object.keys(node);
    if (keys.length === 0) acc.add(prefix);
    for (const key of keys) {
      collectKeyPaths(node[key], prefix === '' ? key : `${prefix}.${key}`, acc);
    }
    return acc;
  }
  // Feuille (chaîne, nombre, booléen, null) : on enregistre son chemin.
  acc.add(prefix);
  return acc;
}

describe('parité des clés de traduction fr/en (i18n)', () => {
  const frPaths = collectKeyPaths(translations.fr);
  const enPaths = collectKeyPaths(translations.en);

  it('les dictionnaires fr et en existent et sont non vides', () => {
    expect(translations.fr).toBeTruthy();
    expect(translations.en).toBeTruthy();
    expect(frPaths.size).toBeGreaterThan(0);
    expect(enPaths.size).toBeGreaterThan(0);
  });

  it('toute clé présente dans fr existe dans en (et réciproquement)', () => {
    const missingInEn = [...frPaths].filter((p) => !enPaths.has(p)).sort();
    const missingInFr = [...enPaths].filter((p) => !frPaths.has(p)).sort();

    expect(missingInEn, `Clés présentes dans fr mais absentes de en : ${missingInEn.join(', ')}`).toEqual([]);
    expect(missingInFr, `Clés présentes dans en mais absentes de fr : ${missingInFr.join(', ')}`).toEqual([]);
  });

  // Renforcement par échantillonnage aléatoire : pour tout chemin tiré de l'union des deux
  // dictionnaires, le chemin appartient simultanément à fr et à en (parité bidirectionnelle).
  it('tout chemin de clé tiré au hasard est présent dans les deux dictionnaires', () => {
    const allPaths = [...new Set([...frPaths, ...enPaths])];
    expect(allPaths.length).toBeGreaterThan(0);

    fc.assert(
      fc.property(fc.constantFrom(...allPaths), (path) => {
        expect(frPaths.has(path)).toBe(true);
        expect(enPaths.has(path)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});
