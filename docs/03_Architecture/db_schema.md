# Schéma de Base de Données Révisé (Supabase PostgreSQL)

L'application fonctionnant exclusivement en ligne, la base de données réside directement sur Supabase. Ce document décrit le schéma relationnel stabilisé pour la V1 avec gestion des brouillons.

---

## 1. Sécurité et RLS (Row Level Security)
Pour cette V1 destinée à un usage privé, les tables utilisent le Row Level Security (RLS) avec des politiques associées au rôle `anon` (ou `public`) pour simplifier l'accès depuis l'application via la clé d'API anonyme, tout en bloquant l'accès externe non authentifié.

---

## 2. Définitions des Tables

### A. Portefeuilles (`wallets`)
Stocke les soldes et informations de chaque compte ou caisse de l'utilisateur.

```sql
CREATE TABLE wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,            -- ex: "Caisse USD Cash", "Airtel RDC"
    currency VARCHAR(3) NOT NULL,          -- USD, UGX, KES, CDF
    type VARCHAR(20) NOT NULL CHECK (type IN ('cash', 'mobile_money')),
    balance DECIMAL(18, 4) DEFAULT 0.0000 NOT NULL, -- Solde actuel du compte
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
```

### B. Taux de Change Quotidiens (`exchange_rates`)
Saisis par l'opérateur chaque jour pour calculer la valeur globale en USD.

```sql
CREATE TABLE exchange_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    currency VARCHAR(3) NOT NULL,          -- UGX, KES, CDF (USD sert de base à 1.0)
    rate_to_usd DECIMAL(18, 8) NOT NULL,   -- ex: 3700.00000000 pour UGX
    date DATE DEFAULT CURRENT_DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT unique_currency_date UNIQUE (currency, date)
);
```

### C. Transactions de Change et Transfert (`transactions`)
Enregistre les opérations d'échange de devises et les transferts de fonds.

```sql
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
    dest_wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
    source_amount DECIMAL(18, 4) NOT NULL CHECK (source_amount > 0),
    dest_amount DECIMAL(18, 4) NOT NULL CHECK (dest_amount > 0),
    exchange_rate DECIMAL(18, 8) NOT NULL, -- dest_amount / source_amount
    fee DECIMAL(18, 4) DEFAULT 0.0000 NOT NULL CHECK (fee >= 0),
    fee_wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL,
    profit_usd DECIMAL(18, 4) NOT NULL,     -- Profit net de la transaction converti en USD
    
    -- Nouveau champ de contrôle de flux --
    status VARCHAR(20) DEFAULT 'completed' NOT NULL CHECK (status IN ('completed', 'draft')),
    
    -- Traçabilité & Preuve anti-litige --
    transaction_id VARCHAR(100),           -- ID unique réseau (Airtel, MTN, etc.)
    receipt_text TEXT,                     -- Contenu texte brut du SMS ou OCR
    image_url VARCHAR(500),                -- Lien vers la capture d'écran stockée sur Supabase Storage
    note TEXT,                             -- Nom du client ou commentaire
    
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
```

### D. Dépenses et Prélèvements (`expenses`)
Dépenses opérationnelles du business et retraits pour usage personnel.

```sql
CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
    amount DECIMAL(18, 4) NOT NULL CHECK (amount > 0),
    is_business BOOLEAN DEFAULT TRUE NOT NULL,          -- TRUE = Business, FALSE = Personnel
    category VARCHAR(50) NOT NULL,         -- Loyer, Nourriture, Transport, Famille, etc.
    note TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
```

---

## 3. Mise à Jour Automatique des Soldes

Pour préserver l'intégrité des données financières, les soldes ne doivent pas être affectés par les transactions au statut `draft` (provenant de WhatsApp ou d'une capture brute non confirmée).

### A. Trigger d'insertion (`on_transaction_inserted`)
La fonction trigger vérifie le statut :
*   Si `NEW.status = 'draft'`, elle retourne immédiatement sans altérer les portefeuilles.
*   Si `NEW.status = 'completed'`, elle déduit `source_amount` et les frais `fee` des portefeuilles correspondants, et ajoute `dest_amount` au portefeuille cible.

### B. Trigger de mise à jour (`on_transaction_updated`)
Si une transaction passe du statut `draft` à `completed` lors de la validation par l'utilisateur :
*   Elle applique les déductions et ajouts correspondants aux soldes des portefeuilles.
*   Cela permet d'automatiser l'enregistrement dès la confirmation visuelle.
