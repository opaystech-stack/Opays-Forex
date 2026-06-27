-- ============================================================================
-- Migration 0004 — Politique d'upload du bucket prive 'order-proofs'
-- Feature: agency-operations-expansion (correctif securite, Req 14.3, 14.4, 14.5)
-- ----------------------------------------------------------------------------
-- CONTEXTE
-- Le Formulaire_Commande est une page PUBLIQUE (route /commande/:lien) : un
-- client distant non authentifie depose une Preuve dans le bucket prive
-- 'order-proofs' puis enregistre la Commande_Distante via la RPC SECURITY
-- DEFINER public.submit_remote_order (qui valide le jeton — migration 0003).
--
-- La migration 0003 cree le bucket prive et une politique de LECTURE par membre
-- d'agence (op_read_member), mais AUCUNE politique d'ECRITURE (INSERT). En
-- production, la RLS de storage.objects refuse donc l'upload anon : le depot de
-- preuve echoue (le flux client upload-puis-RPC est rompu).
--
-- CORRECTIF (defense en profondeur, sans ouverture anon arbitraire)
-- On autorise l'INSERT dans 'order-proofs' aux roles anon et authenticated,
-- mais UNIQUEMENT lorsque le chemin de l'objet correspond a un Lien_Commande
-- VALIDE — connu, non revoque, non expire (memes regles que la RPC, Req 14.5).
-- La validation s'appuie sur une fonction SECURITY DEFINER qui contourne la RLS
-- de order_links (cloisonnee par agence) pour le seul controle du chemin.
--
-- Arborescence imposee : order-proofs/{agency_id}/{token}/{horodatage-nom}
--   - segment [1] = agency_id (UUID de l'agence du Lien_Commande)
--   - segment [2] = token     (jeton non devinable >= 128 bits)
--
-- Aucune autre operation n'est accordee a anon : ni SELECT (lecture reservee aux
-- membres via op_read_member de 0003), ni UPDATE, ni DELETE. L'upload se fait en
-- INSERT pur (upsert: false cote client), empechant l'ecrasement d'un objet.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Fonction de validation du chemin d'upload (SECURITY DEFINER)
-- ----------------------------------------------------------------------------
-- Retourne TRUE si et seulement si le chemin d'objet vise un Lien_Commande
-- existant, non revoque et non expire, dont l'agency_id correspond au premier
-- segment du chemin. Toute incoherence (segments manquants, agency_id non UUID,
-- jeton inconnu/revoque/expire, mauvais rattachement agence) retourne FALSE.
CREATE OR REPLACE FUNCTION public.is_valid_order_proof_path(object_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_segments TEXT[];
    v_agency   TEXT;
    v_token    TEXT;
    v_agency_uuid UUID;
    v_link     public.order_links%ROWTYPE;
BEGIN
    IF object_name IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Decoupe le chemin en segments de dossier : [agency_id, token, ...].
    v_segments := storage.foldername(object_name);
    IF array_length(v_segments, 1) IS NULL OR array_length(v_segments, 1) < 2 THEN
        RETURN FALSE;
    END IF;

    v_agency := v_segments[1];
    v_token  := v_segments[2];

    IF v_agency IS NULL OR length(btrim(v_agency)) = 0
       OR v_token IS NULL OR length(btrim(v_token)) = 0 THEN
        RETURN FALSE;
    END IF;

    -- L'agency_id doit etre un UUID valide (sinon chemin non conforme).
    BEGIN
        v_agency_uuid := v_agency::uuid;
    EXCEPTION WHEN others THEN
        RETURN FALSE;
    END;

    -- Lien_Commande connu pour ce jeton ?
    SELECT * INTO v_link
    FROM public.order_links
    WHERE token = v_token
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- Le jeton doit appartenir a l'agence figurant dans le chemin (anti-falsification).
    IF v_link.agency_id <> v_agency_uuid THEN
        RETURN FALSE;
    END IF;

    -- Lien revoque ou expire ? (memes regles que submit_remote_order — Req 14.5)
    IF v_link.revoked THEN
        RETURN FALSE;
    END IF;

    IF v_link.expires_at IS NOT NULL AND v_link.expires_at < TIMEZONE('utc'::text, NOW()) THEN
        RETURN FALSE;
    END IF;

    RETURN TRUE;
END;
$$;

-- L'evaluation de la fonction par les politiques s'exerce pour les roles
-- emetteurs de l'upload (client public anon, et utilisateur authentifie).
GRANT EXECUTE ON FUNCTION public.is_valid_order_proof_path(TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Politique d'INSERT sur storage.objects pour 'order-proofs'
-- ----------------------------------------------------------------------------
-- Depot autorise uniquement si le chemin vise un Lien_Commande valide (Req 14.4,
-- 14.5). Couvre anon (Formulaire_Commande public) et authenticated (agent
-- generant une commande depuis l'app).
DROP POLICY IF EXISTS op_insert_valid_link ON storage.objects;
CREATE POLICY op_insert_valid_link ON storage.objects
    FOR INSERT TO anon, authenticated
    WITH CHECK (
        bucket_id = 'order-proofs'
        AND public.is_valid_order_proof_path(name)
    );

-- ============================================================================
-- Notes d'exploitation
-- ----------------------------------------------------------------------------
-- - Aucune politique UPDATE/DELETE n'est accordee a anon : un objet depose ne
--   peut etre ni ecrase ni supprime par le public (le client utilise
--   upsert:false). La purge eventuelle des preuves releve d'une tache
--   administrative (service role) hors RLS.
-- - Pour borner l'usage du stockage par des liens valides, definir une limite de
--   taille de fichier sur le bucket cote plateforme :
--     UPDATE storage.buckets
--     SET file_size_limit = 5242880,  -- 5 Mo
--         allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp','application/pdf']
--     WHERE id = 'order-proofs';
--   (Optionnel : a appliquer selon la politique de la plateforme.)
-- ============================================================================
