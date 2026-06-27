// Feature: agency-operations-expansion, Task (correctif securite) : policy upload 'order-proofs'
//
// Tests smoke de la migration 0004 : verifie que le depot de Preuve depuis le
// Formulaire_Commande public est autorise par une politique d'INSERT sur
// storage.objects STRICTEMENT limitee aux Liens_Commande valides (connus, non
// revoques, non expires), via la fonction SECURITY DEFINER is_valid_order_proof_path.
// Inspection statique du SQL — aucune base de donnees requise.
//
// Validates: Requirements 14.3, 14.4, 14.5

import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = resolve(
  __dirname,
  '../../supabase/migrations/0004_order_proofs_upload_policy.sql',
);

let sql = '';
let flat = '';

beforeAll(() => {
  sql = readFileSync(MIGRATION_PATH, 'utf8');
  flat = sql.replace(/\s+/g, ' ');
});

describe('Migration 0004 — fonction de validation du chemin (SECURITY DEFINER)', () => {
  it('definit is_valid_order_proof_path en SECURITY DEFINER', () => {
    expect(flat).toContain('CREATE OR REPLACE FUNCTION public.is_valid_order_proof_path(object_name TEXT)');
    expect(flat).toMatch(
      /is_valid_order_proof_path\(object_name TEXT\) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER/i,
    );
  });

  it('decompose le chemin via storage.foldername et exige au moins 2 segments', () => {
    expect(flat).toContain('storage.foldername(object_name)');
    expect(flat).toContain('< 2');
  });

  it('refuse un jeton inconnu, revoque ou expire (memes regles que submit_remote_order — Req 14.5)', () => {
    // Lookup par token sur order_links.
    expect(flat).toContain('FROM public.order_links');
    expect(flat).toContain('WHERE token = v_token');
    // Rejet si non trouve, revoque, ou expire.
    expect(flat).toMatch(/IF NOT FOUND THEN RETURN FALSE/);
    expect(flat).toMatch(/IF v_link\.revoked THEN RETURN FALSE/);
    expect(flat).toContain("v_link.expires_at < TIMEZONE('utc'::text, NOW())");
  });

  it('exige la coherence agence/jeton : l\'agency_id du chemin doit correspondre au lien (anti-falsification)', () => {
    expect(flat).toContain('v_link.agency_id <> v_agency_uuid');
  });

  it('accorde l\'execution de la fonction a anon et authenticated', () => {
    expect(flat).toContain(
      'GRANT EXECUTE ON FUNCTION public.is_valid_order_proof_path(TEXT) TO anon, authenticated;',
    );
  });
});

describe('Migration 0004 — politique d\'INSERT sur storage.objects (Req 14.4)', () => {
  it('cree une politique d\'INSERT op_insert_valid_link pour anon et authenticated', () => {
    expect(flat).toContain('DROP POLICY IF EXISTS op_insert_valid_link ON storage.objects;');
    expect(flat).toContain('CREATE POLICY op_insert_valid_link ON storage.objects');
    expect(flat).toMatch(/op_insert_valid_link ON storage\.objects FOR INSERT TO anon, authenticated/);
  });

  it('limite l\'INSERT au bucket order-proofs ET aux chemins de Lien_Commande valides', () => {
    expect(flat).toMatch(
      /WITH CHECK \( bucket_id = 'order-proofs' AND public\.is_valid_order_proof_path\(name\) \)/,
    );
  });

  it('n\'accorde aucune politique UPDATE ou DELETE a anon sur order-proofs (depot non ecrasable)', () => {
    // Seules les operations SELECT (0003, membres) et INSERT (0004, lien valide)
    // existent ; aucune politique d'UPDATE/DELETE n'est introduite ici.
    expect(flat).not.toMatch(/FOR UPDATE TO anon/);
    expect(flat).not.toMatch(/FOR DELETE TO anon/);
  });
});
