-- 002_cleanup_duplicate_columns.sql
-- Nettoie les colonnes en double et aligne le code avec le schéma DB
-- Appliquer avec : node db/migrate.js

-- ============================================================
-- module_entitlements : granted existe deja, on garde
-- ============================================================

-- ============================================================
-- module_states : is_enabled existe deja, enabled ajoute comme alias
-- ============================================================

-- ============================================================
-- transfer_methods : on garde name (colonne originale), label est l'ajout
-- On cree une vue ou un trigger pour synchroniser
-- ============================================================
-- Remplir label depuis name pour les enregistrements existants
UPDATE transfer_methods SET label = name WHERE label IS NULL;

-- ============================================================
-- subscription_providers : idem
-- ============================================================
UPDATE subscription_providers SET label = name WHERE label IS NULL;

-- ============================================================
-- flight_bookings : colonnes ajoutees
-- ============================================================
ALTER TABLE flight_bookings ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE flight_bookings ADD COLUMN IF NOT EXISTS profit_usd numeric(24,8) DEFAULT 0;
ALTER TABLE flight_bookings ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- ============================================================
-- remote_orders : colonnes ajoutees
-- ============================================================
ALTER TABLE remote_orders ADD COLUMN IF NOT EXISTS customer_phone text;
ALTER TABLE remote_orders ADD COLUMN IF NOT EXISTS customer_name text;
ALTER TABLE remote_orders ADD COLUMN IF NOT EXISTS source_currency_code varchar(3);
ALTER TABLE remote_orders ADD COLUMN IF NOT EXISTS dest_currency_code varchar(3);
ALTER TABLE remote_orders ADD COLUMN IF NOT EXISTS source_amount numeric(24,8);
ALTER TABLE remote_orders ADD COLUMN IF NOT EXISTS dest_amount numeric(24,8);
ALTER TABLE remote_orders ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE remote_orders ADD COLUMN IF NOT EXISTS assigned_to uuid;
ALTER TABLE remote_orders ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE remote_orders ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
