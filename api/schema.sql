-- OpaysFox v2 Schema — PostgreSQL multi-tenant
-- Run as the application user on fox-db

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Agencies / Tenants
CREATE TABLE IF NOT EXISTS agencies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  currency_code VARCHAR(3) DEFAULT 'USD',
  is_active BOOLEAN DEFAULT true,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Platform super-admins and agency users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  role VARCHAR(32) NOT NULL DEFAULT 'agent', -- superadmin, agency_admin, manager, agent
  agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  email_verified BOOLEAN DEFAULT false,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_agency ON users(agency_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Employees (sub-accounts / cashiers of an agency)
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  role VARCHAR(32) DEFAULT 'agent', -- cashier, agent, supervisor
  pin_code VARCHAR(16),
  is_active BOOLEAN DEFAULT true,
  permissions JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employees_agency ON employees(agency_id);

-- Supported currencies with agency-specific rates
CREATE TABLE IF NOT EXISTS currencies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  code VARCHAR(3) NOT NULL,
  name TEXT NOT NULL,
  symbol TEXT,
  rate_to_usd DECIMAL(24, 8) NOT NULL DEFAULT 1.0,
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agency_id, code)
);

CREATE INDEX IF NOT EXISTS idx_currencies_agency ON currencies(agency_id);

-- Wallets / Caisses
CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  currency_code VARCHAR(3) NOT NULL,
  type VARCHAR(32) NOT NULL DEFAULT 'cash', -- cash, mobile_money, bank, crypto
  balance DECIMAL(24, 8) NOT NULL DEFAULT 0,
  provider TEXT,
  account_number TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallets_agency ON wallets(agency_id);
CREATE INDEX IF NOT EXISTS idx_wallets_currency ON wallets(currency_code);

-- Customers / Clients
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  id_number TEXT,
  address TEXT,
  kyc_status VARCHAR(32) DEFAULT 'pending',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_agency ON customers(agency_id);

-- Transactions (buy/sell/exchange)
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  source_wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  dest_wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  source_amount DECIMAL(24, 8) NOT NULL,
  dest_amount DECIMAL(24, 8) NOT NULL,
  exchange_rate DECIMAL(24, 8) NOT NULL,
  fee DECIMAL(24, 8) DEFAULT 0,
  fee_wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL,
  profit_usd DECIMAL(24, 8) DEFAULT 0,
  type VARCHAR(32) NOT NULL DEFAULT 'exchange', -- exchange, deposit, withdrawal, transfer
  status VARCHAR(32) NOT NULL DEFAULT 'completed', -- draft, pending, completed, cancelled
  transaction_id TEXT,
  receipt_text TEXT,
  note TEXT,
  metadata JSONB DEFAULT '{}',
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_agency ON transactions(agency_id);
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);

-- Inter-agency transfers
CREATE TABLE IF NOT EXISTS transfers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  source_wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  dest_agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,
  dest_wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL,
  amount DECIMAL(24, 8) NOT NULL,
  currency_code VARCHAR(3) NOT NULL,
  fee DECIMAL(24, 8) DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'pending', -- pending, in_transit, completed, cancelled
  reference TEXT,
  note TEXT,
  initiated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transfers_agency ON transfers(agency_id);
CREATE INDEX IF NOT EXISTS idx_transfers_status ON transfers(status);

-- Subscriptions (agency plans / recurring services)
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  plan_name TEXT NOT NULL,
  amount DECIMAL(24, 8) NOT NULL,
  currency_code VARCHAR(3) NOT NULL,
  frequency VARCHAR(32) NOT NULL DEFAULT 'monthly', -- daily, weekly, monthly, yearly
  next_billing_date DATE NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active', -- active, paused, cancelled
  wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_agency ON subscriptions(agency_id);

-- Support tickets
CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority VARCHAR(32) DEFAULT 'medium', -- low, medium, high, critical
  status VARCHAR(32) NOT NULL DEFAULT 'open', -- open, in_progress, resolved, closed
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  resolution TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tickets_agency ON tickets(agency_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);

-- Remote orders (commandes à distance WhatsApp/App)
CREATE TABLE IF NOT EXISTS remote_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_phone TEXT,
  customer_name TEXT,
  type VARCHAR(32) NOT NULL DEFAULT 'exchange', -- exchange, deposit, withdrawal
  source_currency_code VARCHAR(3),
  dest_currency_code VARCHAR(3),
  source_amount DECIMAL(24, 8),
  dest_amount DECIMAL(24, 8),
  status VARCHAR(32) NOT NULL DEFAULT 'pending', -- pending, confirmed, rejected, completed
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  source TEXT DEFAULT 'whatsapp', -- whatsapp, app, web
  metadata JSONB DEFAULT '{}',
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_remote_orders_agency ON remote_orders(agency_id);
CREATE INDEX IF NOT EXISTS idx_remote_orders_status ON remote_orders(status);

-- Expenses
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  amount DECIMAL(24, 8) NOT NULL,
  is_business BOOLEAN DEFAULT true,
  category TEXT,
  note TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_agency ON expenses(agency_id);

-- Loans
CREATE TABLE IF NOT EXISTS loans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  amount DECIMAL(24, 8) NOT NULL,
  currency_code VARCHAR(3) NOT NULL,
  interest_rate DECIMAL(8, 4) DEFAULT 0,
  due_date DATE,
  status VARCHAR(32) DEFAULT 'pending', -- pending, active, repaid, defaulted
  note TEXT,
  contract_image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loans_agency ON loans(agency_id);

-- Audit logs (immutable)
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_agency ON audit_logs(agency_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

-- Seed default currencies per agency (trigger)
CREATE OR REPLACE FUNCTION seed_agency_currencies()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO currencies (agency_id, code, name, symbol, rate_to_usd, is_active, is_default)
  VALUES
    (NEW.id, 'USD', 'US Dollar', '$', 1.0, true, true),
    (NEW.id, 'UGX', 'Ugandan Shilling', 'USh', 3750.0, true, false),
    (NEW.id, 'KES', 'Kenyan Shilling', 'KSh', 130.0, true, false),
    (NEW.id, 'CDF', 'Congolese Franc', 'FC', 2500.0, true, false),
    (NEW.id, 'TZS', 'Tanzanian Shilling', 'TSh', 2600.0, true, false),
    (NEW.id, 'BIF', 'Burundian Franc', 'FBu', 2850.0, true, false),
    (NEW.id, 'EUR', 'Euro', '€', 0.92, true, false),
    (NEW.id, 'XAF', 'CFA Franc BEAC', 'FCFA', 600.0, true, false),
    (NEW.id, 'RWF', 'Rwandan Franc', 'RF', 1380.0, true, false)
  ON CONFLICT (agency_id, code) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_seed_agency_currencies ON agencies;
CREATE TRIGGER trg_seed_agency_currencies
AFTER INSERT ON agencies
FOR EACH ROW
EXECUTE FUNCTION seed_agency_currencies();

-- Insert a default agency for migration/demo
INSERT INTO agencies (name, slug, email, currency_code, is_active)
VALUES ('Opays Fox Demo', 'opays-fox-demo', 'demo@opays.io', 'USD', true)
ON CONFLICT (slug) DO NOTHING;

-- Insert demo users (password: demo123)
INSERT INTO users (email, password_hash, first_name, last_name, role, agency_id, is_active)
VALUES (
  'demo@opays.io',
  crypt('demo123', gen_salt('bf')),
  'Demo',
  'Admin',
  'agency_admin',
  (SELECT id FROM agencies WHERE slug = 'opays-fox-demo' LIMIT 1),
  true
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (email, password_hash, first_name, last_name, role, agency_id, is_active)
VALUES (
  'agent@opays.io',
  crypt('agent123', gen_salt('bf')),
  'Demo',
  'Agent',
  'agent',
  (SELECT id FROM agencies WHERE slug = 'opays-fox-demo' LIMIT 1),
  true
)
ON CONFLICT (email) DO NOTHING;

-- Insert demo wallets
INSERT INTO wallets (agency_id, name, currency_code, type, balance)
SELECT
  a.id,
  unnest(ARRAY['Caisse USD Cash', 'Caisse UGX Cash', 'Airtel Money RDC', 'M-Pesa Kenya', 'MTN Uganda', 'Caisse Euro Cash', 'Orange Money Cameroun']),
  unnest(ARRAY['USD', 'UGX', 'USD', 'KES', 'UGX', 'EUR', 'XAF']),
  unnest(ARRAY['cash', 'cash', 'mobile_money', 'mobile_money', 'mobile_money', 'cash', 'mobile_money']),
  unnest(ARRAY[1200.00, 3650000.00, 800.00, 35000.00, 1500000.00, 450.00, 250000.00])
FROM agencies a WHERE a.slug = 'opays-fox-demo';

-- Insert demo customers
INSERT INTO customers (agency_id, name, phone)
SELECT a.id, unnest(ARRAY['Jean Kabamba', 'Mama Sarah', 'Joseph Mwamba']), unnest(ARRAY['+243****8271', '+256****1039', '+254****3344'])
FROM agencies a WHERE a.slug = 'opays-fox-demo'
ON CONFLICT DO NOTHING;

-- Insert demo transactions
INSERT INTO transactions (agency_id, source_wallet_id, dest_wallet_id, source_amount, dest_amount, exchange_rate, fee, profit_usd, type, status, transaction_id, note)
SELECT
  a.id,
  (SELECT id FROM wallets WHERE agency_id = a.id AND currency_code = 'USD' LIMIT 1),
  (SELECT id FROM wallets WHERE agency_id = a.id AND currency_code = 'UGX' LIMIT 1),
  100.00, 365000.00, 3650.00, 0.00, 2.67, 'exchange', 'completed', 'TXN-A1293041', 'Client WhatsApp - Paul'
FROM agencies a WHERE a.slug = 'opays-fox-demo'
ON CONFLICT DO NOTHING;

-- Insert demo expenses
INSERT INTO expenses (agency_id, wallet_id, amount, is_business, category, note)
SELECT
  a.id,
  (SELECT id FROM wallets WHERE agency_id = a.id AND currency_code = 'UGX' LIMIT 1),
  15000.00, true, 'Transport', 'Transport Cash Goma'
FROM agencies a WHERE a.slug = 'opays-fox-demo'
ON CONFLICT DO NOTHING;

-- Insert demo loans
INSERT INTO loans (agency_id, customer_id, wallet_id, amount, currency_code, interest_rate, due_date, status, note)
SELECT
  a.id,
  (SELECT id FROM customers WHERE agency_id = a.id LIMIT 1),
  (SELECT id FROM wallets WHERE agency_id = a.id AND currency_code = 'USD' LIMIT 1),
  500.00, 'USD', 10.00, CURRENT_DATE + INTERVAL '7 days', 'pending', 'Prêt pour fonds de roulement magasin'
FROM agencies a WHERE a.slug = 'opays-fox-demo'
ON CONFLICT DO NOTHING;
