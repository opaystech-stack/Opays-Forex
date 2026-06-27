import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  Tv, Send, CheckCircle2, AlertCircle, Trash2, Lock, Megaphone, BellRing, Clock,
  Image as ImageIcon, Camera, X
} from 'lucide-react';
import { useT } from '../i18n';
import { canSendMarketingCampaign } from '../utils/subscriptionValidation';
import {
  isValidRenewalThreshold,
  RENEWAL_THRESHOLD_DEFAULT_DAYS,
} from '../utils/reminderSchedule';

const fmt = new Intl.NumberFormat('fr-FR');

// Aujourd'hui au format `YYYY-MM-DD` pour borner le sélecteur de date (Req 10.2).
const todayIso = () => new Date().toISOString().slice(0, 10);

// Écran de vente d'abonnements TV, configuration du seuil de relance, envoi de
// campagnes marketing et affichage de l'Historique_Rappels (Exigence 10).
//
// Gardé par la permission `services.vendre` (Req 10.2) et par l'activation du
// Module_Additionnel `abonnements` (Req 10.1). La saisie est fiabilisée par la
// fonction pure `validateSubscription` (appliquée dans `createSubscription` du
// contexte) ; le Seuil_Relance_Abonnement est borné par `isValidRenewalThreshold`
// (Req 10.5, 10.6) ; l'envoi de campagne est conditionné au consentement du
// Client via `canSendMarketingCampaign` (Req 10.7).
export default function Abonnements() {
  const t = useT();
  const {
    subscriptions,
    subscriptionProviders,
    customers,
    createSubscription,
    updateSubscription,
    deleteSubscription,
    logReminder,
    hasPermission,
    isModuleEnabled,
    loading,
  } = useApp();

  // Champs du formulaire de vente.
  const [providerId, setProviderId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [plan, setPlan] = useState('');
  const [amount, setAmount] = useState('');
  const [commission, setCommission] = useState('');
  const [renewalDate, setRenewalDate] = useState('');
  const [threshold, setThreshold] = useState(String(RENEWAL_THRESHOLD_DEFAULT_DAYS));
  const [consent, setConsent] = useState(false);
  const [flyerFile, setFlyerFile] = useState(null);
  const [flyerUrl, setFlyerUrl] = useState(null);

  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);

  // Édition du seuil de relance par abonnement (Req 10.5, 10.6).
  const [thresholdEdits, setThresholdEdits] = useState({});

  const canSell = hasPermission('services.vendre');
  const moduleEnabled = isModuleEnabled('abonnements');

  // Fournisseurs proposés : uniquement les entrées actives du catalogue (Req 10.1).
  const activeProviders = useMemo(
    () =>
      (Array.isArray(subscriptionProviders) ? subscriptionProviders : []).filter(
        (p) => p && p.is_active,
      ),
    [subscriptionProviders],
  );

  // Libellés des fournisseurs par identifiant pour l'historique, y compris les
  // fournisseurs désactivés rattachés à d'anciens abonnements (Req 11.5).
  const providerLabelById = useMemo(() => {
    const map = {};
    (Array.isArray(subscriptionProviders) ? subscriptionProviders : []).forEach((p) => {
      if (p && p.id) map[p.id] = p.label;
    });
    return map;
  }, [subscriptionProviders]);

  const customerById = useMemo(() => {
    const map = {};
    (Array.isArray(customers) ? customers : []).forEach((c) => {
      if (c && c.id) map[c.id] = c;
    });
    return map;
  }, [customers]);

  const handleFlyerChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFlyerFile(file);
    setFlyerUrl(URL.createObjectURL(file));
  };

  const resetForm = () => {
    setProviderId('');
    setCustomerId('');
    setPlan('');
    setAmount('');
    setCommission('');
    setRenewalDate('');
    setThreshold(String(RENEWAL_THRESHOLD_DEFAULT_DAYS));
    setConsent(false);
    setFlyerFile(null);
    setFlyerUrl(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Garde du Seuil_Relance_Abonnement avant tout enregistrement (Req 10.5, 10.6).
    const thresholdValue = Number(threshold);
    if (!isValidRenewalThreshold(thresholdValue)) {
      setMessage({ type: 'error', text: t('abonnements.error_threshold_invalid') });
      return;
    }

    setSaving(true);
    const res = await createSubscription({
      provider_id: providerId,
      customer_id: customerId || null,
      plan,
      amount_paid: parseFloat(amount),
      commission: parseFloat(commission) || 0,
      renewal_date: renewalDate,
      renewal_threshold_days: thresholdValue,
      marketing_consent: consent,
    });
    setSaving(false);

    if (res.success) {
      setMessage({ type: 'success', text: t('abonnements.save_success') });
      resetForm();
      return;
    }

    // Traduction des champs invalides retournés par validateSubscription (Req 10.3).
    const fieldMessages = {
      provider: t('abonnements.error_provider_required'),
      amount: t('abonnements.error_amount_invalid'),
      renewalDate: t('abonnements.error_renewal_invalid'),
    };
    setMessage({ type: 'error', text: fieldMessages[res.field] || res.error });
  };

  const handleDelete = async (id) => {
    const res = await deleteSubscription(id);
    setMessage(
      res.success
        ? { type: 'success', text: t('abonnements.save_success') }
        : { type: 'error', text: res.error },
    );
  };

  // Mise à jour du Seuil_Relance_Abonnement d'un abonnement existant : refus et
  // conservation de la valeur antérieure si hors bornes 1..30 (Req 10.6).
  const handleThresholdSave = async (sub) => {
    const raw = thresholdEdits[sub.id];
    const value = Number(raw);
    if (!isValidRenewalThreshold(value)) {
      setMessage({ type: 'error', text: t('abonnements.error_threshold_invalid') });
      return;
    }
    const res = await updateSubscription(sub.id, { renewal_threshold_days: value });
    setMessage(
      res.success
        ? { type: 'success', text: t('abonnements.threshold_success') }
        : { type: 'error', text: res.error },
    );
  };

  // Envoi d'une Campagne_Marketing : autorisé seulement si le Client a consenti
  // (Req 10.7). L'envoi est journalisé dans l'historique partagé via le
  // Service_Envoi / logReminder, sans interrompre l'écran en cas d'échec.
  const handleSendCampaign = async (sub) => {
    if (!canSendMarketingCampaign(sub.marketing_consent)) {
      setMessage({ type: 'error', text: t('abonnements.campaign_consent_required') });
      return;
    }
    await logReminder({
      customer_id: sub.customer_id || null,
      scenario: 'marketing',
      content: t('abonnements.campaign_title'),
      trigger_source: 'manual',
      status: 'sent',
    });
    setMessage({ type: 'success', text: t('abonnements.campaign_success') });
  };

  if (loading) {
    return (
      <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '20px' }}>
        {t('loading.data')}
      </p>
    );
  }

  // Garde module : le Module_Additionnel `abonnements` doit être activé (Req 10.1).
  if (!moduleEnabled) {
    return (
      <div>
        <div className="screen-header">
          <h2 className="screen-title">{t('abonnements.title')}</h2>
          <p className="screen-desc">{t('abonnements.desc')}</p>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '30px 20px' }}>
          <Lock size={40} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            {t('abonnements.module_disabled')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="screen-header">
        <h2 className="screen-title">{t('abonnements.title')}</h2>
        <p className="screen-desc">{t('abonnements.desc')}</p>
      </div>

      {message && (
        <div
          className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-info'}`}
          style={{ marginBottom: '14px' }}
        >
          {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Garde permission : `services.vendre` requise pour enregistrer (Req 10.2). */}
      {!canSell ? (
        <div className="card" style={{ textAlign: 'center', padding: '30px 20px' }}>
          <Lock size={40} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            {t('abonnements.permission_denied')}
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="card" style={{ marginBottom: '18px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '14px', color: 'var(--deep-navy)' }}>
            <Tv size={15} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            {t('abonnements.title')}
          </h3>

          {/* Fournisseur_Abonnement (catalogue, entrées actives uniquement) */}
          <div className="form-group">
            <label className="form-label">{t('abonnements.provider_label')}</label>
            <select
              className="form-control"
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              required
            >
              <option value="">{t('abonnements.provider_placeholder')}</option>
              {activeProviders.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* Client rattaché à l'abonnement */}
          <div className="form-group">
            <label className="form-label">{t('abonnements.customer_label')}</label>
            <select
              className="form-control"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">{t('abonnements.customer_placeholder')}</option>
              {(Array.isArray(customers) ? customers : []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.phone ? ` — ${c.phone}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Formule */}
          <div className="form-group">
            <label className="form-label">{t('abonnements.plan_label')}</label>
            <input
              type="text"
              className="form-control"
              placeholder={t('abonnements.plan_placeholder')}
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              required
            />
          </div>

          {/* Montant payé + Commission */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('abonnements.amount_label')}</label>
              <input
                type="number"
                step="any"
                min="0"
                className="form-control"
                placeholder={t('abonnements.amount_placeholder')}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('abonnements.commission_label')}</label>
              <input
                type="number"
                step="any"
                min="0"
                className="form-control"
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
              />
            </div>
          </div>

          {/* Date de renouvellement + Seuil de relance */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('abonnements.renewal_date_label')}</label>
              <input
                type="date"
                className="form-control"
                min={todayIso()}
                value={renewalDate}
                onChange={(e) => setRenewalDate(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('abonnements.threshold_label')}</label>
              <input
                type="number"
                step="1"
                min="1"
                max="30"
                className="form-control"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Consentement aux campagnes marketing (Req 10.7) */}
          <div className="form-group">
            <label
              className="form-label"
              style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', minHeight: '44px' }}
            >
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                style={{ width: '20px', height: '20px' }}
              />
              <span>{t('abonnements.consent_label')}</span>
            </label>
          </div>

          {/* Pièce jointe (Flyer/Affiche de l'abonnement) */}
          <div className="form-group">
            <label className="form-label" style={{ display: 'block', marginBottom: '8px' }}>
              Affiche / Flyer publicitaire (optionnel)
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
              <label className="btn btn-outline" style={{ cursor: 'pointer', fontSize: '12px', padding: '9px 6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <Camera size={14} color="#15803D" />
                <span>Prendre une photo</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFlyerChange}
                  style={{ display: 'none' }}
                />
              </label>
              <label className="btn btn-outline" style={{ cursor: 'pointer', fontSize: '12px', padding: '9px 6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <ImageIcon size={14} color="#4F46E5" />
                <span>Choisir un fichier</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFlyerChange}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
            
            {flyerUrl && (
              <div style={{ position: 'relative', marginTop: '10px', display: 'inline-block', borderRadius: '8px', overflow: 'hidden', border: '1px solid #E2E8F0' }}>
                <img
                  src={flyerUrl}
                  alt="Aperçu flyer"
                  style={{ maxHeight: '100px', objectFit: 'contain', display: 'block' }}
                />
                <button
                  type="button"
                  onClick={() => { setFlyerFile(null); setFlyerUrl(null); }}
                  aria-label="Supprimer l'image"
                  style={{
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    backgroundColor: '#C2410C',
                    color: '#FFFFFF',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={saving}
            style={{
              width: '100%', fontSize: '13px', marginTop: '4px',
              backgroundColor: 'var(--primary-blue)',
              boxShadow: '0 6px 20px var(--primary-blue-glow)',
            }}
          >
            <Send size={16} />
            <span>{saving ? t('abonnements.saving') : t('abonnements.save')}</span>
          </button>
        </form>
      )}

      {/* Liste des abonnements : seuil, campagne et Historique_Rappels (Req 10.5-10.8) */}
      <div className="screen-header" style={{ marginTop: '25px' }}>
        <h3 style={{
          fontSize: '14px', textTransform: 'uppercase', color: 'var(--text-secondary)',
          letterSpacing: '0.5px',
        }}>
          {t('abonnements.list_title')}
        </h3>
      </div>

      {(Array.isArray(subscriptions) ? subscriptions : []).length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '30px 20px' }}>
          <Tv size={40} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            {t('abonnements.empty')}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '15px' }}>
          {subscriptions.map((sub) => {
            const providerLabel = providerLabelById[sub.provider_id] || sub.provider_id;
            const customer = sub.customer_id ? customerById[sub.customer_id] : null;
            const history = Array.isArray(sub.reminder_history) ? sub.reminder_history : [];
            const consented = canSendMarketingCampaign(sub.marketing_consent);
            const editValue =
              thresholdEdits[sub.id] !== undefined
                ? thresholdEdits[sub.id]
                : String(sub.renewal_threshold_days ?? RENEWAL_THRESHOLD_DEFAULT_DAYS);

            return (
              <div key={sub.id} className="card" style={{ padding: '16px' }}>
                {/* En-tête : fournisseur, formule, montant, renouvellement */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div className="ledger-icon-box"><Tv size={18} /></div>
                    <div>
                      <span className="ledger-title" style={{ display: 'block' }}>
                        {providerLabel} — {sub.plan}
                      </span>
                      <span className="ledger-subtitle">
                        {customer ? customer.name : '—'}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(sub.id)}
                    className="btn btn-outline"
                    aria-label={t('common.delete') || 'Supprimer'}
                    title={t('common.delete') || 'Supprimer'}
                    style={{
                      width: '44px', height: '44px', padding: 0,
                      borderColor: 'var(--color-red)', color: 'var(--color-red)', flexShrink: 0, margin: 0,
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="form-row" style={{ marginTop: '12px', marginBottom: 0 }}>
                  <div className="stat-box">
                    <span className="stat-label">{t('abonnements.col_amount')}</span>
                    <span className="stat-value">{fmt.format(Number(sub.amount_paid) || 0)}</span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">{t('abonnements.col_renewal')}</span>
                    <span className="stat-value">{sub.renewal_date || '—'}</span>
                  </div>
                </div>

                {/* Configuration du Seuil_Relance_Abonnement (Req 10.5, 10.6) */}
                <div style={{ marginTop: '14px' }}>
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={14} /> {t('abonnements.threshold_title')}
                  </label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      max="30"
                      className="form-control"
                      style={{ maxWidth: '120px' }}
                      value={editValue}
                      onChange={(e) =>
                        setThresholdEdits((prev) => ({ ...prev, [sub.id]: e.target.value }))
                      }
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleThresholdSave(sub)}
                      style={{ fontSize: '12px', minHeight: '44px' }}
                    >
                      {t('abonnements.threshold_save')}
                    </button>
                  </div>
                </div>

                {/* Campagne marketing soumise au consentement (Req 10.7) */}
                <div style={{ marginTop: '14px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleSendCampaign(sub)}
                    disabled={!consented}
                    title={!consented ? t('abonnements.campaign_consent_required') : undefined}
                    style={{
                      fontSize: '12px', minHeight: '44px',
                      opacity: consented ? 1 : 0.5,
                    }}
                  >
                    <Megaphone size={15} />
                    <span>{t('abonnements.campaign_send')}</span>
                  </button>
                </div>

                {/* Historique_Rappels de l'abonnement (Req 10.8) */}
                <div style={{ marginTop: '16px' }}>
                  <h4 style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <BellRing size={14} /> {t('abonnements.history_title')}
                  </h4>
                  {history.length === 0 ? (
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {t('abonnements.history_empty')}
                    </p>
                  ) : (
                    <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ textAlign: 'left', color: 'var(--text-secondary)' }}>
                          <th style={{ padding: '4px 6px' }}>{t('abonnements.hist_col_date')}</th>
                          <th style={{ padding: '4px 6px' }}>{t('abonnements.hist_col_type')}</th>
                          <th style={{ padding: '4px 6px' }}>{t('abonnements.hist_col_status')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((h, idx) => {
                          const ts = h.timestamp ? new Date(h.timestamp) : null;
                          const dateStr = ts && !Number.isNaN(ts.getTime())
                            ? ts.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
                              ' ' + ts.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                            : '—';
                          return (
                            <tr key={idx} style={{ borderTop: '1px solid var(--border-color, #eee)' }}>
                              <td style={{ padding: '4px 6px' }}>{dateStr}</td>
                              <td style={{ padding: '4px 6px' }}>{h.type || '—'}</td>
                              <td style={{ padding: '4px 6px' }}>{h.result || '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
