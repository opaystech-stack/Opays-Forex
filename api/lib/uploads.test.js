import { describe, it, expect } from 'vitest';
import { validateUpload, buildStoragePath, MAX_UPLOAD_BYTES } from './uploads.js';

describe('validateUpload', () => {
  it('accepte une image PNG de taille valide', () => {
    expect(validateUpload({ mimetype: 'image/png', size: 1024 }).ok).toBe(true);
  });

  it('rejette un type MIME non autorisé (anti-exécutable)', () => {
    const res = validateUpload({ mimetype: 'application/x-msdownload', size: 1024 });
    expect(res.ok).toBe(false);
    expect(res.code).toBe('invalid_format');
  });

  it('rejette une taille nulle ou au-delà de 5 Mo', () => {
    expect(validateUpload({ mimetype: 'image/png', size: 0 }).ok).toBe(false);
    expect(validateUpload({ mimetype: 'image/png', size: MAX_UPLOAD_BYTES + 1 }).ok).toBe(false);
  });
});

describe('buildStoragePath — confinement & sécurité', () => {
  it("préfixe par agency_id puis user_id", () => {
    const p = buildStoragePath('agency-A', 'user-1', 'recu.png', 1000);
    expect(p).toBe('agency-A/user-1/1000-recu.png');
  });

  it('neutralise les tentatives de traversal de chemin', () => {
    const p = buildStoragePath('agency-A', 'user-1', '../../../etc/passwd', 1000);
    // aucun « .. », « / » ou « \ » ne subsiste dans le nom de fichier
    expect(p).toBe('agency-A/user-1/1000-.._.._.._etc_passwd');
    expect(p.split('/').length).toBe(3);
  });

  it("isole bien deux agences dans des dossiers distincts", () => {
    const a = buildStoragePath('agency-A', 'u', 'f.png', 1);
    const b = buildStoragePath('agency-B', 'u', 'f.png', 1);
    expect(a.startsWith('agency-A/')).toBe(true);
    expect(b.startsWith('agency-B/')).toBe(true);
  });

  it('retombe sur des valeurs sûres si les entrées sont vides', () => {
    expect(buildStoragePath(null, undefined, '', 5)).toBe('agency/user/5-file');
  });
});
