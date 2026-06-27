import { useMemo, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Upload, AlertCircle, CheckCircle2, ClipboardList } from 'lucide-react';
import { supabase } from '../services/supabase';
import { useT } from '../i18n';
import BrandHeader from '../components/BrandHeader';
import {
  decodeOrderLink,
  isWellFormedToken,
  validateOrderForm,
} from '../utils/orderToken';

// FormulaireCommande (Formulaire_Commande) — page PUBLIQUE de commande à distance.
//
// Route publique `/commande/:lien` (Req 14.3) : un client distant ouvre un
// Lien_Commande partagé et passe une commande SANS compte authentifié. Le
// paramètre `:lien` est la charge utile encodée { agencyId, token } produite par
// `encodeOrderLink` (src/utils/orderToken.js).
//
// Validation du jeton (logique pure `orderToken.js`) :
//   - `decodeOrderLink` extrait { agencyId, token } ; un lien illisible est
//     refusé (Req 14.5) ;
//   - `isWellFormedToken` vérifie la bonne forme du jeton avant tout appel
//     réseau ; un jeton malformé est refusé (Req 14.5).
// La validation AUTORITATIVE (jeton connu, non révoqué, non expiré) est portée
// par la base via la RPC SECURITY DEFINER `submit_remote_order` : la clé anon
// étant publique et `order_links` cloisonnée en RLS aux membres de l'agence, le
// formulaire public ne peut pas lire la table ; la RPC constitue donc l'unique
// barrière de sécurité (cf. design, Req 14.3, 14.5).
//
// Soumission (Req 14.4) :
//   1. `validateOrderForm` garantit la présence de tous les champs requis (nom,
//      téléphone, détails, Preuve) ; un champ manquant refuse l'enregistrement
//      sans aucun effet de bord (Req 14.6) ;
//   2. la Preuve est déposée dans le bucket privé `order-proofs` au chemin
//      `{agencyId}/{token}/{horodatage-nom}` (Req 14.4) ;
//   3. la Commande_Distante est enregistrée à l'état `à_traiter` via la RPC, qui
//      dérive l'agency_id du Lien_Commande (jamais fourni par le client — Req 3.2).
//
// Feature: agency-operations-expansion

// Codes d'erreur levés par la RPC `submit_remote_order` correspondant à un
// Lien_Commande invalide (jeton inconnu, révoqué ou expiré — Req 14.5).
const INVALID_LINK_RPC_CODES = [
  'invalid_order_token',
  'revoked_order_token',
  'expired_order_token',
];

// Assainit un nom de fichier pour un chemin d'objet de stockage : conserve les
// caractères sûrs, remplace le reste par un tiret, et borne la longueur.
const sanitizeFileName = (name) => {
  const safe = String(name || 'preuve')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return safe || 'preuve';
};

// Construit le chemin de dépôt de la Preuve dans le bucket privé `order-proofs`.
// Arborescence attendue : order-proofs/{agency_id}/{token}/{horodatage-nom}.
const buildProofPath = (agencyId, token, fileName) =>
  `${agencyId}/${token}/${Date.now()}-${sanitizeFileName(fileName)}`;

export default function FormulaireCommande() {
  const { lien } = useParams();
  const t = useT();

  // Décodage + bonne forme du jeton (logique pure, sans réseau — Req 14.5).
  const linkState = useMemo(() => {
    const decoded = decodeOrderLink(lien);
    if (!decoded.ok || !isWellFormedToken(decoded.token)) {
      return { valid: false };
    }
    return { valid: true, agencyId: decoded.agencyId, token: decoded.token };
  }, [lien]);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [details, setDetails] = useState('');
  const [proof, setProof] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [done, setDone] = useState(false);
  const fileInputRef = useRef(null);

  // Associe le champ requis manquant retourné par `validateOrderForm` à un
  // message i18n explicite (Req 14.6).
  const missingFieldMessage = (field) =>
    field === 'proof'
      ? t('order_form.error_proof_required')
      : t('order_form.error_missing_field');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);

    // 1. Validation des champs requis (Req 14.6) — aucun effet de bord si invalide.
    const validation = validateOrderForm({
      customerName,
      customerPhone,
      details,
      proof,
    });
    if (!validation.ok) {
      setMessage({ type: 'error', text: missingFieldMessage(validation.missingField) });
      return;
    }

    setSubmitting(true);

    // Mode démo / Supabase non configuré : succès simulé, aucun appel réseau
    // (préserve le mode démo existant). La validation pure reste appliquée.
    if (!supabase) {
      setSubmitting(false);
      setDone(true);
      setMessage({ type: 'success', text: t('order_form.success') });
      return;
    }

    try {
      // 2. Dépôt de la Preuve dans le bucket privé `order-proofs` (Req 14.4).
      const proofPath = buildProofPath(linkState.agencyId, linkState.token, proof.name);
      const { error: uploadError } = await supabase.storage
        .from('order-proofs')
        .upload(proofPath, proof, {
          contentType: proof.type || 'application/octet-stream',
          upsert: false,
        });
      if (uploadError) {
        console.error('Échec du dépôt de la preuve:', uploadError.message);
        setSubmitting(false);
        setMessage({ type: 'error', text: t('order_form.error_proof_required') });
        return;
      }

      // 3. Enregistrement de la Commande_Distante via la RPC SECURITY DEFINER.
      //    La RPC valide le jeton (connu/non révoqué/non expiré — Req 14.5),
      //    dérive l'agency_id du Lien_Commande et insère à l'état `à_traiter`.
      const { error: rpcError } = await supabase.rpc('submit_remote_order', {
        p_token: linkState.token,
        p_customer_name: customerName,
        p_customer_phone: customerPhone,
        p_details: details,
        p_proof_path: proofPath,
      });

      setSubmitting(false);

      if (rpcError) {
        const raw = rpcError.message || '';
        // Jeton invalide/révoqué/expiré ⇒ message « lien invalide » (Req 14.5).
        if (INVALID_LINK_RPC_CODES.some((code) => raw.includes(code))) {
          setMessage({ type: 'error', text: t('order_form.link_invalid') });
          return;
        }
        // Champ requis refusé côté base (filet de sécurité — Req 14.6).
        if (raw.includes('missing_customer_name')) {
          setMessage({ type: 'error', text: t('order_form.error_missing_field') });
          return;
        }
        console.error('Échec de l\'enregistrement de la commande:', raw);
        setMessage({ type: 'error', text: t('order_form.error_missing_field') });
        return;
      }

      // Confirmation de transmission (Req 14.4).
      setDone(true);
      setMessage({ type: 'success', text: t('order_form.success') });
    } catch (err) {
      console.error('Échec de la soumission de la commande:', err?.message || err);
      setSubmitting(false);
      setMessage({ type: 'error', text: t('order_form.error_missing_field') });
    }
  };

  // Lien invalide : refus d'accès au Formulaire_Commande (Req 14.5).
  if (!linkState.valid) {
    return (
      <div className="auth-overlay" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
        <div style={{ maxWidth: '420px', width: '100%' }}>
          <BrandHeader />
          <div className="card" style={{ textAlign: 'center', padding: '32px 24px' }}>
            <AlertCircle size={44} color="var(--color-red)" style={{ margin: '0 auto 14px' }} />
            <h2 className="screen-title">{t('order_form.title')}</h2>
            <p className="screen-desc">{t('order_form.link_invalid')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-overlay" style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '20px', overflowY: 'auto' }}>
      <div style={{ maxWidth: '480px', width: '100%' }}>
        <BrandHeader />
        <div className="screen-header" style={{ textAlign: 'center' }}>
          <h2 className="screen-title" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <ClipboardList size={20} color="var(--color-primary)" />
            <span>{t('order_form.title')}</span>
          </h2>
          <p className="screen-desc">{t('order_form.subtitle')}</p>
        </div>

        {message && (
          <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-info'}`} role={message.type === 'success' ? 'status' : 'alert'}>
            {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{message.text}</span>
          </div>
        )}

        {/* Le formulaire disparaît une fois la commande transmise (Req 14.4). */}
        {!done && (
          <form onSubmit={handleSubmit} className="card">
            <div className="form-group">
              <label className="form-label" htmlFor="order-customer-name">{t('order_form.customer_name_label')}</label>
              <input
                id="order-customer-name"
                type="text"
                className="form-control"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                autoComplete="name"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="order-customer-phone">{t('order_form.phone_label')}</label>
              <input
                id="order-customer-phone"
                type="tel"
                className="form-control"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                autoComplete="tel"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="order-details">{t('order_form.details_label')}</label>
              <textarea
                id="order-details"
                className="form-control"
                rows={4}
                placeholder={t('order_form.details_placeholder')}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="order-proof">{t('order_form.proof_label')}</label>
              <input
                id="order-proof"
                ref={fileInputRef}
                type="file"
                className="form-control"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                onChange={(e) => setProof(e.target.files?.[0] ?? null)}
              />
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {t('order_form.proof_hint')}
              </p>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', minHeight: '44px' }}
            >
              <Upload size={16} />
              <span>{submitting ? t('order_form.submitting') : t('order_form.submit')}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
