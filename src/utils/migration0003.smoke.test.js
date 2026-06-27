// Feature: agency-operations-expansion, Task 1.6: schema smoke tests
//
// Tests smoke de schema pour la migration 0003 (fondations multi-tenant).
// Ils inspectent le contenu SQL du fichier de migration afin de verifier la
// presence des cles etrangeres d'anticipation structurelle et des index de
// performance, sans necessiter de base de donnees.
//
// Validates: Requirements 3.1, 3.3, 3.5, 5.7, 11.3, 13.6, 17.3

import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = resolve(
  __dirname,
  '../../supabase/migrations/0003_agency_operations_expansion.sql',
);

let sql = '';

/**
 * Extrait le corps d'une definition de table `CREATE TABLE ... public.<name> (...)`.
 * Renvoie le texte situe entre la premiere parenthese ouvrante et sa parenthese
 * fermante correspondante (gestion de l'imbrication).
 */
function extractTableBody(source, tableName) {
  const re = new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${tableName}\\s*\\(`, 'i');
  const match = re.exec(source);
  if (!match) return null;
  let depth = 0;
  const start = match.index + match[0].length - 1; // position de la '('
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(start + 1, i);
    }
  }
  return null;
}

/**
 * Renvoie la ligne de definition d'une colonne dans un corps de table.
 */
function columnLine(tableBody, column) {
  if (!tableBody) return null;
  return tableBody
    .split('\n')
    .map((l) => l.trim())
    .find((l) => new RegExp(`^${column}\\s+`, 'i').test(l));
}

beforeAll(() => {
  sql = readFileSync(MIGRATION_PATH, 'utf8');
});

describe('migration 0003 - cles etrangeres d\'anticipation structurelle', () => {
  it('agencies.owner_id reference auth.users (Req 3.1)', () => {
    const line = columnLine(extractTableBody(sql, 'agencies'), 'owner_id');
    expect(line).toBeTruthy();
    expect(line).toMatch(/REFERENCES\s+auth\.users\s*\(\s*id\s*\)/i);
  });

  it('agencies.plan_id reference public.plans (Req 5.7)', () => {
    const line = columnLine(extractTableBody(sql, 'agencies'), 'plan_id');
    expect(line).toBeTruthy();
    expect(line).toMatch(/REFERENCES\s+public\.plans\s*\(\s*id\s*\)/i);
    // plan_id reste nullable (un plan par defaut unique en V1).
    expect(line).not.toMatch(/NOT\s+NULL/i);
  });

  it('points_of_sale.agency_id reference public.agencies (Req 3.3)', () => {
    const line = columnLine(extractTableBody(sql, 'points_of_sale'), 'agency_id');
    expect(line).toBeTruthy();
    expect(line).toMatch(/REFERENCES\s+public\.agencies\s*\(\s*id\s*\)/i);
  });

  it('registers.pos_id reference public.points_of_sale (Req 3.3)', () => {
    const line = columnLine(extractTableBody(sql, 'registers'), 'pos_id');
    expect(line).toBeTruthy();
    expect(line).toMatch(/REFERENCES\s+public\.points_of_sale\s*\(\s*id\s*\)/i);
  });

  it('whatsapp_numbers.agency_id reference public.agencies (Req 3.5, 13.6)', () => {
    const line = columnLine(extractTableBody(sql, 'whatsapp_numbers'), 'agency_id');
    expect(line).toBeTruthy();
    expect(line).toMatch(/REFERENCES\s+public\.agencies\s*\(\s*id\s*\)/i);
  });

  it('subscription_providers.agency_id reference public.agencies et est NULLABLE (Req 11.3)', () => {
    const line = columnLine(extractTableBody(sql, 'subscription_providers'), 'agency_id');
    expect(line).toBeTruthy();
    expect(line).toMatch(/REFERENCES\s+public\.agencies\s*\(\s*id\s*\)/i);
    // agency_id NULL = entree de niveau plateforme : la colonne ne doit pas etre NOT NULL.
    expect(line).not.toMatch(/NOT\s+NULL/i);
  });
});

describe('migration 0003 - index de performance (Req 17.3)', () => {
  const indexes = [
    { name: 'idx_tx_agency_ts', table: 'transactions' },
    { name: 'idx_customers_agency', table: 'customers' },
    { name: 'idx_transfers_agency', table: 'transfers' },
    { name: 'idx_subs_agency_renew', table: 'subscriptions' },
    { name: 'idx_flights_agency_at', table: 'flight_bookings' },
    { name: 'idx_wamsg_agency_ts', table: 'whatsapp_messages' },
    { name: 'idx_remote_orders_agency', table: 'remote_orders' },
  ];

  it.each(indexes)('cree l\'index $name sur public.$table', ({ name, table }) => {
    const re = new RegExp(
      `CREATE INDEX IF NOT EXISTS\\s+${name}\\b[\\s\\S]*?ON\\s+public\\.${table}\\b`,
      'i',
    );
    expect(sql).toMatch(re);
  });

  it('cree les index de maniere idempotente (IF NOT EXISTS)', () => {
    for (const { name } of indexes) {
      expect(sql).toMatch(new RegExp(`CREATE INDEX IF NOT EXISTS\\s+${name}\\b`, 'i'));
    }
  });
});
