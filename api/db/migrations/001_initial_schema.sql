-- 001_initial_schema.sql
-- Baseline du schéma OpaysFox + colonnes manquantes ajoutées le 2026-07-01
-- Appliquer avec : psql -U foxuser -d foxdb -f 001_initial_schema.sql

-- ============================================================
-- module_entitlements
-- ============================================================
ALTER TABLE module_entitlements ADD COLUMN IF NOT EXISTS granted boolean DEFAULT true;

-- ============================================================
-- module_states
-- ============================================================
ALTER TABLE module_states ADD COLUMN IF NOT EXISTS enabled boolean DEFAULT true;

-- ============================================================
-- users
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS paid_access boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS paid_access_until timestamptz;

-- ============================================================
-- expenses
-- ============================================================
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS timestamp timestamptz DEFAULT now();
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS note text;

-- ============================================================
-- reminder_history
-- ============================================================
ALTER TABLE reminder_history ADD COLUMN IF NOT EXISTS loan_id uuid;
ALTER TABLE reminder_history ADD COLUMN IF NOT EXISTS template_id uuid;
ALTER TABLE reminder_history ADD COLUMN IF NOT EXISTS scenario text;
ALTER TABLE reminder_history ADD COLUMN IF NOT EXISTS content text;
ALTER TABLE reminder_history ADD COLUMN IF NOT EXISTS trigger_source varchar(32) DEFAULT 'manual';
ALTER TABLE reminder_history ADD COLUMN IF NOT EXISTS provider_message_id text;
ALTER TABLE reminder_history ADD COLUMN IF NOT EXISTS error_reason text;
ALTER TABLE reminder_history ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- ============================================================
-- transfer_methods
-- ============================================================
ALTER TABLE transfer_methods ADD COLUMN IF NOT EXISTS label text;

-- ============================================================
-- subscription_providers
-- ============================================================
ALTER TABLE subscription_providers ADD COLUMN IF NOT EXISTS label text;

-- ============================================================
-- Table de suivi des migrations
-- ============================================================
CREATE TABLE IF NOT EXISTS _migrations (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  checksum VARCHAR(64) NOT NULL
);
