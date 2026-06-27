import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Check, CheckCircle2, AlertCircle, Upload, ArrowLeft } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useT } from '../i18n';
import { getConfiguredMethods, readPaymentConfig, isCopyable } from '../utils/paymentConfig';
import { ACCEPTED_MODES } from '../utils/paymentProof';
import StandalonePage from '../components/StandalonePage';

// Délai d'affichage de la confirmation de copie (R4.6 : 2 à 5 s).
const COPY_CONFIRM_MS = 2500;

// Associe le code de validation/erreur retourné à une clé i18n (R5.3–R5.6, R5.7).
const ERROR_CODE_TO_KEY = {
  missing_receipt: 'payment.error_missing_receipt',
  invalid_format: 'payment.error_invalid_format',
  invalid_size: 'payment.error_invalid_size',
  invalid_mode: 'payment.error_invalid_mode',
  error_upload: 'payment.error_upload',
};

export default function Paiement() {
  const { submitPaymentProof, profilAcces, user } = useApp();
  const t = useT();
  const navigate = useNavigate();

  // Coordonnées_Paiement configurées (build-time VITE_PAY_*), filtrées (R4.9/R4.10).
  const { methods, anyConfigured } = useMemo(
    () => getConfiguredMethods(readPaymentConfig(import.meta.env)),
    []
  );

  // Modes disponibles dans le sélecteur : modes configurés, sinon tous les modes acceptés.
  const availableModes = useMemo(() => {
    const configured = [...new Set(methods.map((m) => m.kind))];
    return configured.length > 0 ? configured : ACCEPTED_MODES;
  }, [methods]);

  // État de copie : clé du moyen copié + indicateur d'erreur de copie (R4.6/R4.7).
  const [copiedKey, setCopiedKey] = useState(null);
  const [copyErrorKey, setCopyErrorKey] = useState(null);
  const copyTimerRef = useRef(null);

  // Formulaire de preuve.
  const [mode, setMode] = useState(availableModes[0] || '');
  const [reference, setReference] = useState('');
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleCopy = async (key, address) => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    setCopyErrorKey(null);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(address);
      // Confirmation visuelle pendant 2 à 5 s (R4.6).
      setCopiedKey(key);
      copyTimerRef.current = setTimeout(() => setCopiedKey(null), COPY_CONFIRM_MS);
    } catch {
      // Échec de copie : message « copier manuellement », adresse conservée (R4.7).
      setCopiedKey(null);
      setCopyErrorKey(key);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);

    setSubmitting(true);
    const res = await submitPaymentProof({ mode, reference, file });
    setSubmitting(false);

    if (res.success) {
      // Confirmation de réception (R5.9).
      setMessage({ type: 'success', text: t('payment.success') });
      setReference('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Refus : message correspondant au code (R5.3–R5.6, R5.7).
    const key = ERROR_CODE_TO_KEY[res.code];
    setMessage({ type: 'error', text: key ? t(key) : res.error || t('payment.error_upload') });
  };

  const methodLabel = (kind) => t(`payment.method_${kind}`);

  const getIcon = (kind) => {
    switch (kind) {
      case 'bitcoin':
        return (
          <div className="method-icon method-icon--btc">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11.767 19.089c4.924.868 6.14-6.025 1.216-6.894m-1.216 6.894L5.86 18.047m5.908 1.042-.347 1.97m1.563-8.864c4.924.869 6.14-6.025 1.215-6.893m-1.215 6.893-3.94-.694m5.155-6.2L8.29 4.26m5.908 1.042.348-1.97M7.48 16.793l-1.86-11.04"/></svg>
          </div>
        );
      case 'lightning':
        return (
          <div className="method-icon method-icon--ln">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          </div>
        );
      case 'usdt':
        return (
          <div className="method-icon method-icon--usdt">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></svg>
          </div>
        );
      default: // mobile_money
        return (
          <div className="method-icon method-icon--mm">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="M2 10h20"/></svg>
          </div>
        );
    }
  };

  const getNetworkLabel = (m) => {
    if (m.kind === 'bitcoin') return 'BTC on-chain';
    if (m.kind === 'lightning') return 'LN Invoice';
    if (m.kind === 'usdt') return m.network || 'TRC-20';
    return m.label || m.currency || 'MTN / Airtel';
  };

  return (
    <StandalonePage>
      <style>{`
        .pay-container {
          max-width: 640px;
          margin: 0 auto;
          padding: 0;
        }
        .pay-back-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 14px;
          font-weight: 600;
          color: var(--indigo-strong);
          text-decoration: none;
          margin-bottom: 24px;
          background: transparent;
          border: none;
          cursor: pointer;
          transition: color 0.15s ease;
        }
        .pay-back-link:hover { color: var(--indigo-deep); }
        
        .methods-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 32px;
        }
        @media (max-width: 560px) {
          .methods-grid { grid-template-columns: 1fr; }
        }
        .method-card {
          background: #FFFFFF;
          border: 1px solid var(--border-color);
          border-radius: 18px;
          padding: 20px;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05), 0 8px 24px rgba(15, 23, 42, 0.06);
          transition: box-shadow 0.22s ease, transform 0.22s ease;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .method-card:hover {
          box-shadow: 0 2px 6px rgba(15, 23, 42, 0.07), 0 16px 40px rgba(15, 23, 42, 0.11);
          transform: translateY(-1px);
        }
        .method-card-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }
        .method-icon {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          border: 1px solid rgba(0,0,0,0.06);
          box-shadow: 0 2px 8px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
        }
        .method-icon svg { width: 20px; height: 20px; }
        .method-icon--btc {
          background: linear-gradient(135deg, rgba(247,147,26,0.15), rgba(255,200,0,0.12));
          border-color: rgba(247,147,26,0.2);
        }
        .method-icon--btc svg { color: #f7931a; }
        .method-icon--ln {
          background: linear-gradient(135deg, rgba(247,147,26,0.12), rgba(255,220,50,0.12));
          border-color: rgba(247,147,26,0.18);
        }
        .method-icon--ln svg { color: #f7931a; }
        .method-icon--usdt {
          background: linear-gradient(135deg, rgba(38,161,123,0.12), rgba(80,200,120,0.10));
          border-color: rgba(38,161,123,0.18);
        }
        .method-icon--usdt svg { color: #26a17b; }
        .method-icon--mm {
          background: linear-gradient(135deg, rgba(79,70,229,0.12), rgba(99,102,241,0.10));
          border-color: rgba(79,70,229,0.18);
        }
        .method-icon--mm svg { color: var(--indigo-strong); }
        
        .method-name {
          font-weight: 700;
          font-size: 15px;
          color: var(--text-primary);
          font-family: 'Space Grotesk', sans-serif;
        }
        .method-network {
          font-size: 11px;
          color: var(--text-muted);
          margin-top: 2px;
        }
        
        .address-block {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 12px;
        }
        .address-text {
          flex: 1;
          min-width: 0;
          font-family: monospace;
          font-size: 12px;
          color: var(--text-primary);
          background: var(--bg-light);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 8px 10px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          user-select: all;
          outline: none;
        }
        
        .copy-btn {
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-family: 'Inter', sans-serif;
          font-size: 12px;
          font-weight: 600;
          padding: 8px 14px;
          border: none;
          border-radius: 8px;
          background: var(--indigo-strong);
          color: #ffffff;
          cursor: pointer;
          transition: background 0.15s ease, transform 0.1s ease;
        }
        .copy-btn:hover { background: var(--indigo-deep); }
        .copy-btn:active { transform: scale(0.97); }
        .copy-btn.copied {
          background: var(--color-green);
        }
        .copy-btn svg { width: 14px; height: 14px; }
        
        /* Steps timeline */
        .steps-section { margin-bottom: 40px; }
        .steps-list {
          list-style: none;
          position: relative;
          padding-left: 0;
          margin-top: 20px;
        }
        .step-item {
          display: flex;
          gap: 16px;
          position: relative;
          padding-bottom: 24px;
        }
        .step-item:last-child { padding-bottom: 0; }
        .step-item:not(:last-child)::after {
          content: '';
          position: absolute;
          left: 17px;
          top: 38px;
          bottom: 0;
          width: 2px;
          background: var(--border-color);
        }
        .step-number {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: var(--indigo-strong);
          color: #ffffff;
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 700;
          font-size: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          position: relative;
          z-index: 1;
        }
        .step-text {
          font-size: 14px;
          color: var(--text-secondary);
          padding-top: 6px;
          line-height: 1.5;
        }
        
        /* Form */
        .form-card {
          background: #FFFFFF;
          border: 1px solid var(--border-color);
          border-radius: 18px;
          padding: 24px;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05), 0 8px 24px rgba(15, 23, 42, 0.06);
        }
        
        .form-file-wrapper {
          position: relative;
          border: 2px dashed var(--border-color);
          border-radius: 12px;
          padding: 20px;
          text-align: center;
          cursor: pointer;
          background: var(--bg-light);
          transition: border-color 0.15s ease, background 0.15s ease;
        }
        .form-file-wrapper:hover {
          border-color: var(--indigo-strong);
          background: rgba(99, 102, 241, 0.04);
        }
        .form-file-wrapper input[type="file"] {
          position: absolute;
          inset: 0;
          opacity: 0;
          cursor: pointer;
        }
        .form-file-label {
          font-size: 13px;
          color: var(--text-secondary);
        }
        .form-file-label strong { color: var(--indigo-strong); }
        
        .submit-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          font-family: 'Inter', sans-serif;
          font-size: 15px;
          font-weight: 600;
          padding: 14px 24px;
          border: none;
          border-radius: 9999px;
          background: var(--indigo-strong);
          color: #ffffff;
          cursor: pointer;
          transition: background 0.15s ease, transform 0.1s ease;
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.2);
        }
        .submit-btn:hover { background: var(--indigo-deep); }
        .submit-btn:active { transform: scale(0.98); }
        .submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }
        .spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
      `}</style>

      <div className="pay-container">
        {/* Back Link */}
        <button
          type="button"
          className="pay-back-link"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft size={16} />
          <span>Retour</span>
        </button>

        {/* Header */}
        <div className="screen-header">
          <h2 className="screen-title">{t('payment.title')}</h2>
          <p className="screen-desc">{t('payment.subtitle')}</p>
        </div>

        {/* Administration link (if eligible) */}
        {(Boolean(profilAcces?.is_platform_editor) || Boolean(user?.isDemo)) && (
          <div style={{ marginBottom: '24px' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => navigate('/admin-plateforme')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', width: 'auto', margin: 0 }}
            >
              <span>Administration Plateforme</span>
            </button>
          </div>
        )}

        {/* Payment methods section */}
        <section style={{ marginBottom: '32px' }}>
          <h3 className="section-title" style={{ fontSize: '18px', marginBottom: '16px' }}>Moyens de paiement</h3>
          
          {!anyConfigured ? (
            <div className="card glass-card" style={{ textAlign: 'center', padding: '30px 20px' }}>
              <AlertCircle size={40} color="var(--color-orange)" style={{ margin: '0 auto 12px' }} />
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                {t('payment.no_methods')}
              </p>
            </div>
          ) : (
            <div className="methods-grid">
              {methods.map((m, idx) => {
                const key = `${m.kind}-${idx}`;
                const showCopy = isCopyable(m.address);
                return (
                  <div key={key} className="method-card">
                    <div>
                      <div className="method-card-header">
                        {getIcon(m.kind)}
                        <div>
                          <div className="method-name">{methodLabel(m.kind)}</div>
                          <div className="method-network">{getNetworkLabel(m)}</div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="address-block">
                      <input
                        type="text"
                        className="address-text"
                        value={m.address}
                        readOnly
                        onFocus={(e) => e.target.select()}
                      />
                      {showCopy && (
                        <button
                          type="button"
                          className={`copy-btn ${copiedKey === key ? 'copied' : ''}`}
                          onClick={() => handleCopy(key, m.address)}
                          aria-label={t('payment.copy')}
                        >
                          {copiedKey === key ? <Check size={14} /> : <Copy size={14} />}
                          <span>{copiedKey === key ? 'Copié !' : 'Copier'}</span>
                        </button>
                      )}
                    </div>
                    {copyErrorKey === key && (
                      <div style={{ fontSize: '11px', color: 'var(--color-red)', marginTop: '4px' }}>
                        {t('payment.copy_error')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Steps Procedure */}
        <section className="steps-section">
          <h3 className="section-title" style={{ fontSize: '18px', marginBottom: '16px' }}>Procédure</h3>
          <ol className="steps-list">
            <li className="step-item">
              <div className="step-number">1</div>
              <div className="step-text">Choisissez votre moyen de paiement ci-dessus et copiez l'adresse ou le numéro.</div>
            </li>
            <li className="step-item">
              <div className="step-number">2</div>
              <div className="step-text">Effectuez le transfert via votre portefeuille ou application mobile.</div>
            </li>
            <li className="step-item">
              <div className="step-number">3</div>
              <div className="step-text">Prenez une capture d'écran de la confirmation de transaction.</div>
            </li>
            <li className="step-item">
              <div className="step-number">4</div>
              <div className="step-text">Remplissez le formulaire ci-dessous avec la référence et la preuve.</div>
            </li>
            <li className="step-item">
              <div className="step-number">5</div>
              <div className="step-text">Envoyez — vous recevrez une confirmation sous 24 h.</div>
            </li>
          </ol>
        </section>

        {/* Form Submission */}
        <section style={{ marginBottom: '32px' }}>
          <h3 className="section-title" style={{ fontSize: '18px', marginBottom: '16px' }}>Soumettre votre preuve</h3>
          
          {message && (
            <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-error'}`} style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', borderRadius: '10px',
              marginBottom: '16px', fontSize: '13px', background: message.type === 'success' ? 'rgba(21, 128, 61, 0.1)' : 'rgba(220, 38, 38, 0.1)',
              color: message.type === 'success' ? 'var(--color-green)' : 'var(--color-red)',
              border: `1px solid ${message.type === 'success' ? 'rgba(21, 128, 61, 0.2)' : 'rgba(220, 38, 38, 0.2)'}`
            }}>
              {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{message.text}</span>
            </div>
          )}

          <div className="form-card">
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Mode de paiement</label>
                <select
                  className="form-control"
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                >
                  {availableModes.map((k) => (
                    <option key={k} value={k}>{methodLabel(k)}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Référence de transaction</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder={t('payment.reference_placeholder')}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Preuve (capture d'écran ou PDF)</label>
                <div className="form-file-wrapper">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,application/pdf"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  <div className="form-file-label">
                    {file ? (
                      <strong>{file.name}</strong>
                    ) : (
                      <span><strong>Cliquez</strong> ou glissez un fichier ici</span>
                    )}
                  </div>
                </div>
              </div>

              <button type="submit" className="submit-btn" disabled={submitting}>
                {submitting ? (
                  <>
                    <span className="spinner"></span>
                    <span>Envoi en cours…</span>
                  </>
                ) : (
                  <>
                    <Upload size={16} />
                    <span>Envoyer la preuve</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </section>
      </div>
    </StandalonePage>
  );
}
