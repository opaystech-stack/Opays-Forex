import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  ArrowLeftRight, Send, CheckCircle2, AlertCircle, Trash2, Lock,
} from 'lucide-react';
import { useT } from '../i18n';
import { TRANSFER_METHOD_OTHER } from '../utils/catalogs';
import { validateTransfer } from '../utils/transferValidation';

const fmt = new Intl.NumberFormat('fr-FR');

// Comparaison insensible à la casse et aux espaces de bord à « Autre » (Req 8.3),
// cohérente avec la détection interne de validateTransfer/catalogs.
const normalizeLabel = (label) =>
  typeof label === 'string' ? label.trim().toLowerCase() : '';
const isOtherLabel = (label) =>
  normalizeLabel(label) === normalizeLabel(TRANSFER_METHOD_OTHER);

// Écran d'enregistrement des opérations de transfert d'argent (Exigence 8).
//
// Gardé par la permission `services.vendre` (Req 8.2) et par l'activation du
// Module_Additionnel `transfert_argent` (Req 8.1). La saisie est fiabilisée par
// la fonction pure `validateTransfer` avant l'appel à `createTransfer` du
// contexte. La commission de chaque transfert alimente le bénéfice de l'Agence
// (Req 8.6), synthétisé dans l'en-tête de la liste.
export default function Transferts() {
  const t = useT();
  const {
    transfers,
    transferMethods,
    createTransfer,
    deleteTransfer,
    hasPermission,
    isModuleEnabled,
    loading,
  } = useApp();

  const [methodId, setMethodId] = useState('');
  const [amount, setAmount] = useState('');
  const [commission, setCommission] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);

  // Methodes_Transfert proposées : uniquement les entrées actives du catalogue
  // (une méthode désactivée n'est plus offerte pour une nouvelle opération — Req 9.4).
  const activeMethods = useMemo(
    () => (Array.isArray(transferMethods) ? transferMethods.filter((m) => m && m.is_active) : []),
    [transferMethods],
  );

  const selectedMethod = activeMethods.find((m) => m.id === methodId) || null;
  const showCustomLabel = isOtherLabel(selectedMethod?.label);

  // Map des libellés par identifiant pour l'affichage de l'historique, y compris
  // les méthodes désactivées ayant servi à d'anciennes opérations (Req 9.4).
  const methodLabelById = useMemo(() => {
    const map = {};
    (Array.isArray(transferMethods) ? transferMethods : []).forEach((m) => {
      if (m && m.id) map[m.id] = m.label;
    });
    return map;
  }, [transferMethods]);

  // Bénéfice agrégé : somme des commissions de tous les transferts (Req 8.6).
  const totalCommission = useMemo(
    () =>
      (Array.isArray(transfers) ? transfers : []).reduce(
        (sum, tr) => sum + (Number(tr.commission) || 0),
        0,
      ),
    [transfers],
  );

  const canSell = hasPermission('services.vendre');
  const moduleEnabled = isModuleEnabled('transfert_argent');

  const resetForm = () => {
    setMethodId('');
    setAmount('');
    setCommission('');
    setCustomLabel('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation côté écran via la logique pure partagée (Req 8.2, 8.3, 8.4, 8.5).
    const check = validateTransfer({
      amount,
      methodId,
      methodLabel: selectedMethod?.label,
      methodActive: selectedMethod?.is_active,
      customLabel,
    });
    if (!check.ok) {
      const fieldMessages = {
        methode: selectedMethod
          ? t('transferts.error_method_inactive')
          : t('transferts.error_method_required'),
        montant: t('transferts.error_amount_invalid'),
        libelle: t('transferts.error_custom_label_invalid'),
      };
      setMessage({ type: 'error', text: fieldMessages[check.field] || check.error });
      return;
    }

    setSaving(true);
    const res = await createTransfer({
      method_id: methodId,
      amount: parseFloat(amount),
      commission: parseFloat(commission) || 0,
      custom_method_label: showCustomLabel ? customLabel.trim() : null,
    });
    setSaving(false);

    if (res.success) {
      setMessage({ type: 'success', text: t('transferts.save_success') });
      resetForm();
    } else {
      setMessage({ type: 'error', text: res.error });
    }
  };

  const handleDelete = async (id) => {
    const res = await deleteTransfer(id);
    if (res.success) {
      setMessage({ type: 'success', text: t('transferts.save_success') });
    } else {
      setMessage({ type: 'error', text: res.error });
    }
  };

  if (loading) {
    return (
      <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '20px' }}>
        {t('loading.data')}
      </p>
    );
  }

  // Garde module : le Module_Additionnel `transfert_argent` doit être activé (Req 8.1).
  if (!moduleEnabled) {
    return (
      <div>
        <div className="screen-header">
          <h2 className="screen-title">{t('transferts.title')}</h2>
          <p className="screen-desc">{t('transferts.desc')}</p>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '30px 20px' }}>
          <Lock size={40} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            {t('transferts.module_disabled')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="screen-header">
        <h2 className="screen-title">{t('transferts.title')}</h2>
        <p className="screen-desc">{t('transferts.desc')}</p>
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

      {/* Garde permission : `services.vendre` requise pour enregistrer (Req 8.2). */}
      {!canSell ? (
        <div className="card" style={{ textAlign: 'center', padding: '30px 20px' }}>
          <Lock size={40} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            {t('transferts.permission_denied')}
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="card" style={{ marginBottom: '18px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '14px', color: 'var(--deep-navy)' }}>
            <ArrowLeftRight size={15} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            {t('transferts.title')}
          </h3>

          {/* Methode_Transfert (catalogue, entrées actives uniquement) */}
          <div className="form-group">
            <label className="form-label">{t('transferts.method_label')}</label>
            <select
              className="form-control"
              value={methodId}
              onChange={(e) => setMethodId(e.target.value)}
              required
            >
              <option value="">— {t('transferts.method_label')} —</option>
              {activeMethods.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Libellé personnalisé requis lorsque « Autre » est sélectionné (Req 8.3, 8.5) */}
          {showCustomLabel && (
            <div className="form-group">
              <label className="form-label">{t('transferts.custom_label_label')}</label>
              <input
                type="text"
                className="form-control"
                maxLength={60}
                placeholder={t('transferts.custom_label_placeholder')}
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                required
              />
            </div>
          )}

          {/* Montant + Commission */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('transferts.amount_label')}</label>
              <input
                type="number"
                step="any"
                min="0"
                className="form-control"
                placeholder={t('transferts.amount_placeholder')}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('transferts.commission_label')}</label>
              <input
                type="number"
                step="any"
                min="0"
                className="form-control"
                placeholder={t('transferts.commission_placeholder')}
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
              />
            </div>
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
            <span>{saving ? t('transferts.saving') : t('transferts.save')}</span>
          </button>
        </form>
      )}

      {/* Historique des transferts récents + synthèse commission (Req 8.6) */}
      <div className="screen-header" style={{ marginTop: '25px' }}>
        <h3 style={{
          fontSize: '14px', textTransform: 'uppercase', color: 'var(--text-secondary)',
          letterSpacing: '0.5px',
        }}>
          {t('transferts.list_title')}
        </h3>
      </div>

      {(Array.isArray(transfers) ? transfers : []).length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '30px 20px' }}>
          <ArrowLeftRight size={40} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            {t('transferts.empty')}
          </p>
        </div>
      ) : (
        <>
          <div className="stat-box" style={{ marginBottom: '14px' }}>
            <span className="stat-label">{t('transferts.col_commission')}</span>
            <span className="stat-value" style={{ color: 'var(--color-green)' }}>
              {fmt.format(totalCommission)}
            </span>
          </div>

          <div className="ledger-list" style={{ marginBottom: '15px' }}>
            {transfers.map((tr) => {
              const created = tr.created_at ? new Date(tr.created_at) : null;
              const dateStr = created
                ? created.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) +
                  ' ' +
                  created.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                : '—';
              const baseLabel = methodLabelById[tr.method_id] || tr.method_id;
              const label = tr.custom_method_label
                ? `${baseLabel} — ${tr.custom_method_label}`
                : baseLabel;
              return (
                <div key={tr.id} className="ledger-item">
                  <div className="ledger-left">
                    <div className="ledger-icon-box">
                      <ArrowLeftRight size={18} />
                    </div>
                    <div className="ledger-details">
                      <span className="ledger-title">{label}</span>
                      <span className="ledger-subtitle">
                        {t('transferts.col_date')}: {dateStr}
                      </span>
                    </div>
                  </div>
                  <div className="ledger-right">
                    <span className="ledger-value">
                      {fmt.format(Number(tr.amount) || 0)}
                    </span>
                    {Number(tr.commission) > 0 && (
                      <span style={{ fontSize: '11px', color: 'var(--color-green)', marginTop: '2px' }}>
                        {t('transferts.col_commission')}: {fmt.format(Number(tr.commission))}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(tr.id)}
                      aria-label={t('common.delete') || 'Supprimer'}
                      title={t('common.delete') || 'Supprimer'}
                      style={{
                        marginTop: '6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: '44px', height: '44px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                        background: 'rgba(220,38,38,0.10)', color: 'var(--color-red)',
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
