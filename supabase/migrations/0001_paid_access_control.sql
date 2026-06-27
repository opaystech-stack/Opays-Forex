-- ==========================================
-- MIGRATION 0001 : SCHEMA COMPLET + CONTROLE D'ACCES PAYANT
-- ==========================================
-- Ce fichier est autosuffisant : il cree le schema de base (tables de
-- tresorerie + triggers + RLS V1) puis ajoute le controle d'acces payant.
-- Il peut etre execute sur une base vierge OU sur une base existante
-- (toutes les instructions sont idempotentes : IF NOT EXISTS / OR REPLACE /
-- DROP IF EXISTS).
--
-- Ordre d'execution :
--   A. Schema de base (wallets, exchange_rates, customers, transactions,
--      loans, expenses, debts, message_templates, reminder_history)
--   B. Triggers de mise a jour automatique des soldes
--   C. Tables du controle d'acces payant (access_profiles, payment_proofs)
--   D. Fonctions SECURITY DEFINER (is_admin, has_access, handle_new_user)
--   E. Trigger d'auto-creation du Profil_Acces
--   F. Bucket Storage prive 'receipts' + politiques
--   G. RLS unifiee : toutes les tables requierent has_access(auth.uid())
-- ==========================================


-- ==========================================
-- A. SCHEMA DE BASE (tables de tresorerie)
-- ==========================================

-- 1. Portefeuilles (Wallets)
CREATE TABLE IF NOT EXISTS wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('cash', 'mobile_money')),
    balance DECIMAL(18, 4) DEFAULT 0.0000 NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Taux de Change Quotidiens
CREATE TABLE IF NOT EXISTS exchange_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    currency VARCHAR(3) NOT NULL,
    rate_to_usd DECIMAL(18, 8) NOT NULL,
    date DATE DEFAULT CURRENT_DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT unique_currency_date UNIQUE (currency, date)
);

-- 3. Clients (Customers)
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(30),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 4. Transactions (Ledger)
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(20) DEFAULT 'exchange' NOT NULL CHECK (type IN ('exchange', 'deposit', 'withdrawal')),
    source_wallet_id UUID REFERENCES wallets(id) ON DELETE RESTRICT,
    dest_wallet_id UUID REFERENCES wallets(id) ON DELETE RESTRICT,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    source_amount DECIMAL(18, 4) NOT NULL CHECK (source_amount > 0),
    dest_amount DECIMAL(18, 4) NOT NULL CHECK (dest_amount > 0),
    exchange_rate DECIMAL(18, 8) NOT NULL,
    fee DECIMAL(18, 4) DEFAULT 0.0000 NOT NULL CHECK (fee >= 0),
    fee_wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL,
    profit_usd DECIMAL(18, 4) NOT NULL,
    status VARCHAR(20) DEFAULT 'completed' NOT NULL CHECK (status IN ('draft', 'completed')),
    transaction_id VARCHAR(100),
    receipt_text TEXT,
    image_url VARCHAR(500),
    note TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 5. Prets (Loans)
CREATE TABLE IF NOT EXISTS loans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
    wallet_id UUID REFERENCES wallets(id) ON DELETE RESTRICT NOT NULL,
    amount DECIMAL(18, 4) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL,
    interest_rate DECIMAL(5, 2) DEFAULT 0.00 NOT NULL CHECK (interest_rate >= 0),
    due_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'paid', 'overdue')),
    note TEXT,
    contract_image_url VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 6. Depenses (Expenses)
CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
    amount DECIMAL(18, 4) NOT NULL CHECK (amount > 0),
    is_business BOOLEAN DEFAULT TRUE NOT NULL,
    category VARCHAR(50) NOT NULL,
    note TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 7. Dettes & Creances (Debts)
CREATE TABLE IF NOT EXISTS debts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(20) NOT NULL CHECK (type IN ('receivable', 'payable')),
    counterparty_name VARCHAR(120),
    amount DECIMAL(18, 4) NOT NULL CHECK (amount > 0),
    currency VARCHAR(5) NOT NULL,
    note TEXT,
    status VARCHAR(20) DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'settled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    settled_at TIMESTAMP WITH TIME ZONE
);

-- 8. Modeles de message (Message Templates)
CREATE TABLE IF NOT EXISTS message_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(120) NOT NULL,
    lang VARCHAR(2) NOT NULL DEFAULT 'fr' CHECK (lang IN ('fr', 'en')),
    scenario VARCHAR(20) NOT NULL DEFAULT 'personalized'
        CHECK (scenario IN ('recovery', 'announcement', 'personalized', 'custom')),
    body TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 9. Historique des relances (Reminder History)
CREATE TABLE IF NOT EXISTS reminder_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    loan_id UUID REFERENCES loans(id) ON DELETE SET NULL,
    template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL,
    scenario VARCHAR(20) NOT NULL
        CHECK (scenario IN ('recovery', 'announcement', 'personalized', 'custom')),
    content TEXT NOT NULL,
    trigger_source VARCHAR(10) NOT NULL DEFAULT 'manual'
        CHECK (trigger_source IN ('manual', 'voice')),
    status VARCHAR(10) NOT NULL DEFAULT 'sent'
        CHECK (status IN ('sent', 'failed', 'queued')),
    provider_message_id VARCHAR(120),
    error_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reminder_history_customer ON reminder_history(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_templates_lang ON message_templates(lang, scenario);


-- ==========================================
-- B. TRIGGERS DE MISE A JOUR DES SOLDES
-- ==========================================

-- B1. INSERT sur transactions
CREATE OR REPLACE FUNCTION process_transaction_balance_change()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'draft' THEN
        RETURN NEW;
    END IF;
    IF NEW.source_wallet_id IS NOT NULL THEN
        UPDATE wallets SET balance = balance - NEW.source_amount, updated_at = NOW()
        WHERE id = NEW.source_wallet_id;
    END IF;
    IF NEW.dest_wallet_id IS NOT NULL THEN
        UPDATE wallets SET balance = balance + NEW.dest_amount, updated_at = NOW()
        WHERE id = NEW.dest_wallet_id;
    END IF;
    IF NEW.fee > 0 AND NEW.fee_wallet_id IS NOT NULL THEN
        UPDATE wallets SET balance = balance - NEW.fee, updated_at = NOW()
        WHERE id = NEW.fee_wallet_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_transaction_inserted ON transactions;
CREATE TRIGGER on_transaction_inserted
    AFTER INSERT ON transactions
    FOR EACH ROW EXECUTE FUNCTION process_transaction_balance_change();

-- B2. UPDATE sur transactions (draft -> completed)
CREATE OR REPLACE FUNCTION process_transaction_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'draft' AND NEW.status = 'completed' THEN
        IF NEW.source_wallet_id IS NOT NULL THEN
            UPDATE wallets SET balance = balance - NEW.source_amount, updated_at = NOW()
            WHERE id = NEW.source_wallet_id;
        END IF;
        IF NEW.dest_wallet_id IS NOT NULL THEN
            UPDATE wallets SET balance = balance + NEW.dest_amount, updated_at = NOW()
            WHERE id = NEW.dest_wallet_id;
        END IF;
        IF NEW.fee > 0 AND NEW.fee_wallet_id IS NOT NULL THEN
            UPDATE wallets SET balance = balance - NEW.fee, updated_at = NOW()
            WHERE id = NEW.fee_wallet_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_transaction_updated ON transactions;
CREATE TRIGGER on_transaction_updated
    AFTER UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION process_transaction_status_change();

-- B3. INSERT sur expenses
CREATE OR REPLACE FUNCTION process_expense_balance_change()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE wallets SET balance = balance - NEW.amount, updated_at = NOW()
    WHERE id = NEW.wallet_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_expense_inserted ON expenses;
CREATE TRIGGER on_expense_inserted
    AFTER INSERT ON expenses
    FOR EACH ROW EXECUTE FUNCTION process_expense_balance_change();

-- B4. INSERT/UPDATE sur loans
CREATE OR REPLACE FUNCTION process_loan_balance_change()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE wallets SET balance = balance - NEW.amount, updated_at = NOW()
        WHERE id = NEW.wallet_id;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF OLD.status != 'paid' AND NEW.status = 'paid' THEN
            UPDATE wallets
            SET balance = balance + (NEW.amount * (1 + NEW.interest_rate / 100)),
                updated_at = NOW()
            WHERE id = NEW.wallet_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_loan_inserted_or_updated ON loans;
CREATE TRIGGER on_loan_inserted_or_updated
    AFTER INSERT OR UPDATE ON loans
    FOR EACH ROW EXECUTE FUNCTION process_loan_balance_change();


-- ==========================================
-- C. TABLES DU CONTROLE D'ACCES PAYANT
-- ==========================================

-- C1. Profils d'acces (access_profiles)
-- Un profil par utilisateur Supabase Auth, cree automatiquement a l'inscription.
-- acces_autorise = FALSE par defaut : acces bloque jusqu'a validation manuelle.
-- Invariant activation_traceability : un acces actif porte toujours activated_by.
CREATE TABLE IF NOT EXISTS public.access_profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    acces_autorise BOOLEAN NOT NULL DEFAULT FALSE,
    role VARCHAR(10) NOT NULL DEFAULT 'user'
        CHECK (role IN ('user', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    activated_at TIMESTAMPTZ,
    activated_by UUID REFERENCES auth.users(id),
    CONSTRAINT activation_traceability CHECK (
        acces_autorise = FALSE OR activated_by IS NOT NULL
    )
);

-- C2. Preuves de paiement (payment_proofs)
CREATE TABLE IF NOT EXISTS public.payment_proofs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    mode_paiement VARCHAR(20) NOT NULL
        CHECK (mode_paiement IN ('bitcoin', 'lightning', 'usdt', 'mobile_money')),
    reference TEXT,
    recu_path TEXT NOT NULL,
    statut VARCHAR(10) NOT NULL DEFAULT 'en_attente'
        CHECK (statut IN ('en_attente', 'validee', 'rejetee')),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_payment_proofs_user     ON public.payment_proofs(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_submitted ON public.payment_proofs(submitted_at DESC);


-- ==========================================
-- D. FONCTIONS SECURITY DEFINER
-- ==========================================

-- is_admin : vrai si l'utilisateur a le role 'admin'
CREATE OR REPLACE FUNCTION public.is_admin(uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.access_profiles
        WHERE user_id = uid AND role = 'admin'
    );
$$;

-- has_access : vrai si acces_autorise = TRUE
CREATE OR REPLACE FUNCTION public.has_access(uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.access_profiles
        WHERE user_id = uid AND acces_autorise = TRUE
    );
$$;

-- handle_new_user : cree le Profil_Acces a l'inscription (idempotent)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.access_profiles (user_id, acces_autorise, role)
    VALUES (NEW.id, FALSE, 'user')
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$;


-- ==========================================
-- E. TRIGGER D'AUTO-CREATION DU PROFIL_ACCES
-- ==========================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();


-- ==========================================
-- F. BUCKET STORAGE PRIVE 'receipts'
-- ==========================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', FALSE)
ON CONFLICT (id) DO UPDATE SET public = FALSE;

-- Politique : chaque utilisateur lit/ecrit uniquement son dossier {user_id}/...
DROP POLICY IF EXISTS recus_user_rw ON storage.objects;
CREATE POLICY recus_user_rw ON storage.objects
    FOR ALL TO authenticated
    USING (
        bucket_id = 'receipts'
        AND (storage.foldername(name))[1] = auth.uid()::text
    )
    WITH CHECK (
        bucket_id = 'receipts'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Politique : un admin lit tous les recus (pour apercu via URL signee)
DROP POLICY IF EXISTS recus_admin_read ON storage.objects;
CREATE POLICY recus_admin_read ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'receipts'
        AND public.is_admin(auth.uid())
    );


-- ==========================================
-- G. RLS UNIFIEE — TOUTES LES TABLES
-- ==========================================
-- Principe : toute table exige desormais has_access(auth.uid()).
-- Les politiques V1 "anon USING (true)" sont remplacees par des politiques
-- "authenticated USING (has_access(...))" pour toutes les tables.
-- Les nouvelles tables (access_profiles, payment_proofs) ont leurs propres
-- politiques granulaires ci-dessous.

-- Activation RLS sur toutes les tables (idempotent)
ALTER TABLE wallets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_rates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans            ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses         ENABLE ROW LEVEL SECURITY;
ALTER TABLE debts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_proofs   ENABLE ROW LEVEL SECURITY;

-- ---- Tables de tresorerie ------------------------------------------------

-- wallets
DROP POLICY IF EXISTS "Allow full access on wallets" ON wallets;
DROP POLICY IF EXISTS wallets_rw_access ON wallets;
CREATE POLICY wallets_rw_access ON wallets
    FOR ALL TO authenticated
    USING (public.has_access(auth.uid()))
    WITH CHECK (public.has_access(auth.uid()));

-- exchange_rates
DROP POLICY IF EXISTS "Allow full access on exchange_rates" ON exchange_rates;
DROP POLICY IF EXISTS exchange_rates_rw_access ON exchange_rates;
CREATE POLICY exchange_rates_rw_access ON exchange_rates
    FOR ALL TO authenticated
    USING (public.has_access(auth.uid()))
    WITH CHECK (public.has_access(auth.uid()));

-- customers
DROP POLICY IF EXISTS "Allow full access on customers" ON customers;
DROP POLICY IF EXISTS customers_rw_access ON customers;
CREATE POLICY customers_rw_access ON customers
    FOR ALL TO authenticated
    USING (public.has_access(auth.uid()))
    WITH CHECK (public.has_access(auth.uid()));

-- transactions
DROP POLICY IF EXISTS "Allow full access on transactions" ON transactions;
DROP POLICY IF EXISTS tx_rw_access ON transactions;
CREATE POLICY tx_rw_access ON transactions
    FOR ALL TO authenticated
    USING (public.has_access(auth.uid()))
    WITH CHECK (public.has_access(auth.uid()));

-- loans
DROP POLICY IF EXISTS "Allow full access on loans" ON loans;
DROP POLICY IF EXISTS loans_rw_access ON loans;
CREATE POLICY loans_rw_access ON loans
    FOR ALL TO authenticated
    USING (public.has_access(auth.uid()))
    WITH CHECK (public.has_access(auth.uid()));

-- expenses
DROP POLICY IF EXISTS "Allow full access on expenses" ON expenses;
DROP POLICY IF EXISTS expenses_rw_access ON expenses;
CREATE POLICY expenses_rw_access ON expenses
    FOR ALL TO authenticated
    USING (public.has_access(auth.uid()))
    WITH CHECK (public.has_access(auth.uid()));

-- debts
DROP POLICY IF EXISTS "Allow full access on debts" ON debts;
DROP POLICY IF EXISTS debts_rw_access ON debts;
CREATE POLICY debts_rw_access ON debts
    FOR ALL TO authenticated
    USING (public.has_access(auth.uid()))
    WITH CHECK (public.has_access(auth.uid()));

-- message_templates
DROP POLICY IF EXISTS "templates_all_anon" ON message_templates;
DROP POLICY IF EXISTS message_templates_rw_access ON message_templates;
CREATE POLICY message_templates_rw_access ON message_templates
    FOR ALL TO authenticated
    USING (public.has_access(auth.uid()))
    WITH CHECK (public.has_access(auth.uid()));

-- reminder_history
DROP POLICY IF EXISTS "reminders_all_anon" ON reminder_history;
DROP POLICY IF EXISTS reminder_history_rw_access ON reminder_history;
CREATE POLICY reminder_history_rw_access ON reminder_history
    FOR ALL TO authenticated
    USING (public.has_access(auth.uid()))
    WITH CHECK (public.has_access(auth.uid()));

-- ---- access_profiles (politiques granulaires) ----------------------------

-- Un utilisateur lit uniquement son propre profil
DROP POLICY IF EXISTS ap_select_own ON public.access_profiles;
CREATE POLICY ap_select_own ON public.access_profiles
    FOR SELECT USING (auth.uid() = user_id);

-- Un admin lit tous les profils
DROP POLICY IF EXISTS ap_select_admin ON public.access_profiles;
CREATE POLICY ap_select_admin ON public.access_profiles
    FOR SELECT USING (public.is_admin(auth.uid()));

-- Seul un admin peut modifier acces_autorise (pas de politique UPDATE pour 'user')
DROP POLICY IF EXISTS ap_update_admin ON public.access_profiles;
CREATE POLICY ap_update_admin ON public.access_profiles
    FOR UPDATE USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));

-- ---- payment_proofs (politiques granulaires) -----------------------------

-- Un utilisateur cree et lit uniquement ses propres preuves
DROP POLICY IF EXISTS pp_select_own ON public.payment_proofs;
CREATE POLICY pp_select_own ON public.payment_proofs
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS pp_insert_own ON public.payment_proofs;
CREATE POLICY pp_insert_own ON public.payment_proofs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Un admin lit toutes les preuves et met a jour le statut
DROP POLICY IF EXISTS pp_select_admin ON public.payment_proofs;
CREATE POLICY pp_select_admin ON public.payment_proofs
    FOR SELECT USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS pp_update_admin ON public.payment_proofs;
CREATE POLICY pp_update_admin ON public.payment_proofs
    FOR UPDATE USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));
