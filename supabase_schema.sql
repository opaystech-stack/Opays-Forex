-- ==========================================
-- SCHEMA DE LA BASE DE DONNEES FOREX LEDGER
-- Version révisée avec gestion des brouillons (draft/completed)
-- ==========================================

-- 1. Table des Portefeuilles (Wallets)
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

-- 2. Table des Taux de Change Quotidiens
CREATE TABLE IF NOT EXISTS exchange_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    currency VARCHAR(3) NOT NULL,
    rate_to_usd DECIMAL(18, 8) NOT NULL,
    date DATE DEFAULT CURRENT_DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT unique_currency_date UNIQUE (currency, date)
);

-- 3. Table des Clients (Customers)
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(30),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 4. Table des Transactions (Ledger) - AVEC STATUS BROUILLON ET TYPE
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Le type peut être 'exchange' (transfert standard), 'deposit' (renforcement), ou 'withdrawal' (prélèvement)
    type VARCHAR(20) DEFAULT 'exchange' NOT NULL CHECK (type IN ('exchange', 'deposit', 'withdrawal')),
    source_wallet_id UUID REFERENCES wallets(id) ON DELETE RESTRICT, -- Optionnel pour les dépôts (reinforcement)
    dest_wallet_id UUID REFERENCES wallets(id) ON DELETE RESTRICT,   -- Optionnel pour les retraits (withdrawal)
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,     -- Client associé (optionnel)
    source_amount DECIMAL(18, 4) NOT NULL CHECK (source_amount > 0),
    dest_amount DECIMAL(18, 4) NOT NULL CHECK (dest_amount > 0),
    exchange_rate DECIMAL(18, 8) NOT NULL,
    fee DECIMAL(18, 4) DEFAULT 0.0000 NOT NULL CHECK (fee >= 0),
    fee_wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL,
    profit_usd DECIMAL(18, 4) NOT NULL,
    -- Statut du brouillon : 'draft' = importé par WhatsApp/OCR, non validé
    --                        'completed' = validé par l'utilisateur, soldes mis à jour
    status VARCHAR(20) DEFAULT 'completed' NOT NULL CHECK (status IN ('draft', 'completed')),
    transaction_id VARCHAR(100), -- ID unique réseau (Airtel, MTN, M-Pesa, etc.)
    receipt_text TEXT,
    image_url VARCHAR(500),
    note TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 5. Table des Prêts (Loans)
CREATE TABLE IF NOT EXISTS loans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
    wallet_id UUID REFERENCES wallets(id) ON DELETE RESTRICT NOT NULL, -- Portefeuille débité
    amount DECIMAL(18, 4) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL,
    interest_rate DECIMAL(5, 2) DEFAULT 0.00 NOT NULL CHECK (interest_rate >= 0),
    due_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'paid', 'overdue')),
    note TEXT,
    contract_image_url VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 6. Table des Dépenses (Expenses)
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

-- ==========================================
-- TRIGGERS DE MISE A JOUR AUTOMATIQUE DES SOLDES
-- ==========================================

-- A. Trigger pour les Transactions (INSERT) 
-- Ne modifie les soldes QUE si le statut est 'completed'
CREATE OR REPLACE FUNCTION process_transaction_balance_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Ne rien faire si la transaction est un brouillon
    IF NEW.status = 'draft' THEN
        RETURN NEW;
    END IF;

    -- Soustraire du portefeuille source (si défini)
    IF NEW.source_wallet_id IS NOT NULL THEN
        UPDATE wallets 
        SET balance = balance - NEW.source_amount,
            updated_at = NOW()
        WHERE id = NEW.source_wallet_id;
    END IF;

    -- Ajouter au portefeuille destination (si défini)
    IF NEW.dest_wallet_id IS NOT NULL THEN
        UPDATE wallets 
        SET balance = balance + NEW.dest_amount,
            updated_at = NOW()
        WHERE id = NEW.dest_wallet_id;
    END IF;

    -- Soustraire les frais s'ils sont renseignés et liés à un portefeuille
    IF NEW.fee > 0 AND NEW.fee_wallet_id IS NOT NULL THEN
        UPDATE wallets 
        SET balance = balance - NEW.fee,
            updated_at = NOW()
        WHERE id = NEW.fee_wallet_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER on_transaction_inserted
    AFTER INSERT ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION process_transaction_balance_change();

-- B. Trigger pour les Transactions (UPDATE) 
-- Applique les changements de solde quand un brouillon passe de 'draft' à 'completed'
CREATE OR REPLACE FUNCTION process_transaction_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Appliquer les soldes uniquement quand le statut passe de 'draft' à 'completed'
    IF OLD.status = 'draft' AND NEW.status = 'completed' THEN
        -- Soustraire du portefeuille source (si défini)
        IF NEW.source_wallet_id IS NOT NULL THEN
            UPDATE wallets 
            SET balance = balance - NEW.source_amount,
                updated_at = NOW()
            WHERE id = NEW.source_wallet_id;
        END IF;

        -- Ajouter au portefeuille destination (si défini)
        IF NEW.dest_wallet_id IS NOT NULL THEN
            UPDATE wallets 
            SET balance = balance + NEW.dest_amount,
                updated_at = NOW()
            WHERE id = NEW.dest_wallet_id;
        END IF;

        -- Soustraire les frais
        IF NEW.fee > 0 AND NEW.fee_wallet_id IS NOT NULL THEN
            UPDATE wallets 
            SET balance = balance - NEW.fee,
                updated_at = NOW()
            WHERE id = NEW.fee_wallet_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER on_transaction_updated
    AFTER UPDATE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION process_transaction_status_change();

-- C. Trigger pour les Dépenses
CREATE OR REPLACE FUNCTION process_expense_balance_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Soustraire du portefeuille concerné
    UPDATE wallets 
    SET balance = balance - NEW.amount,
        updated_at = NOW()
    WHERE id = NEW.wallet_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER on_expense_inserted
    AFTER INSERT ON expenses
    FOR EACH ROW
    EXECUTE FUNCTION process_expense_balance_change();

-- D. Trigger pour les Prêts (Loans)
-- Débite le portefeuille au début, puis le recrédite du montant + intérêts lors du remboursement ('paid')
CREATE OR REPLACE FUNCTION process_loan_balance_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Si c'est un nouveau prêt
    IF TG_OP = 'INSERT' THEN
        UPDATE wallets 
        SET balance = balance - NEW.amount,
            updated_at = NOW()
        WHERE id = NEW.wallet_id;
    END IF;

    -- Si le prêt est mis à jour (remboursement)
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

CREATE OR REPLACE TRIGGER on_loan_inserted_or_updated
    AFTER INSERT OR UPDATE ON loans
    FOR EACH ROW
    EXECUTE FUNCTION process_loan_balance_change();

-- ==========================================
-- SÉCURITÉ : ROW LEVEL SECURITY (RLS)
-- ==========================================
-- Pour la V1 privée, on autorise l'accès complet via la clé anon
-- (l'app est privée, sécurisée par la clé secrète dans le .env)

ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow full access on wallets" ON wallets;
CREATE POLICY "Allow full access on wallets" ON wallets FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full access on exchange_rates" ON exchange_rates;
CREATE POLICY "Allow full access on exchange_rates" ON exchange_rates FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full access on customers" ON customers;
CREATE POLICY "Allow full access on customers" ON customers FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full access on transactions" ON transactions;
CREATE POLICY "Allow full access on transactions" ON transactions FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full access on loans" ON loans;
CREATE POLICY "Allow full access on loans" ON loans FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full access on expenses" ON expenses;
CREATE POLICY "Allow full access on expenses" ON expenses FOR ALL TO anon USING (true) WITH CHECK (true);

-- ==========================================
-- 7. Table des Dettes & Créances (Registre des dettes)
-- Grand livre déclaratif distinct des prêts (loans) : aucun trigger de solde.
--   type = 'receivable'  -> Ce qu'on te doit (créance)
--   type = 'payable'     -> Ce que tu dois (dette)
-- ==========================================
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

ALTER TABLE debts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow full access on debts" ON debts;
CREATE POLICY "Allow full access on debts" ON debts FOR ALL TO anon USING (true) WITH CHECK (true);

-- ==========================================
-- 8. Relances clients WhatsApp (Modeles de message & Historique des relances)
-- Modele_Message : gabarits reutilisables avec marqueurs {{variable}}
-- Historique_Relance : journal des relances sortantes rattachees au client
-- ==========================================

-- A. Modeles de message reutilisables (Modele_Message)
CREATE TABLE IF NOT EXISTS message_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(120) NOT NULL,
    lang VARCHAR(2) NOT NULL DEFAULT 'fr' CHECK (lang IN ('fr', 'en')),
    scenario VARCHAR(20) NOT NULL DEFAULT 'personalized'
        CHECK (scenario IN ('recovery', 'announcement', 'personalized', 'custom')),
    body TEXT NOT NULL,                       -- contient des marqueurs {{variable}}
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- B. Historique des relances par client (Historique_Relance)
CREATE TABLE IF NOT EXISTS reminder_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    loan_id UUID REFERENCES loans(id) ON DELETE SET NULL,           -- rattachement recouvrement
    template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL,
    scenario VARCHAR(20) NOT NULL
        CHECK (scenario IN ('recovery', 'announcement', 'personalized', 'custom')),
    content TEXT NOT NULL,                    -- message effectivement envoye
    trigger_source VARCHAR(10) NOT NULL DEFAULT 'manual'
        CHECK (trigger_source IN ('manual', 'voice')),
    status VARCHAR(10) NOT NULL DEFAULT 'sent'
        CHECK (status IN ('sent', 'failed', 'queued')),
    provider_message_id VARCHAR(120),         -- identifiant OpenWA si succes
    error_reason TEXT,                         -- cause si echec
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reminder_history_customer ON reminder_history(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_templates_lang ON message_templates(lang, scenario);
-- ------------------------------------------
-- RLS : politiques coherentes avec les tables existantes (customers/loans/debts)
-- Pour la V1 privee (mono-operateur), on autorise l'acces complet via la cle anon,
-- a l'identique des autres tables de l'application.
-- ------------------------------------------

ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_history  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "templates_all_anon" ON message_templates;
CREATE POLICY "templates_all_anon" ON message_templates FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "reminders_all_anon" ON reminder_history;
CREATE POLICY "reminders_all_anon" ON reminder_history FOR ALL TO anon USING (true) WITH CHECK (true);

-- Note de securite (chemin d'evolution multi-utilisateurs) :
-- Ces politiques reproduisent le modele V1 mono-operateur (acces complet via la cle anon).
-- Si une isolation multi-utilisateurs devient necessaire, ajouter une colonne
-- owner_id UUID sur message_templates et reminder_history (ainsi que sur les tables
-- existantes), puis remplacer ces politiques par des regles d'isolation
-- du type : USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id).
-- Cette evolution doit etre appliquee globalement et de maniere coherente sur
-- l'ensemble des tables de l'application.
