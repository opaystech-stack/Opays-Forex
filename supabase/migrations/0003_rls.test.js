// Feature: agency-operations-expansion, Task 22.2: tests d'integration RLS (assertions statiques)
//
// Tests d'integration de SECURITE de la migration 0003. La securite multi-tenant
// repose sur la base (cf. design : « la securite repose sur la base ») : le gating
// React n'est qu'une commodite UX. Ces tests verifient donc, AU NIVEAU DE LA
// MIGRATION SQL (source de verite), que les politiques RLS et fonctions
// SECURITY DEFINER imposent reellement :
//   - l'isolation par agence sur CHAQUE table portant agency_id (1.12, 3.6) ;
//   - le blocage d'acces des agences suspendues (5.2, 5.4) et le retablissement
//     a la reactivation (5.3, 5.6) via la condition a.state = 'active' ;
//   - la reservation des Droits_Module et de l'Etat_Agence a l'Editeur_Plateforme
//     (4.7, 4.8, 5.6) ;
//   - l'application des permissions d'ecriture au niveau base (2.8) ;
//   - la validation du jeton de commande a distance (14.5) ;
//   - les index de performance sur les colonnes de filtrage/tri (17.3, support 17.2/17.5).
//
// Ces assertions ne necessitent PAS de base de donnees vivante : elles inspectent
// le contenu SQL afin de garantir que les barrieres de securite sont presentes et
// correctement formulees. Elles completent les tests comportementaux du gating
// React (App.rls.integration.test.jsx).
//
// Validates: Requirements 1.12, 2.8, 3.6, 4.7, 4.8, 5.2, 5.3, 5.4, 5.6, 14.5, 17.3

import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = resolve(__dirname, './0003_agency_operations_expansion.sql');

let sql = '';
// Version a espaces normalises : rend les assertions robustes aux sauts de ligne
// et a l'indentation (les politiques RLS sont construites via format() sur
// plusieurs lignes concatenees).
let flat = '';

beforeAll(() => {
  sql = readFileSync(MIGRATION_PATH, 'utf8');
  flat = sql.replace(/\s+/g, ' ');
});

// Liste des tables portant agency_id soumises au gabarit d'isolation (section Y).
// Couvre les tables multi-tenant (1.1/1.2) ET les tables de tresorerie existantes
// (0001) dotees de agency_id par le backfill (1.3).
const ISOLATED_TABLES = [
  'points_of_sale', 'whatsapp_numbers', 'agency_members', 'agency_invitations',
  'module_states', 'transfers', 'subscriptions', 'flight_bookings',
  'order_links', 'remote_orders', 'whatsapp_messages', 'critical_action_log',
  'transactions', 'customers', 'expenses', 'loans', 'debts',
  'reminder_history', 'message_templates',
];

describe('Migration 0003 RLS — fonctions SECURITY DEFINER de cloisonnement', () => {
  it('definit is_agency_member en SECURITY DEFINER (Req 1.12, 3.6)', () => {
    expect(flat).toContain(
      'CREATE OR REPLACE FUNCTION public.is_agency_member(uid UUID, aid UUID)',
    );
    // La fonction doit etre SECURITY DEFINER pour contourner la RLS sans recursion.
    expect(flat).toMatch(
      /is_agency_member\(uid UUID, aid UUID\) RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER/i,
    );
  });

  it('is_agency_member exige un membre ACTIF (activation_state = actif) — Req 1.12', () => {
    expect(flat).toContain("m.activation_state = 'actif'");
  });

  it("is_agency_member exige une agence ACTIVE (suspension bloque l'acces, y compris le proprietaire) — Req 5.2, 5.4", () => {
    // Deux occurrences attendues : pour le membre ET pour le proprietaire.
    const occurrences = flat.match(/a\.state = 'active'/g) || [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
    // Le proprietaire lui-meme est soumis a la condition d'agence active.
    expect(flat).toMatch(/a\.owner_id = uid AND a\.state = 'active'/);
  });

  it("evalue l'etat a chaque requete, donc la reactivation retablit l'acces sans migration (Req 5.3, 5.6)", () => {
    // La fonction est une expression SQL pure (LANGUAGE sql) sans cache : tout
    // changement de agencies.state est pris en compte immediatement. On verifie
    // l'absence de materialisation/IMMUTABLE qui figerait l'etat.
    expect(flat).toMatch(/is_agency_member[\s\S]*?LANGUAGE sql SECURITY DEFINER/i);
    expect(flat).not.toMatch(/is_agency_member[^$]*IMMUTABLE/i);
  });

  it('definit is_platform_editor controlant l\'indicateur dedie (Req 4.8, 5.6)', () => {
    expect(flat).toContain(
      'CREATE OR REPLACE FUNCTION public.is_platform_editor(uid UUID)',
    );
    expect(flat).toMatch(/is_platform_editor\(uid UUID\) RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER/i);
    expect(flat).toContain('is_platform_editor = TRUE');
  });
});

describe('Migration 0003 RLS — isolation par agence (Req 1.12, 2.8, 3.6)', () => {
  it('active la RLS et applique le gabarit d\'isolation a chaque table portant agency_id', () => {
    // Le gabarit est applique via une boucle DO sur le tableau iso_tables.
    // On verifie d'abord que CHAQUE table attendue figure dans iso_tables.
    const arrayMatch = /iso_tables TEXT\[\] := ARRAY\[([\s\S]*?)\];/.exec(sql);
    expect(arrayMatch).toBeTruthy();
    const arrayBody = arrayMatch[1];
    for (const table of ISOLATED_TABLES) {
      expect(arrayBody).toContain(`'${table}'`);
    }
  });

  it('le gabarit active ROW LEVEL SECURITY et impose is_agency_member en USING ET WITH CHECK', () => {
    // ENABLE ROW LEVEL SECURITY applique a chaque table de la boucle.
    expect(flat).toContain('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY');
    // FOR ALL : lecture ET ecriture cloisonnees (Req 2.8).
    expect(flat).toContain('FOR ALL TO authenticated');
    // La lecture (USING) ET l'ecriture (WITH CHECK) exigent l'appartenance a l'agence.
    expect(flat).toContain(
      'USING (public.has_access(auth.uid()) AND public.is_agency_member(auth.uid(), agency_id))',
    );
    expect(flat).toContain(
      'WITH CHECK (public.has_access(auth.uid()) AND public.is_agency_member(auth.uid(), agency_id))',
    );
  });

  it('supprime les politiques permissives heritees de 0001 (sinon fuite inter-agences — Req 3.6)', () => {
    // Les politiques 0001 n'exigeaient que has_access() ; combinees en OR avec le
    // gabarit, leur maintien laisserait un Utilisateur lire d'autres agences.
    const droppedPolicies = [
      ['tx_rw_access', 'transactions'],
      ['customers_rw_access', 'customers'],
      ['expenses_rw_access', 'expenses'],
      ['loans_rw_access', 'loans'],
      ['debts_rw_access', 'debts'],
    ];
    for (const [policy, table] of droppedPolicies) {
      expect(flat).toContain(`DROP POLICY IF EXISTS ${policy} ON public.${table};`);
    }
  });
});

describe('Migration 0003 RLS — Droits_Module reserves a l\'Editeur_Plateforme (Req 4.7, 4.8)', () => {
  it('active la RLS sur module_entitlements', () => {
    expect(flat).toContain('ALTER TABLE public.module_entitlements ENABLE ROW LEVEL SECURITY');
  });

  it('reserve l\'ecriture des Droits_Module a l\'Editeur_Plateforme (Req 4.7, 4.8)', () => {
    expect(flat).toContain('CREATE POLICY me_write_editor ON public.module_entitlements');
    // FOR ALL editeur : seul un Editeur_Plateforme cree/modifie/supprime un Droit_Module.
    expect(flat).toMatch(
      /me_write_editor ON public\.module_entitlements FOR ALL TO authenticated USING \(public\.is_platform_editor\(auth\.uid\(\)\)\) WITH CHECK \(public\.is_platform_editor\(auth\.uid\(\)\)\)/,
    );
  });

  it('une Agence ne lit que ses propres Droits_Module (Req 4.8)', () => {
    expect(flat).toContain('CREATE POLICY me_select_member ON public.module_entitlements');
    expect(flat).toMatch(
      /me_select_member ON public\.module_entitlements FOR SELECT TO authenticated USING \(public\.is_agency_member\(auth\.uid\(\), agency_id\)\)/,
    );
  });
});

describe('Migration 0003 RLS — cycle de vie des agences reserve a l\'Editeur_Plateforme (Req 5.2, 5.3, 5.6)', () => {
  it('active la RLS sur agencies', () => {
    expect(flat).toContain('ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY');
  });

  it('seul l\'Editeur_Plateforme modifie l\'Etat_Agence (suspension/reactivation — Req 5.2, 5.3, 5.6)', () => {
    expect(flat).toContain('CREATE POLICY ag_update_editor ON public.agencies');
    expect(flat).toMatch(
      /ag_update_editor ON public\.agencies FOR UPDATE TO authenticated USING \(public\.is_platform_editor\(auth\.uid\(\)\)\) WITH CHECK \(public\.is_platform_editor\(auth\.uid\(\)\)\)/,
    );
  });

  it('l\'Editeur_Plateforme lit toutes les agences ; le proprietaire lit la sienne meme suspendue (Req 5.1, 5.4)', () => {
    expect(flat).toContain('CREATE POLICY ag_select_editor ON public.agencies');
    expect(flat).toContain('CREATE POLICY ag_select_owner ON public.agencies');
    // ag_select_owner : owner_id = auth.uid() (sans condition d'etat) afin
    // d'afficher le message d'acces suspendu (Req 5.4).
    expect(flat).toMatch(
      /ag_select_owner ON public\.agencies FOR SELECT TO authenticated USING \(owner_id = auth\.uid\(\)\)/,
    );
  });
});

describe('Migration 0003 RLS — catalogues administrables reserves a l\'editeur (Req 9.6, 11.7)', () => {
  it('reserve l\'ecriture des catalogues a l\'Editeur_Plateforme', () => {
    expect(flat).toContain('CREATE POLICY tm_write_editor ON public.transfer_methods');
    expect(flat).toContain('CREATE POLICY sp_write_editor ON public.subscription_providers');
    expect(flat).toMatch(
      /tm_write_editor ON public\.transfer_methods FOR ALL TO authenticated USING \(public\.is_platform_editor\(auth\.uid\(\)\)\)/,
    );
    expect(flat).toMatch(
      /sp_write_editor ON public\.subscription_providers FOR ALL TO authenticated USING \(public\.is_platform_editor\(auth\.uid\(\)\)\)/,
    );
  });

  it('autorise la lecture des entrees plateforme (agency_id IS NULL) ou propres a l\'agence', () => {
    expect(flat).toContain(
      'tm_read_member ON public.transfer_methods FOR SELECT TO authenticated USING (agency_id IS NULL OR public.is_agency_member(auth.uid(), agency_id))',
    );
    expect(flat).toContain(
      'sp_read_member ON public.subscription_providers FOR SELECT TO authenticated USING (agency_id IS NULL OR public.is_agency_member(auth.uid(), agency_id))',
    );
  });
});

describe('Migration 0003 RLS — commande a distance validee par jeton (Req 14.5)', () => {
  it('la RPC submit_remote_order est SECURITY DEFINER', () => {
    expect(flat).toContain('CREATE OR REPLACE FUNCTION public.submit_remote_order(');
    expect(flat).toMatch(/submit_remote_order\([\s\S]*?\) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER/i);
  });

  it('refuse un jeton inconnu, revoque ou expire (Req 14.5)', () => {
    expect(flat).toContain("RAISE EXCEPTION 'invalid_order_token'");
    expect(flat).toContain("RAISE EXCEPTION 'revoked_order_token'");
    expect(flat).toContain("RAISE EXCEPTION 'expired_order_token'");
    // L'expiration compare expires_at a l'instant courant.
    expect(flat).toContain('v_link.expires_at < TIMEZONE');
  });

  it('derive agency_id du Lien_Commande (jamais fourni par le client — Req 3.2)', () => {
    // L'insertion utilise v_link.agency_id, garantissant le rattachement correct.
    expect(flat).toMatch(/INSERT INTO public\.remote_orders[\s\S]*?VALUES \( v_link\.agency_id/);
  });

  it('expose l\'execution de la RPC publique aux roles anon et authenticated (Req 14.3)', () => {
    expect(flat).toContain(
      'GRANT EXECUTE ON FUNCTION public.submit_remote_order(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;',
    );
  });
});

describe('Migration 0003 — index de performance des listes paginees (Req 17.3, support 17.2/17.5)', () => {
  // Index sur (agency_id, <date>) acceleant le filtrage par agence et le tri
  // chronologique des listes paginees jusqu'a 50 000 Operations.
  const performanceIndexes = [
    ['idx_tx_agency_ts', 'transactions', /idx_tx_agency_ts\s+ON public\.transactions\(agency_id, timestamp DESC\)/],
    ['idx_customers_agency', 'customers', /idx_customers_agency\s+ON public\.customers\(agency_id\)/],
    ['idx_transfers_agency', 'transfers', /idx_transfers_agency\s+ON public\.transfers\(agency_id, created_at DESC\)/],
    ['idx_subs_agency_renew', 'subscriptions', /idx_subs_agency_renew\s+ON public\.subscriptions\(agency_id, renewal_date\)/],
    ['idx_flights_agency_at', 'flight_bookings', /idx_flights_agency_at\s+ON public\.flight_bookings\(agency_id, flight_at\)/],
    ['idx_wamsg_agency_ts', 'whatsapp_messages', /idx_wamsg_agency_ts\s+ON public\.whatsapp_messages\(agency_id, created_at DESC\)/],
    ['idx_remote_orders_agency', 'remote_orders', /idx_remote_orders_agency\s+ON public\.remote_orders\(agency_id, created_at DESC\)/],
  ];

  it.each(performanceIndexes)('cree l\'index %s sur public.%s avec axe de tri', (name, table, re) => {
    expect(flat).toMatch(re);
  });

  it('cree tous les index de maniere idempotente (IF NOT EXISTS)', () => {
    for (const [name] of performanceIndexes) {
      expect(flat).toMatch(new RegExp(`CREATE INDEX IF NOT EXISTS ${name}\\b`));
    }
  });
});
