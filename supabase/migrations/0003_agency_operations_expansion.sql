-- ==========================================
-- MIGRATION 0003 : AGENCY OPERATIONS EXPANSION (fondations multi-tenant)
-- ==========================================
-- Cette migration ETEND la migration 0001 (controle d'acces payant) sans la
-- rompre : principe « etendre, ne pas dupliquer ». Toutes les instructions
-- sont idempotentes (IF NOT EXISTS / OR REPLACE / ADD COLUMN IF NOT EXISTS)
-- et peuvent etre rejouees sans erreur.
--
-- Perimetre de la tache 1.1 — tables plateforme et multi-tenant :
--   A. plans (Plan_Tarifaire — anticipation structurelle)
--   B. agencies (Agence : owner_id 1-N anticipe, state, plan_id)
--   C. points_of_sale + registers (Point_De_Vente / Caisse — anticipation 1-N)
--   D. whatsapp_numbers (Numero_WhatsApp_Agence — anticipation 1-N)
--   E. access_profiles.is_platform_editor (Editeur_Plateforme — Q6)
--   F. agency_members (Comptes_Employes : role, etat, permissions)
--   G. agency_invitations (Invitations : role, etat) + index unique partiel
--
-- Les tables de modules, catalogues, services additionnels, WhatsApp et agents,
-- le backfill agency_id, les fonctions SECURITY DEFINER, la RLS de
-- cloisonnement, le bucket et le cron sont traites dans les taches 1.2 a 1.5.
-- ==========================================


-- ==========================================
-- A. PLANS TARIFAIRES (anticipation structurelle — Req 5.7)
-- ==========================================
-- Un Plan_Tarifaire par defaut unique est applique dans cette version ; la
-- gestion de formules multiples est anticipee par la table dediee.
CREATE TABLE IF NOT EXISTS public.plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(60) NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);


-- ==========================================
-- B. AGENCES (Req 3.1, 3.2)
-- ==========================================
-- owner_id : cle etrangere autorisant structurellement une relation 1-N entre
-- Proprietaire_Agence et Agence (Req 3.1), le comportement V1 restant limite a
-- une seule Agence active par proprietaire.
-- state : Etat_Agence appartenant a l'ensemble ferme { active, suspendue }.
-- plan_id : rattachement a un Plan_Tarifaire (Req 5.7).
CREATE TABLE IF NOT EXISTS public.agencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    state VARCHAR(10) NOT NULL DEFAULT 'active'
        CHECK (state IN ('active', 'suspendue')),
    plan_id UUID REFERENCES public.plans(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX IF NOT EXISTS idx_agencies_owner ON public.agencies(owner_id);


-- ==========================================
-- C. POINTS DE VENTE ET CAISSES (anticipation — Req 3.3, 3.4)
-- ==========================================
-- FK agency_id -> points_of_sale -> registers, autorisant structurellement une
-- relation 1-N Agence->Point_De_Vente et Point_De_Vente->Caisse. La V1 utilise
-- un Point_De_Vente et une Caisse par defaut implicites uniques.
CREATE TABLE IF NOT EXISTS public.points_of_sale (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL DEFAULT 'Point de vente par defaut',
    is_default BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX IF NOT EXISTS idx_points_of_sale_agency ON public.points_of_sale(agency_id);

CREATE TABLE IF NOT EXISTS public.registers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pos_id UUID NOT NULL REFERENCES public.points_of_sale(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL DEFAULT 'Caisse par defaut',
    is_default BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX IF NOT EXISTS idx_registers_pos ON public.registers(pos_id);


-- ==========================================
-- D. NUMEROS WHATSAPP DE L'AGENCE (anticipation — Req 3.5, 13.6)
-- ==========================================
-- FK agency_id autorisant structurellement plusieurs Numero_WhatsApp_Agence par
-- Agence ; un numero par defaut unique est utilise dans cette version.
CREATE TABLE IF NOT EXISTS public.whatsapp_numbers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
    phone VARCHAR(30) NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_numbers_agency ON public.whatsapp_numbers(agency_id);


-- ==========================================
-- E. SUPER-ADMINISTRATION PLATEFORME (Editeur_Plateforme — Q6, Req 4/5)
-- ==========================================
-- Indicateur dedie ajoute a access_profiles (migration 0001), distinct des
-- roles d'agence. L'ajout est NON destructif : les colonnes existantes
-- (acces_autorise, role user/admin, ...) sont preservees (Req 18.2).
ALTER TABLE public.access_profiles
    ADD COLUMN IF NOT EXISTS is_platform_editor BOOLEAN NOT NULL DEFAULT FALSE;


-- ==========================================
-- F. MEMBRES, ROLES ET PERMISSIONS (Req 1, 2)
-- ==========================================
-- Comptes_Employes rattaches a une agence.
-- role : ensemble ferme des roles par defaut (Req 2.1).
-- activation_state : etat d'activation { actif, désactivé } (Req 1.9).
-- permission_grants / permission_denies : octrois et retraits individuels,
-- le retrait l'emportant sur tout octroi (deny-overrides, Req 2.5/2.6).
CREATE TABLE IF NOT EXISTS public.agency_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL
        CHECK (role IN ('proprietaire', 'gerant', 'caissier', 'observateur')),
    activation_state VARCHAR(10) NOT NULL DEFAULT 'actif'
        CHECK (activation_state IN ('actif', 'désactivé')),
    permission_grants TEXT[] NOT NULL DEFAULT '{}',
    permission_denies TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    UNIQUE (agency_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_agency_members_agency ON public.agency_members(agency_id);
CREATE INDEX IF NOT EXISTS idx_agency_members_user ON public.agency_members(user_id);


-- ==========================================
-- G. INVITATIONS DE COLLABORATEURS (Req 1.2, 1.3, 1.6, 1.7)
-- ==========================================
-- email : adresse d'invitation (<= 254 caracteres, Req 1.4).
-- state : ensemble ferme { en_attente, acceptée, expirée } (Req 1.10).
-- L'expiration (acceptation > 168 h apres creation, Req 1.7) est appliquee par
-- la logique applicative ; accepted_at conserve l'horodatage d'acceptation.
CREATE TABLE IF NOT EXISTS public.agency_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
    email VARCHAR(254) NOT NULL,
    role VARCHAR(20) NOT NULL
        CHECK (role IN ('proprietaire', 'gerant', 'caissier', 'observateur')),
    permission_grants TEXT[] NOT NULL DEFAULT '{}',
    permission_denies TEXT[] NOT NULL DEFAULT '{}',
    state VARCHAR(10) NOT NULL DEFAULT 'en_attente'
        CHECK (state IN ('en_attente', 'acceptée', 'expirée')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    accepted_at TIMESTAMPTZ
);

-- Unicite d'une invitation en attente par (agence, e-mail insensible a la
-- casse) : empeche deux Invitations_Collaborateur 'en_attente' pour la meme
-- adresse au sein d'une agence (Req 1.6).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_invite_email
    ON public.agency_invitations(agency_id, lower(email))
    WHERE state = 'en_attente';

CREATE INDEX IF NOT EXISTS idx_agency_invitations_agency ON public.agency_invitations(agency_id);


-- ==========================================
-- TACHE 1.2 — MODULES, CATALOGUES, SERVICES ADDITIONNELS, WHATSAPP, AGENTS
-- ==========================================
-- Perimetre de la tache 1.2 (suite de la tache 1.1, meme migration) :
--   H. module_entitlements (Droit_Module accorde au niveau plateforme)
--   I. module_states (etat d'activation des Modules_Fonctionnels par agence)
--   J. transfer_methods (Catalogue_Methodes_Transfert)
--   K. subscription_providers (Catalogue_Fournisseurs_Abonnement)
--   L. transfers (operations de transfert d'argent)
--   M. subscriptions (abonnements TV)
--   N. flight_bookings (reservations de billets d'avion)
--   O. order_links + remote_orders (commande a distance)
--   P. whatsapp_messages (Historique_Messages_WhatsApp partage)
--   Q. ai_agents (Registre_Agents — 6 types)
--   R. critical_action_log (journal des confirmations d'Action_Critique)
--   S. Donnees de reference (Autre permanent, fournisseurs, agents, plan)
--
-- Toutes les instructions restent idempotentes (IF NOT EXISTS / ON CONFLICT /
-- WHERE NOT EXISTS) et referencent correctement les tables creees en 1.1
-- (agencies, whatsapp_numbers, plans) ainsi que customers (migration 0001).
-- ==========================================


-- ==========================================
-- H. DROITS DE MODULE (Droit_Module — Req 4)
-- ==========================================
-- Habilitation accordee au niveau plateforme par l'Editeur_Plateforme. En
-- l'absence d'enregistrement, un Module_Additionnel est considere non habilite
-- et desactive (Req 4.3). module_key appartient a l'ensemble ferme des
-- Modules_Additionnels (Req 4.1).
CREATE TABLE IF NOT EXISTS public.module_entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
    module_key VARCHAR(30) NOT NULL
        CHECK (module_key IN ('transfert_argent', 'abonnements', 'billets_avion')),
    granted BOOLEAN NOT NULL DEFAULT FALSE,
    granted_by UUID REFERENCES auth.users(id),
    granted_at TIMESTAMPTZ,
    UNIQUE (agency_id, module_key)
);

CREATE INDEX IF NOT EXISTS idx_module_entitlements_agency ON public.module_entitlements(agency_id);


-- ==========================================
-- I. ETAT D'ACTIVATION DES MODULES (Module_Fonctionnel — Req 6.6, 6.8)
-- ==========================================
-- Etat d'activation par agence des Modules_Fonctionnels (base, optionnels,
-- additionnels). L'absence de ligne vaut etat par defaut applique par la
-- logique pure (Modules_Base actives, additionnels desactives — Req 6.8).
CREATE TABLE IF NOT EXISTS public.module_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
    module_key VARCHAR(30) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (agency_id, module_key)
);

CREATE INDEX IF NOT EXISTS idx_module_states_agency ON public.module_states(agency_id);


-- ==========================================
-- J. CATALOGUE DES METHODES DE TRANSFERT (Req 9)
-- ==========================================
-- agency_id NULL = entree de niveau plateforme (administree par
-- l'Editeur_Plateforme) ; un agency_id renseigne anticipe un ajout propre a une
-- Agence (Req 9.x, hors comportement V1). label : 1..60 caracteres (Req 9.5).
-- is_permanent : TRUE pour 'Autre', option permanente non supprimable (Req 9.7).
CREATE TABLE IF NOT EXISTS public.transfer_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID REFERENCES public.agencies(id) ON DELETE CASCADE,
    label VARCHAR(60) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_permanent BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX IF NOT EXISTS idx_transfer_methods_agency ON public.transfer_methods(agency_id);


-- ==========================================
-- K. CATALOGUE DES FOURNISSEURS D'ABONNEMENT (Req 11)
-- ==========================================
-- agency_id NULL = entree de niveau plateforme ; agency_id renseigne anticipe
-- un ajout propre a une Agence (Req 11.3, hors comportement V1).
CREATE TABLE IF NOT EXISTS public.subscription_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID REFERENCES public.agencies(id) ON DELETE CASCADE,
    label VARCHAR(60) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX IF NOT EXISTS idx_subscription_providers_agency ON public.subscription_providers(agency_id);


-- ==========================================
-- L. TRANSFERTS D'ARGENT (Service_Additionnel — Req 8)
-- ==========================================
-- agency_id : cle de cloisonnement (Req 3.2). method_id reference le catalogue ;
-- ON DELETE RESTRICT preserve l'integrite de l'historique. custom_method_label
-- est requis cote applicatif lorsque la methode 'Autre' est choisie (Req 8.3).
-- commission est comptee en benefice de l'agence (Req 8.6).
CREATE TABLE IF NOT EXISTS public.transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    method_id UUID REFERENCES public.transfer_methods(id) ON DELETE RESTRICT,
    custom_method_label VARCHAR(60),
    amount DECIMAL(18,4) NOT NULL CHECK (amount > 0),
    commission DECIMAL(18,4) NOT NULL DEFAULT 0 CHECK (commission >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX IF NOT EXISTS idx_transfers_agency ON public.transfers(agency_id, created_at DESC);


-- ==========================================
-- M. ABONNEMENTS TV (Service_Additionnel — Req 10)
-- ==========================================
-- provider_id reference le Catalogue_Fournisseurs_Abonnement (ON DELETE
-- RESTRICT). renewal_threshold_days : Seuil_Relance_Abonnement, 1..30, defaut 3
-- (Req 10.5). marketing_consent conditionne les campagnes (Req 10.7).
-- reminder_history : Historique_Rappels horodate (Req 10.8).
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES public.subscription_providers(id) ON DELETE RESTRICT,
    plan VARCHAR(120) NOT NULL,
    amount_paid DECIMAL(18,4) NOT NULL CHECK (amount_paid > 0),
    commission DECIMAL(18,4) NOT NULL DEFAULT 0 CHECK (commission >= 0),
    renewal_date DATE NOT NULL,
    renewal_threshold_days INT NOT NULL DEFAULT 3
        CHECK (renewal_threshold_days BETWEEN 1 AND 30),
    marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
    reminder_history JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX IF NOT EXISTS idx_subs_agency_renew ON public.subscriptions(agency_id, renewal_date);


-- ==========================================
-- N. RESERVATIONS DE BILLETS D'AVION (Reservation_Billet — Req 12)
-- ==========================================
-- ticket_number non vide (Req 12.4). profit = customer_price - agency_price
-- (Req 12.3), calcule cote applicatif. flight_lead_time_hours : Delai_Rappel_Vol,
-- 1..168, defaut 48 (Req 12.6). reminder_history : Historique_Rappels (Req 12.8).
CREATE TABLE IF NOT EXISTS public.flight_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
    customer_name VARCHAR(120) NOT NULL,
    ticket_number VARCHAR(60) NOT NULL,
    airline VARCHAR(120),
    departure_airport VARCHAR(120),
    arrival_airport VARCHAR(120),
    destination VARCHAR(120),
    flight_at TIMESTAMPTZ NOT NULL,
    agency_price DECIMAL(18,4) NOT NULL CHECK (agency_price >= 0),
    customer_price DECIMAL(18,4) NOT NULL CHECK (customer_price >= 0),
    profit DECIMAL(18,4) NOT NULL,
    customer_whatsapp VARCHAR(30),
    flight_lead_time_hours INT NOT NULL DEFAULT 48
        CHECK (flight_lead_time_hours BETWEEN 1 AND 168),
    status VARCHAR(20) NOT NULL DEFAULT 'reservé',
    reminder_history JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX IF NOT EXISTS idx_flights_agency_at ON public.flight_bookings(agency_id, flight_at);


-- ==========================================
-- O. COMMANDE A DISTANCE (Lien_Commande + Commande_Distante — Req 14)
-- ==========================================
-- order_links.token : jeton non devinable d'au moins 128 bits (Req 14.2),
-- unique. revoked / expires_at conditionnent la validite du lien (Req 14.5).
CREATE TABLE IF NOT EXISTS public.order_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX IF NOT EXISTS idx_order_links_agency ON public.order_links(agency_id);

-- proof_path : reference vers le bucket prive 'order-proofs' (Req 14.4).
-- state : ensemble ferme { à_traiter, confirmée, rejetée } ; toute Commande
-- exige une Confirmation humaine avant enregistrement definitif (Req 14.7).
CREATE TABLE IF NOT EXISTS public.remote_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
    order_link_id UUID REFERENCES public.order_links(id) ON DELETE SET NULL,
    customer_name VARCHAR(120),
    customer_phone VARCHAR(30),
    details TEXT,
    proof_path TEXT,
    state VARCHAR(12) NOT NULL DEFAULT 'à_traiter'
        CHECK (state IN ('à_traiter', 'confirmée', 'rejetée')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX IF NOT EXISTS idx_remote_orders_agency ON public.remote_orders(agency_id, created_at DESC);


-- ==========================================
-- P. JOURNAL WHATSAPP PARTAGE (Historique_Messages_WhatsApp — Req 13.2)
-- ==========================================
-- Journal unique consignant chaque message WhatsApp sortant, quelle que soit la
-- fonctionnalite emettrice (Service_Envoi unique). feature_source identifie la
-- source (Req 13.2) ; whatsapp_number_id designe le Numero_WhatsApp_Agence
-- emetteur (Req 13.6).
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
    whatsapp_number_id UUID REFERENCES public.whatsapp_numbers(id) ON DELETE SET NULL,
    feature_source VARCHAR(24) NOT NULL
        CHECK (feature_source IN ('publication', 'remote_order', 'subscription_reminder', 'flight_reminder', 'marketing')),
    recipient VARCHAR(30) NOT NULL,
    content TEXT NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'sent'
        CHECK (status IN ('sent', 'failed', 'queued')),
    provider_message_id VARCHAR(120),
    error_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX IF NOT EXISTS idx_wamsg_agency_ts ON public.whatsapp_messages(agency_id, created_at DESC);


-- ==========================================
-- Q. REGISTRE D'AGENTS IA (Registre_Agents — Req 15)
-- ==========================================
-- agent_type appartient a l'ensemble ferme des 6 types anticipes (Req 15.1),
-- unique. Toute Action_Critique reste soumise a validation humaine (Req 15.3),
-- imposee par la logique applicative et journalisee dans critical_action_log.
CREATE TABLE IF NOT EXISTS public.ai_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_type VARCHAR(24) NOT NULL UNIQUE
        CHECK (agent_type IN ('forex', 'comptabilite', 'service_client', 'whatsapp', 'analyse_financiere', 'marketing')),
    is_enabled BOOLEAN NOT NULL DEFAULT FALSE
);


-- ==========================================
-- R. JOURNAL DES CONFIRMATIONS D'ACTION_CRITIQUE (Req 15.5)
-- ==========================================
-- Consigne chaque Confirmation humaine prealable a l'execution d'une
-- Action_Critique proposee par un Agent_IA ou l'Agent_Vocal.
CREATE TABLE IF NOT EXISTS public.critical_action_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
    agent_type VARCHAR(24),
    action_kind VARCHAR(40) NOT NULL,
    confirmed_by UUID NOT NULL REFERENCES auth.users(id),
    confirmed_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX IF NOT EXISTS idx_critical_action_log_agency ON public.critical_action_log(agency_id, confirmed_at DESC);


-- ==========================================
-- S. DONNEES DE REFERENCE (initialisation idempotente)
-- ==========================================

-- S.1 Plan_Tarifaire par defaut unique (Req 5.7, Q8).
-- Aucune contrainte d'unicite sur plans : l'insertion est conditionnee par
-- l'absence d'un plan deja marque is_default (idempotence).
INSERT INTO public.plans (name, is_default)
SELECT 'Plan par defaut', TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.plans WHERE is_default = TRUE);

-- S.2 'Autre' : Methode_Transfert permanente de niveau plateforme (Req 9.1, 9.7).
-- agency_id NULL = entree plateforme ; conditionnee par l'absence d'une entree
-- 'Autre' plateforme existante.
INSERT INTO public.transfer_methods (agency_id, label, is_active, is_permanent)
SELECT NULL, 'Autre', TRUE, TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM public.transfer_methods
    WHERE agency_id IS NULL AND label = 'Autre'
);

-- S.3 Fournisseurs d'abonnement par defaut de niveau plateforme (Req 11.1).
-- Chaque insertion est conditionnee par l'absence du libelle correspondant.
INSERT INTO public.subscription_providers (agency_id, label, is_active)
SELECT NULL, v.label, TRUE
FROM (VALUES ('Canal+'), ('Access'), ('Évasion'), ('DStv')) AS v(label)
WHERE NOT EXISTS (
    SELECT 1 FROM public.subscription_providers sp
    WHERE sp.agency_id IS NULL AND sp.label = v.label
);

-- S.4 Registre_Agents : les 6 types anticipes (Req 15.1, 15.2).
-- agent_type est UNIQUE : ON CONFLICT DO NOTHING garantit l'idempotence.
INSERT INTO public.ai_agents (agent_type, is_enabled)
VALUES
    ('forex', FALSE),
    ('comptabilite', FALSE),
    ('service_client', FALSE),
    ('whatsapp', FALSE),
    ('analyse_financiere', FALSE),
    ('marketing', FALSE)
ON CONFLICT (agent_type) DO NOTHING;


-- ==========================================
-- TACHE 1.3 — AGENCY_ID SUR LES TABLES EXISTANTES + BACKFILL DE MIGRATION
-- ==========================================
-- Perimetre de la tache 1.3 (suite des taches 1.1/1.2, meme migration) :
--   T. Creation d'une Agence par defaut par Proprietaire_Agence (admin) existant
--   U. Ajout de agency_id NULLABLE aux tables de tresorerie existantes (0001)
--   V. Backfill : rattachement des donnees existantes a l'Agence par defaut
--   W. Pose de la contrainte NOT NULL apres backfill (cle de cloisonnement)
--
-- Tables concernees (toutes creees en migration 0001) :
--   transactions, customers, expenses, loans, debts, reminder_history,
--   message_templates.
--
-- Strategie de rattachement (Req 18.6) : la V1 est mono-operateur (un seul
-- Proprietaire_Agence actif). Les tables de tresorerie de la migration 0001 ne
-- portent aucune colonne de proprietaire ; l'ensemble des donnees existantes
-- est donc rattache a une unique Agence par defaut (celle du plus ancien
-- Proprietaire_Agence / admin). agency_id est ajoute NULLABLE, backfille, puis
-- contraint NOT NULL — garantissant zero perte d'acces (Req 18.6).
--
-- Toutes les instructions restent idempotentes : ADD COLUMN IF NOT EXISTS,
-- INSERT guarde par WHERE NOT EXISTS, UPDATE guarde par WHERE agency_id IS NULL,
-- et SET NOT NULL applique seulement en l'absence de valeur NULL residuelle.
-- ==========================================


-- ==========================================
-- T. AGENCE PAR DEFAUT PAR PROPRIETAIRE_AGENCE (admin) EXISTANT (Req 3.1, 18.6)
-- ==========================================
-- Le role 'admin' de access_profiles correspond au Proprietaire_Agence (Q2).
-- Une Agence par defaut 'active' est creee pour chaque admin n'en possedant pas
-- encore, rattachee via agencies.owner_id et au Plan_Tarifaire par defaut.
INSERT INTO public.agencies (owner_id, name, state, plan_id)
SELECT ap.user_id,
       'Agence par defaut',
       'active',
       (SELECT id FROM public.plans WHERE is_default = TRUE LIMIT 1)
FROM public.access_profiles ap
WHERE ap.role = 'admin'
  AND NOT EXISTS (
      SELECT 1 FROM public.agencies a WHERE a.owner_id = ap.user_id
  );


-- ==========================================
-- U. AJOUT DE agency_id NULLABLE (cle de cloisonnement — Req 3.2)
-- ==========================================
-- Ajout non destructif : la colonne est d'abord NULLABLE pour permettre le
-- backfill sans rejet des lignes existantes. La contrainte NOT NULL est posee
-- en section W, apres rattachement.
ALTER TABLE public.transactions      ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES public.agencies(id) ON DELETE CASCADE;
ALTER TABLE public.customers         ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES public.agencies(id) ON DELETE CASCADE;
ALTER TABLE public.expenses          ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES public.agencies(id) ON DELETE CASCADE;
ALTER TABLE public.loans             ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES public.agencies(id) ON DELETE CASCADE;
ALTER TABLE public.debts             ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES public.agencies(id) ON DELETE CASCADE;
ALTER TABLE public.reminder_history  ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES public.agencies(id) ON DELETE CASCADE;
ALTER TABLE public.message_templates ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES public.agencies(id) ON DELETE CASCADE;


-- ==========================================
-- V. BACKFILL : RATTACHEMENT DES DONNEES EXISTANTES (Req 18.6)
-- ==========================================
-- Toutes les lignes orphelines (agency_id IS NULL) sont rattachees a l'unique
-- Agence par defaut : celle du plus ancien Proprietaire_Agence (admin), choisie
-- de maniere deterministe (ORDER BY created_at, id). Le guard EXISTS evite tout
-- ecrasement par NULL lorsqu'aucune Agence par defaut n'existe (base sans admin).
--
-- L'Agence par defaut de reference est :
--   SELECT a.id FROM public.agencies a
--     JOIN public.access_profiles ap ON ap.user_id = a.owner_id
--    WHERE ap.role = 'admin'
--    ORDER BY a.created_at ASC, a.id ASC
--    LIMIT 1

UPDATE public.transactions
SET agency_id = (
    SELECT a.id FROM public.agencies a
    JOIN public.access_profiles ap ON ap.user_id = a.owner_id
    WHERE ap.role = 'admin'
    ORDER BY a.created_at ASC, a.id ASC
    LIMIT 1
)
WHERE agency_id IS NULL
  AND EXISTS (
      SELECT 1 FROM public.agencies a2
      JOIN public.access_profiles ap2 ON ap2.user_id = a2.owner_id
      WHERE ap2.role = 'admin'
  );

UPDATE public.customers
SET agency_id = (
    SELECT a.id FROM public.agencies a
    JOIN public.access_profiles ap ON ap.user_id = a.owner_id
    WHERE ap.role = 'admin'
    ORDER BY a.created_at ASC, a.id ASC
    LIMIT 1
)
WHERE agency_id IS NULL
  AND EXISTS (
      SELECT 1 FROM public.agencies a2
      JOIN public.access_profiles ap2 ON ap2.user_id = a2.owner_id
      WHERE ap2.role = 'admin'
  );

UPDATE public.expenses
SET agency_id = (
    SELECT a.id FROM public.agencies a
    JOIN public.access_profiles ap ON ap.user_id = a.owner_id
    WHERE ap.role = 'admin'
    ORDER BY a.created_at ASC, a.id ASC
    LIMIT 1
)
WHERE agency_id IS NULL
  AND EXISTS (
      SELECT 1 FROM public.agencies a2
      JOIN public.access_profiles ap2 ON ap2.user_id = a2.owner_id
      WHERE ap2.role = 'admin'
  );

UPDATE public.loans
SET agency_id = (
    SELECT a.id FROM public.agencies a
    JOIN public.access_profiles ap ON ap.user_id = a.owner_id
    WHERE ap.role = 'admin'
    ORDER BY a.created_at ASC, a.id ASC
    LIMIT 1
)
WHERE agency_id IS NULL
  AND EXISTS (
      SELECT 1 FROM public.agencies a2
      JOIN public.access_profiles ap2 ON ap2.user_id = a2.owner_id
      WHERE ap2.role = 'admin'
  );

UPDATE public.debts
SET agency_id = (
    SELECT a.id FROM public.agencies a
    JOIN public.access_profiles ap ON ap.user_id = a.owner_id
    WHERE ap.role = 'admin'
    ORDER BY a.created_at ASC, a.id ASC
    LIMIT 1
)
WHERE agency_id IS NULL
  AND EXISTS (
      SELECT 1 FROM public.agencies a2
      JOIN public.access_profiles ap2 ON ap2.user_id = a2.owner_id
      WHERE ap2.role = 'admin'
  );

UPDATE public.reminder_history
SET agency_id = (
    SELECT a.id FROM public.agencies a
    JOIN public.access_profiles ap ON ap.user_id = a.owner_id
    WHERE ap.role = 'admin'
    ORDER BY a.created_at ASC, a.id ASC
    LIMIT 1
)
WHERE agency_id IS NULL
  AND EXISTS (
      SELECT 1 FROM public.agencies a2
      JOIN public.access_profiles ap2 ON ap2.user_id = a2.owner_id
      WHERE ap2.role = 'admin'
  );

UPDATE public.message_templates
SET agency_id = (
    SELECT a.id FROM public.agencies a
    JOIN public.access_profiles ap ON ap.user_id = a.owner_id
    WHERE ap.role = 'admin'
    ORDER BY a.created_at ASC, a.id ASC
    LIMIT 1
)
WHERE agency_id IS NULL
  AND EXISTS (
      SELECT 1 FROM public.agencies a2
      JOIN public.access_profiles ap2 ON ap2.user_id = a2.owner_id
      WHERE ap2.role = 'admin'
  );


-- ==========================================
-- W. POSE DE LA CONTRAINTE NOT NULL APRES BACKFILL (Req 3.2, 18.6)
-- ==========================================
-- La contrainte NOT NULL n'est posee que si aucune valeur NULL ne subsiste
-- (base vierge : 0 ligne, donc applicable ; base existante : applicable apres
-- backfill complet). Ce garde evite l'echec de la migration sur une base
-- comportant des donnees orphelines en l'absence d'Agence par defaut ; la
-- migration peut etre rejouee une fois les donnees rattachees. SET NOT NULL sur
-- une colonne deja contrainte est un no-op (idempotence).
DO $$
DECLARE
    t TEXT;
    tables TEXT[] := ARRAY[
        'transactions', 'customers', 'expenses', 'loans',
        'debts', 'reminder_history', 'message_templates'
    ];
    null_count BIGINT;
BEGIN
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format(
            'SELECT count(*) FROM public.%I WHERE agency_id IS NULL', t
        ) INTO null_count;

        IF null_count = 0 THEN
            EXECUTE format(
                'ALTER TABLE public.%I ALTER COLUMN agency_id SET NOT NULL', t
            );
        ELSE
            RAISE NOTICE
                'Table public.% : % ligne(s) sans agency_id ; NOT NULL non pose (backfill incomplet, aucune Agence par defaut). Rejouer la migration apres rattachement.',
                t, null_count;
        END IF;
    END LOOP;
END $$;


-- ==========================================
-- TACHE 1.4 — FONCTIONS SECURITY DEFINER + RLS DE CLOISONNEMENT
-- ==========================================
-- Perimetre de la tache 1.4 (suite des taches 1.1/1.2/1.3, meme migration) :
--   X.  Fonctions SECURITY DEFINER : is_agency_member, is_platform_editor
--   Y.  Activation RLS + gabarit d'isolation par agency_id sur CHAQUE table
--       portant agency_id (tables 1.1/1.2/1.3 + tables existantes de 0001)
--   Z.  Politiques specifiques : module_entitlements (ecriture editeur, lecture
--       membre), agencies (lecture/ecriture editeur, lecture membre/proprietaire)
--   AA. Politiques des catalogues (ecriture editeur, lecture membre)
--   AB. Tables de reference plateforme (plans, ai_agents) et registers
--   AC. RPC SECURITY DEFINER d'insertion de remote_orders validant le jeton
--
-- Principe (cf. design) : la securite repose sur la base. Le cloisonnement
-- multi-tenant (Req 3.6), l'isolation des agences (Req 1.12), la suspension
-- d'agence (Req 5.2/5.4/5.6), les droits de module (Req 4.8) et les permissions
-- d'ecriture (Req 2.8) sont imposes par des politiques RLS s'appuyant sur des
-- fonctions SECURITY DEFINER, en complement des controles d'interface.
--
-- Toutes les instructions restent idempotentes : CREATE OR REPLACE FUNCTION,
-- ENABLE ROW LEVEL SECURITY (no-op si deja active), DROP POLICY IF EXISTS avant
-- CREATE POLICY.
-- ==========================================


-- ==========================================
-- X. FONCTIONS SECURITY DEFINER DE CLOISONNEMENT (Req 1.12, 3.6, 5.2)
-- ==========================================
-- is_agency_member : vrai si uid est un Compte_Employe ACTIF d'une Agence ACTIVE
-- (activation_state = 'actif' ET agencies.state = 'active'), OU le
-- Proprietaire_Agence (owner_id) d'une Agence ACTIVE. La double exigence d'etat
-- 'active' fait que la suspension d'une Agence bloque tout acces, y compris
-- celui du proprietaire (Req 5.2/5.4) ; la reactivation (state -> 'active')
-- retablit l'acces de maniere immediate puisque l'etat est evalue a chaque
-- requete (Req 5.6). SECURITY DEFINER : la fonction lit agency_members/agencies
-- en contournant la RLS, evitant toute recursion de politique.
CREATE OR REPLACE FUNCTION public.is_agency_member(uid UUID, aid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.agency_members m
        JOIN public.agencies a ON a.id = m.agency_id
        WHERE m.user_id = uid
          AND m.agency_id = aid
          AND m.activation_state = 'actif'
          AND a.state = 'active'
    ) OR EXISTS (
        SELECT 1
        FROM public.agencies a
        WHERE a.id = aid
          AND a.owner_id = uid
          AND a.state = 'active'
    );
$$;

-- is_platform_editor : vrai si uid porte l'indicateur is_platform_editor sur son
-- Profil_Acces (Editeur_Plateforme — Q6, Req 4/5). SECURITY DEFINER, dans
-- l'esprit de is_admin/has_access de la migration 0001.
CREATE OR REPLACE FUNCTION public.is_platform_editor(uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.access_profiles
        WHERE user_id = uid AND is_platform_editor = TRUE
    );
$$;


-- ==========================================
-- Y. GABARIT D'ISOLATION PAR agency_id (Req 1.12, 2.8, 3.6, 5.2)
-- ==========================================
-- Suppression des politiques heritees de la migration 0001 sur les tables de
-- tresorerie : ces politiques n'exigeaient que has_access(auth.uid()) et, les
-- politiques PERMISSIVE etant combinees par OR, leur maintien permettrait a un
-- Utilisateur d'une autre Agence d'acceder aux donnees. Elles sont remplacees
-- par le gabarit d'isolation ci-dessous.
DROP POLICY IF EXISTS tx_rw_access ON public.transactions;
DROP POLICY IF EXISTS "Allow full access on transactions" ON public.transactions;
DROP POLICY IF EXISTS customers_rw_access ON public.customers;
DROP POLICY IF EXISTS "Allow full access on customers" ON public.customers;
DROP POLICY IF EXISTS expenses_rw_access ON public.expenses;
DROP POLICY IF EXISTS "Allow full access on expenses" ON public.expenses;
DROP POLICY IF EXISTS loans_rw_access ON public.loans;
DROP POLICY IF EXISTS "Allow full access on loans" ON public.loans;
DROP POLICY IF EXISTS debts_rw_access ON public.debts;
DROP POLICY IF EXISTS "Allow full access on debts" ON public.debts;
DROP POLICY IF EXISTS message_templates_rw_access ON public.message_templates;
DROP POLICY IF EXISTS "templates_all_anon" ON public.message_templates;
DROP POLICY IF EXISTS reminder_history_rw_access ON public.reminder_history;
DROP POLICY IF EXISTS "reminders_all_anon" ON public.reminder_history;

-- Application idempotente du gabarit a chaque table portant agency_id : les
-- tables creees en 1.1/1.2/1.3 et les tables existantes (0001) backfillees en
-- 1.3. Une requete authentifiee n'accede qu'aux lignes des Agences ACTIVES
-- auxquelles l'Utilisateur est rattache (membre actif ou proprietaire).
DO $$
DECLARE
    t TEXT;
    iso_tables TEXT[] := ARRAY[
        -- tables multi-tenant creees en 1.1/1.2
        'points_of_sale', 'whatsapp_numbers', 'agency_members', 'agency_invitations',
        'module_states', 'transfers', 'subscriptions', 'flight_bookings',
        'order_links', 'remote_orders', 'whatsapp_messages', 'critical_action_log',
        -- tables de tresorerie existantes (0001) dotees de agency_id en 1.3
        'transactions', 'customers', 'expenses', 'loans', 'debts',
        'reminder_history', 'message_templates'
    ];
    pol_name TEXT;
BEGIN
    FOREACH t IN ARRAY iso_tables LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        pol_name := t || '_agency_isolation';
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol_name, t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I '
            'FOR ALL TO authenticated '
            'USING (public.has_access(auth.uid()) AND public.is_agency_member(auth.uid(), agency_id)) '
            'WITH CHECK (public.has_access(auth.uid()) AND public.is_agency_member(auth.uid(), agency_id))',
            pol_name, t
        );
    END LOOP;
END $$;


-- ==========================================
-- Z. DROITS DE MODULE ET AGENCES (Req 4.8, 5.6)
-- ==========================================

-- module_entitlements : seul l'Editeur_Plateforme accorde/revoque (ecriture) ;
-- une Agence ne lit que ses propres Droits_Module (Req 4.8).
ALTER TABLE public.module_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS me_select_member ON public.module_entitlements;
CREATE POLICY me_select_member ON public.module_entitlements
    FOR SELECT TO authenticated
    USING (public.is_agency_member(auth.uid(), agency_id));

DROP POLICY IF EXISTS me_select_editor ON public.module_entitlements;
CREATE POLICY me_select_editor ON public.module_entitlements
    FOR SELECT TO authenticated
    USING (public.is_platform_editor(auth.uid()));

DROP POLICY IF EXISTS me_write_editor ON public.module_entitlements;
CREATE POLICY me_write_editor ON public.module_entitlements
    FOR ALL TO authenticated
    USING (public.is_platform_editor(auth.uid()))
    WITH CHECK (public.is_platform_editor(auth.uid()));

-- agencies : l'Editeur_Plateforme lit toutes les Agences et modifie l'Etat_Agence
-- (suspension/reactivation — Req 5.6) ; un membre actif lit son Agence active ;
-- le Proprietaire_Agence lit toujours sa propre Agence, meme suspendue, afin que
-- l'interface puisse afficher le message d'acces suspendu (Req 5.4).
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ag_select_editor ON public.agencies;
CREATE POLICY ag_select_editor ON public.agencies
    FOR SELECT TO authenticated
    USING (public.is_platform_editor(auth.uid()));

DROP POLICY IF EXISTS ag_select_member ON public.agencies;
CREATE POLICY ag_select_member ON public.agencies
    FOR SELECT TO authenticated
    USING (public.is_agency_member(auth.uid(), id));

DROP POLICY IF EXISTS ag_select_owner ON public.agencies;
CREATE POLICY ag_select_owner ON public.agencies
    FOR SELECT TO authenticated
    USING (owner_id = auth.uid());

DROP POLICY IF EXISTS ag_update_editor ON public.agencies;
CREATE POLICY ag_update_editor ON public.agencies
    FOR UPDATE TO authenticated
    USING (public.is_platform_editor(auth.uid()))
    WITH CHECK (public.is_platform_editor(auth.uid()));

DROP POLICY IF EXISTS ag_insert_editor ON public.agencies;
CREATE POLICY ag_insert_editor ON public.agencies
    FOR INSERT TO authenticated
    WITH CHECK (public.is_platform_editor(auth.uid()));


-- ==========================================
-- AA. CATALOGUES ADMINISTRABLES (Req 9.6, 11.7)
-- ==========================================
-- Catalogue_Methodes_Transfert et Catalogue_Fournisseurs_Abonnement : ecriture
-- reservee a l'Editeur_Plateforme (administration au niveau plateforme —
-- Req 9.6/11.7) ; lecture par tout membre (entrees plateforme agency_id IS NULL
-- ou entrees propres a son Agence).
ALTER TABLE public.transfer_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tm_write_editor ON public.transfer_methods;
CREATE POLICY tm_write_editor ON public.transfer_methods
    FOR ALL TO authenticated
    USING (public.is_platform_editor(auth.uid()))
    WITH CHECK (public.is_platform_editor(auth.uid()));

DROP POLICY IF EXISTS tm_read_member ON public.transfer_methods;
CREATE POLICY tm_read_member ON public.transfer_methods
    FOR SELECT TO authenticated
    USING (agency_id IS NULL OR public.is_agency_member(auth.uid(), agency_id));

ALTER TABLE public.subscription_providers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sp_write_editor ON public.subscription_providers;
CREATE POLICY sp_write_editor ON public.subscription_providers
    FOR ALL TO authenticated
    USING (public.is_platform_editor(auth.uid()))
    WITH CHECK (public.is_platform_editor(auth.uid()));

DROP POLICY IF EXISTS sp_read_member ON public.subscription_providers;
CREATE POLICY sp_read_member ON public.subscription_providers
    FOR SELECT TO authenticated
    USING (agency_id IS NULL OR public.is_agency_member(auth.uid(), agency_id));


-- ==========================================
-- AB. TABLES DE REFERENCE PLATEFORME ET CAISSES
-- ==========================================
-- plans : reference plateforme (Plan_Tarifaire) ; lecture par tout Utilisateur
-- autorise (le rattachement d'une Agence a son plan doit etre lisible),
-- ecriture reservee a l'Editeur_Plateforme.
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plans_read_access ON public.plans;
CREATE POLICY plans_read_access ON public.plans
    FOR SELECT TO authenticated
    USING (public.has_access(auth.uid()));

DROP POLICY IF EXISTS plans_write_editor ON public.plans;
CREATE POLICY plans_write_editor ON public.plans
    FOR ALL TO authenticated
    USING (public.is_platform_editor(auth.uid()))
    WITH CHECK (public.is_platform_editor(auth.uid()));

-- ai_agents : Registre_Agents de reference ; lecture par tout Utilisateur
-- autorise, ecriture reservee a l'Editeur_Plateforme.
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_agents_read_access ON public.ai_agents;
CREATE POLICY ai_agents_read_access ON public.ai_agents
    FOR SELECT TO authenticated
    USING (public.has_access(auth.uid()));

DROP POLICY IF EXISTS ai_agents_write_editor ON public.ai_agents;
CREATE POLICY ai_agents_write_editor ON public.ai_agents
    FOR ALL TO authenticated
    USING (public.is_platform_editor(auth.uid()))
    WITH CHECK (public.is_platform_editor(auth.uid()));

-- registers : ne porte pas agency_id (rattachee via points_of_sale.pos_id).
-- L'isolation s'opere par jointure vers le Point_De_Vente parent et son Agence,
-- garantissant la coherence du gabarit de cloisonnement.
ALTER TABLE public.registers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS registers_agency_isolation ON public.registers;
CREATE POLICY registers_agency_isolation ON public.registers
    FOR ALL TO authenticated
    USING (
        public.has_access(auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.points_of_sale p
            WHERE p.id = registers.pos_id
              AND public.is_agency_member(auth.uid(), p.agency_id)
        )
    )
    WITH CHECK (
        public.has_access(auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.points_of_sale p
            WHERE p.id = registers.pos_id
              AND public.is_agency_member(auth.uid(), p.agency_id)
        )
    );


-- ==========================================
-- AC. RPC SECURITY DEFINER D'INSERTION DE COMMANDE A DISTANCE (Req 14.3, 14.5)
-- ==========================================
-- La route publique /commande/:lien (Formulaire_Commande) est non authentifiee
-- par conception (Req 14.3). Plutot qu'une politique anon USING(true) ouverte sur
-- remote_orders, l'insertion passe par cette fonction SECURITY DEFINER qui valide
-- le jeton (Lien_Commande connu, non revoque, non expire — Req 14.5) et la
-- presence des champs requis avant d'inserer la Commande_Distante a l'etat
-- 'à_traiter'. L'agency_id est derive du Lien_Commande (jamais fourni par le
-- client), garantissant le rattachement correct (Req 3.2). La fonction etant
-- SECURITY DEFINER, elle contourne la RLS de remote_orders pour cette insertion
-- controlee uniquement.
CREATE OR REPLACE FUNCTION public.submit_remote_order(
    p_token         TEXT,
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_details       TEXT,
    p_proof_path    TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_link    public.order_links%ROWTYPE;
    v_order_id UUID;
BEGIN
    -- Jeton connu ? (Lien_Commande existant — Req 14.5)
    SELECT * INTO v_link
    FROM public.order_links
    WHERE token = p_token
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'invalid_order_token' USING ERRCODE = '22023';
    END IF;

    -- Lien revoque ? (Req 14.5)
    IF v_link.revoked THEN
        RAISE EXCEPTION 'revoked_order_token' USING ERRCODE = '22023';
    END IF;

    -- Lien expire ? (Req 14.5)
    IF v_link.expires_at IS NOT NULL AND v_link.expires_at < TIMEZONE('utc'::text, NOW()) THEN
        RAISE EXCEPTION 'expired_order_token' USING ERRCODE = '22023';
    END IF;

    -- Champ requis : nom du client non vide (Req 14.6)
    IF p_customer_name IS NULL OR length(btrim(p_customer_name)) = 0 THEN
        RAISE EXCEPTION 'missing_customer_name' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.remote_orders (
        agency_id, order_link_id, customer_name, customer_phone, details, proof_path, state
    )
    VALUES (
        v_link.agency_id,
        v_link.id,
        p_customer_name,
        p_customer_phone,
        p_details,
        p_proof_path,
        'à_traiter'
    )
    RETURNING id INTO v_order_id;

    RETURN v_order_id;
END;
$$;

-- Le Formulaire_Commande est public : l'execution de la RPC est ouverte aux
-- roles anon et authenticated. La validation du jeton dans le corps de la
-- fonction constitue l'unique barriere de securite (Req 14.3, 14.5).
GRANT EXECUTE ON FUNCTION public.submit_remote_order(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;


-- ==========================================
-- TACHE 1.5 — BUCKET PRIVE 'order-proofs', INDEX DE PERFORMANCE ET CRON
-- ==========================================
-- Perimetre de la tache 1.5 (suite des taches 1.1 a 1.4, meme migration) :
--   AD. Index de performance complementaires (Req 17.3)
--   AE. Bucket Storage prive 'order-proofs' + politique de lecture par membre
--       d'agence (Req 14.4)
--   AF. Planification pg_cron (*/15 * * * *) invoquant 'scheduled-reminders'
--       (Req 10.4, 12.5)
--
-- Toutes les instructions restent idempotentes : CREATE INDEX IF NOT EXISTS,
-- INSERT ... ON CONFLICT, DROP POLICY IF EXISTS avant CREATE POLICY, et
-- planification cron gardee (suppression prealable du job homonyme).
-- ==========================================


-- ==========================================
-- AD. INDEX DE PERFORMANCE (Req 17.3)
-- ==========================================
-- Les index d'isolation/listing par agence pour les services additionnels et le
-- journal WhatsApp ont deja ete crees au plus pres de leur table dans la tache
-- 1.2 (principe « etendre, ne pas dupliquer ») ; ils sont rappeles ici a titre
-- documentaire et NE SONT PAS recrees :
--   idx_transfers_agency      ON public.transfers(agency_id, created_at DESC)        -- section L (1.2)
--   idx_subs_agency_renew     ON public.subscriptions(agency_id, renewal_date)       -- section M (1.2)
--   idx_flights_agency_at     ON public.flight_bookings(agency_id, flight_at)        -- section N (1.2)
--   idx_wamsg_agency_ts       ON public.whatsapp_messages(agency_id, created_at DESC)-- section P (1.2)
--   idx_remote_orders_agency  ON public.remote_orders(agency_id, created_at DESC)    -- section O (1.2)
--
-- Index manquants crees ci-dessous pour les tables de tresorerie existantes
-- (0001) dotees de agency_id en tache 1.3, afin d'accelerer le listing
-- chronologique des Operations et la resolution des Clients par agence (Req 17.3).

-- idx_tx_agency_ts : listing des Operations d'une agence par ordre antechronologique.
-- La colonne 'timestamp' (heure operationnelle de la migration 0001) est l'axe
-- de tri naturel des journaux de transactions.
CREATE INDEX IF NOT EXISTS idx_tx_agency_ts
    ON public.transactions(agency_id, timestamp DESC);

-- idx_customers_agency : resolution et listing des Clients d'une agence.
CREATE INDEX IF NOT EXISTS idx_customers_agency
    ON public.customers(agency_id);


-- ==========================================
-- AE. BUCKET STORAGE PRIVE 'order-proofs' (Req 14.4)
-- ==========================================
-- Les preuves de Commande_Distante sont deposees dans un bucket PRIVE
-- (public = FALSE) ; elles ne sont jamais accessibles via URL publique mais
-- uniquement via URL signee generee pour un membre de l'agence proprietaire.
-- Arborescence attendue : order-proofs/{agency_id}/{token}/{horodatage-nom}.
INSERT INTO storage.buckets (id, name, public)
VALUES ('order-proofs', 'order-proofs', FALSE)
ON CONFLICT (id) DO UPDATE SET public = FALSE;

-- Politique de LECTURE par membre d'agence : un Utilisateur authentifie ne lit
-- une preuve que s'il est membre actif (ou proprietaire) de l'Agence dont
-- l'identifiant constitue le premier segment du chemin de l'objet (Req 14.4).
-- Le depot des preuves depuis le Formulaire_Commande public reste assure hors
-- politique anon ouverte (cf. section AC, RPC SECURITY DEFINER validant le jeton).
DROP POLICY IF EXISTS op_read_member ON storage.objects;
CREATE POLICY op_read_member ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'order-proofs'
        AND public.is_agency_member(
            auth.uid(),
            ((storage.foldername(name))[1])::uuid
        )
    );


-- ==========================================
-- AF. PLANIFICATION pg_cron DES RELANCES (Req 10.4, 12.5)
-- ==========================================
-- Une tache pg_cron (*/15 * * * *) invoque la fonction edge 'scheduled-reminders'
-- toutes les 15 minutes. La fonction edge itere les abonnements/vols dont la
-- relance est due (logique pure 'reminderSchedule.js'), delegue l'envoi au
-- Service_Envoi et consigne dans whatsapp_messages et l'Historique_Rappels.
--
-- L'invocation HTTP s'appuie sur pg_net (net.http_post). L'URL de base et la cle
-- service-role NE SONT PAS codees en dur : elles sont lues depuis des parametres
-- de configuration applicatifs (GUC), a renseigner cote plateforme :
--   ALTER DATABASE postgres SET app.settings.edge_base_url   = 'https://<ref>.supabase.co/functions/v1';
--   ALTER DATABASE postgres SET app.settings.service_role_key = '<service_role_jwt>';
--
-- Le bloc est entierement GARDE : si les extensions pg_cron / pg_net ne sont pas
-- disponibles (environnement de developpement local, par exemple), la
-- planification est ignoree sans faire echouer la migration. La tache est
-- idempotente : tout job homonyme preexistant est d'abord desinscrit.
DO $$
DECLARE
    v_base_url TEXT := current_setting('app.settings.edge_base_url', TRUE);
    v_service_key TEXT := current_setting('app.settings.service_role_key', TRUE);
    v_command TEXT;
BEGIN
    -- Disponibilite de pg_cron ? (sinon, planification ignoree proprement)
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        RAISE NOTICE 'pg_cron indisponible : planification de scheduled-reminders ignoree (a configurer cote plateforme).';
        RETURN;
    END IF;

    -- Desinscription idempotente du job homonyme s'il existe deja.
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'scheduled-reminders-15min';

    -- Commande exécutée par le cron : appel HTTP POST a la fonction edge.
    -- Si pg_net est absent ou les parametres non renseignes, on planifie un
    -- no-op trace (NOTICE) afin de ne pas perdre la definition de la tache.
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
       AND v_base_url IS NOT NULL
       AND v_service_key IS NOT NULL THEN
        v_command := format(
            $cmd$SELECT net.http_post(
                url := %L,
                headers := jsonb_build_object(
                    'Content-Type', 'application/json',
                    'Authorization', %L
                ),
                body := '{}'::jsonb
            );$cmd$,
            v_base_url || '/scheduled-reminders',
            'Bearer ' || v_service_key
        );
    ELSE
        v_command := $cmd$DO $inner$ BEGIN RAISE NOTICE 'scheduled-reminders : pg_net ou parametres (app.settings.edge_base_url / service_role_key) non configures.'; END $inner$;$cmd$;
    END IF;

    -- Planification toutes les 15 minutes (Req 10.4, 12.5).
    PERFORM cron.schedule('scheduled-reminders-15min', '*/15 * * * *', v_command);
    RAISE NOTICE 'Tache cron scheduled-reminders-15min planifiee (*/15 * * * *).';
END $$;
