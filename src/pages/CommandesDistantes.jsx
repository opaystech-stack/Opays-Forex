import { useState, useCallback, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../services/supabase';
import { useT } from '../i18n';
import { ClipboardList, Check, X, FileText, AlertCircle, CheckCircle2, Link as LinkIcon, Copy, ExternalLink, Trash, Plus, MessageCircle } from 'lucide-react';
import { canExecuteProposal } from '../utils/agentRegistry';
import { encodeOrderLink } from '../utils/orderToken';

const REMOTE_ORDER_CONFIRM_ACTION = {
  kind: 'commande_distante.enregistrer',
  requiredPermission: 'services.vendre',
};

const PROOF_SIGNED_URL_TTL_SECONDS = 300;

/* Inline styles for the comparative layout and order cards */
const styles = {
  /* Two-column split on desktop */
  splitLayout: {
    display: 'grid',
    gridTemplateColumns: '320px 1fr',
    gap: '20px',
    alignItems: 'start',
  },
  splitLayoutMobile: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: '0',
  },
  /* Order card */
  orderCard: {
    background: '#FFFFFF',
    border: '1px solid var(--hairline)',
    borderRadius: '14px',
    padding: '16px',
    marginBottom: '12px',
    boxShadow: 'var(--elev-1)',
    transition: 'box-shadow 0.22s ease, border-color 0.22s ease',
    cursor: 'pointer',
  },
  orderCardActive: {
    borderColor: 'var(--indigo-strong)',
    boxShadow: 'var(--elev-2), 0 0 0 2px var(--indigo-soft)',
  },
  orderCardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '10px',
  },
  whatsappIcon: {
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    background: 'linear-gradient(135deg, rgba(37,211,102,0.12), rgba(37,211,102,0.04))',
    border: '1px solid rgba(37,211,102,0.18)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  orderMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    flex: 1,
    minWidth: 0,
  },
  orderId: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text-muted)',
    fontFamily: 'monospace',
  },
  orderPhone: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  /* Tabs for mobile */
  tabBar: {
    display: 'flex',
    gap: '4px',
    padding: '4px',
    background: 'var(--bg-light)',
    borderRadius: '10px',
    marginBottom: '14px',
  },
  tab: {
    flex: 1,
    padding: '10px 12px',
    fontSize: '13px',
    fontWeight: 600,
    textAlign: 'center',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    transition: 'background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease',
    background: 'transparent',
    color: 'var(--text-muted)',
  },
  tabActive: {
    background: '#FFFFFF',
    color: 'var(--text-primary)',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  /* Confirm/Reject buttons */
  btnConfirm: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '14px 20px',
    borderRadius: '12px',
    border: 'none',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    background: '#15803D',
    color: '#FFFFFF',
    flex: 1,
    transition: 'transform 0.15s ease, box-shadow 0.2s ease, background 0.18s ease',
    boxShadow: '0 2px 8px rgba(21,128,61,0.25)',
  },
  btnReject: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '14px 20px',
    borderRadius: '12px',
    border: 'none',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    background: '#DC2626',
    color: '#FFFFFF',
    flex: 1,
    transition: 'transform 0.15s ease, box-shadow 0.2s ease, background 0.18s ease',
    boxShadow: '0 2px 8px rgba(220,38,38,0.20)',
  },
  actionRow: {
    display: 'flex',
    gap: '10px',
    marginTop: '16px',
    padding: '0 2px',
  },
  /* Proof panel */
  proofPanel: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '200px',
    background: 'var(--bg-light)',
    borderRadius: '12px',
    border: '1px dashed var(--hairline-strong)',
    padding: '20px',
  },
};



export default function CommandesDistantes() {
  const t = useT();
  const {
    user,
    remoteOrders,
    updateRemoteOrderState,
    hasPermission,
    effectivePermissions,
    agencyId,
    orderLinks,
    createOrderLink,
    revokeOrderLink,
  } = useApp();

  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewUnavailable, setPreviewUnavailable] = useState(false);
  const [expiryHours, setExpiryHours] = useState('24');
  const [generatedLinkUrl, setGeneratedLinkUrl] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  // Mobile tab state for comparative view
  const [mobileTab, setMobileTab] = useState('receipt');

  const canProcess = hasPermission('services.vendre');
  const ordersToProcess = (remoteOrders || []).filter((o) => o?.state === 'à_traiter');

  // Detect mobile for layout switching
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 900);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const getFullLinkUrl = useCallback((token) => {
    const payload = encodeOrderLink({ agencyId: agencyId || 'mock-agency-id', token });
    return `${window.location.origin}/commande/${payload}`;
  }, [agencyId]);

  const handleGenerateLink = async (e) => {
    e.preventDefault();
    setError(null); setSuccess(null); setGeneratedLinkUrl('');
    const hours = expiryHours === 'never' ? null : parseInt(expiryHours, 10);
    const res = await createOrderLink(hours);
    if (res?.success && res.link) {
      setGeneratedLinkUrl(getFullLinkUrl(res.link.token));
      setSuccess(t('remote_orders.generate_success'));
    } else {
      setError(res?.error || "Échec de génération de lien");
    }
  };

  const handleCopyLink = (url) => {
    navigator.clipboard.writeText(url);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const viewProof = useCallback(async (order) => {
    setSelectedOrderId(order.id);
    setPreviewUrl(null);
    setPreviewUnavailable(false);
    if (!supabase || !order?.proof_path) { setPreviewUnavailable(true); return; }
    try {
      const { data, error: signErr } = await supabase.storage
        .from('order-proofs')
        .createSignedUrl(order.proof_path, PROOF_SIGNED_URL_TTL_SECONDS);
      if (signErr || !data?.signedUrl) { setPreviewUnavailable(true); return; }
      setPreviewUrl(data.signedUrl);
    } catch {
      setPreviewUnavailable(true);
    }
  }, []);

  const handleConfirm = useCallback(async (order) => {
    setError(null); setSuccess(null);
    const allowed = canExecuteProposal({
      action: REMOTE_ORDER_CONFIRM_ACTION,
      confirmedBy: user?.id ?? null,
      confirmerPermissions: effectivePermissions || [],
    });
    if (!allowed) { setConfirmingId(null); setError(t('remote_orders.permission_denied')); return; }
    setBusyId(order.id);
    const res = await updateRemoteOrderState(order.id, 'confirmée');
    setBusyId(null); setConfirmingId(null);
    if (res?.success) {
      setSuccess(t('remote_orders.confirm_success'));
      if (selectedOrderId === order.id) { setSelectedOrderId(null); setPreviewUrl(null); setPreviewUnavailable(false); }
    } else {
      setError(res?.error || t('remote_orders.permission_denied'));
    }
  }, [user, effectivePermissions, updateRemoteOrderState, selectedOrderId, t]);

  const handleReject = useCallback(async (order) => {
    setError(null); setSuccess(null);
    setBusyId(order.id);
    const res = await updateRemoteOrderState(order.id, 'rejetée');
    setBusyId(null); setConfirmingId(null);
    if (res?.success) {
      setSuccess('Commande rejetée.');
      if (selectedOrderId === order.id) { setSelectedOrderId(null); setPreviewUrl(null); }
    } else {
      setError(res?.error || 'Erreur lors du rejet.');
    }
  }, [updateRemoteOrderState, selectedOrderId]);

  const getLinkStatus = (link) => {
    if (link.revoked) return { label: t('remote_orders.link_revoked'), variant: 'cancelled' };
    if (link.expires_at && new Date(link.expires_at).getTime() <= Date.now()) {
      return { label: t('remote_orders.link_expired'), variant: 'expired' };
    }
    return { label: t('remote_orders.link_active'), variant: 'active' };
  };

  const formatDate = (value) => {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
  };

  // Currently selected order for comparative view
  const activeOrder = ordersToProcess.find((o) => o.id === selectedOrderId);


  return (
    <div>
      <div className="screen-header">
        <h2 className="screen-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ClipboardList size={20} color="var(--color-primary)" />
          <span>{t('remote_orders.title')}</span>
        </h2>
        <p className="screen-desc">{t('remote_orders.desc')}</p>
      </div>

      {!canProcess && (
        <div className="alert alert-info" role="alert">
          <AlertCircle size={16} />
          <span>{t('remote_orders.permission_denied')}</span>
        </div>
      )}
      {error && (
        <div className="alert alert-info" role="alert" style={{ marginBottom: '14px' }}>
          <AlertCircle size={16} /><span>{error}</span>
        </div>
      )}
      {success && (
        <div className="alert alert-success" role="status" style={{ marginBottom: '14px' }}>
          <CheckCircle2 size={16} /><span>{success}</span>
        </div>
      )}

      {canProcess && (
        <>
          {/* SECTION 1: Link generator */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <LinkIcon size={18} color="var(--color-primary)" />
              <span>{t('remote_orders.link_section_title')}</span>
            </h3>
            <form onSubmit={handleGenerateLink} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: 1, minWidth: '180px', marginBottom: 0 }}>
                <label className="form-label">{t('remote_orders.validity_label')}</label>
                <select className="form-control" value={expiryHours} onChange={(e) => setExpiryHours(e.target.value)} style={{ margin: 0 }}>
                  <option value="1">{t('remote_orders.val_1h')}</option>
                  <option value="6">{t('remote_orders.val_6h')}</option>
                  <option value="12">{t('remote_orders.val_12h')}</option>
                  <option value="24">{t('remote_orders.val_24h')}</option>
                  <option value="168">{t('remote_orders.val_7d')}</option>
                  <option value="never">{t('remote_orders.val_never')}</option>
                </select>
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: 'auto', height: '44px', margin: 0 }}>
                <Plus size={16} style={{ marginRight: '6px' }} /><span>{t('remote_orders.generate_btn')}</span>
              </button>
            </form>
            {generatedLinkUrl && (
              <div style={{ marginTop: '16px', padding: '12px', borderRadius: '12px', background: 'var(--indigo-soft)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--indigo-strong)', marginBottom: '6px' }}>Lien généré :</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input type="text" className="form-control" readOnly value={generatedLinkUrl} style={{ margin: 0, fontSize: '13px' }} />
                  <button type="button" className="btn btn-outline" onClick={() => handleCopyLink(generatedLinkUrl)} style={{ width: 'auto', padding: '10px 14px', margin: 0 }}>
                    <Copy size={15} /><span>{copySuccess ? 'Copié !' : t('remote_orders.action_copy')}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 2: Links history */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px' }}>Historique des liens</h3>
            {(!orderLinks || orderLinks.length === 0) ? (
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '10px 0' }}>Aucun lien de commande généré.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-secondary)', textAlign: 'left' }}>
                      <th style={{ padding: '8px', fontWeight: 700 }}>Création</th>
                      <th style={{ padding: '8px', fontWeight: 700 }}>Expiration</th>
                      <th style={{ padding: '8px', fontWeight: 700 }}>Statut</th>
                      <th style={{ padding: '8px', fontWeight: 700 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderLinks.map((link) => {
                      const fullUrl = getFullLinkUrl(link.token);
                      const status = getLinkStatus(link);
                      const isRevokable = !link.revoked && (!link.expires_at || new Date(link.expires_at).getTime() > Date.now());
                      return (
                        <tr key={link.id} style={{ borderTop: '1px solid var(--border-color)', verticalAlign: 'middle' }}>
                          <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>{formatDate(link.created_at)}</td>
                          <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>{link.expires_at ? formatDate(link.expires_at) : "N'expire jamais"}</td>
                          <td style={{ padding: '8px' }}><span className={`status-pill ${status.variant}`}>{status.label}</span></td>
                          <td style={{ padding: '8px' }}>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button type="button" className="btn btn-outline" onClick={() => handleCopyLink(fullUrl)} style={{ width: 'auto', padding: '6px 10px', margin: 0 }} title={t('remote_orders.action_copy')}><Copy size={13} /></button>
                              <a href={fullUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline" style={{ width: 'auto', padding: '6px 10px', margin: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} title={t('remote_orders.action_open')}><ExternalLink size={13} /></a>
                              {isRevokable && (
                                <button type="button" className="btn btn-outline" onClick={() => revokeOrderLink(link.id)} style={{ width: 'auto', padding: '6px 10px', margin: 0, borderColor: 'var(--color-red)', color: 'var(--color-red)' }} title={t('remote_orders.action_revoke')}><Trash size={13} /></button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>


          {/* SECTION 3: Order cards + Comparative view */}
          <div className="card">
            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>
              {t('remote_orders.list_title')}
            </h3>

            {ordersToProcess.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '10px 0' }}>
                {t('remote_orders.empty')}
              </p>
            ) : (
              <div style={isMobile ? styles.splitLayoutMobile : styles.splitLayout}>
                {/* LEFT COLUMN: Order cards list */}
                <div>
                  {ordersToProcess.map((order) => {
                    const isActive = selectedOrderId === order.id;
                    const badgeClass = order.ai_status === 'analyzing'
                      ? 'badge badge-neutral'
                      : 'badge badge-warning';
                    const badgeLabel = order.ai_status === 'analyzing'
                      ? 'Analyse IA en cours'
                      : 'Validation requise';

                    return (
                      <div
                        key={order.id}
                        style={{ ...styles.orderCard, ...(isActive ? styles.orderCardActive : {}) }}
                        onClick={() => { setSelectedOrderId(order.id); viewProof(order); setMobileTab('receipt'); }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter') { setSelectedOrderId(order.id); viewProof(order); setMobileTab('receipt'); } }}
                      >
                        <div style={styles.orderCardHeader}>
                          {/* WhatsApp icon */}
                          <div style={styles.whatsappIcon}>
                            <MessageCircle size={18} color="#25D366" />
                          </div>
                          <div style={styles.orderMeta}>
                            <span style={styles.orderId}>#{order.id?.slice(0, 8)}</span>
                            <span style={styles.orderPhone}>{order.customer_phone || order.customer_name || '—'}</span>
                          </div>
                          <span className={badgeClass}>{badgeLabel}</span>
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                          {order.details ? (order.details.length > 80 ? order.details.slice(0, 80) + '…' : order.details) : '—'}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                          {formatDate(order.created_at)}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* RIGHT COLUMN: Comparative view (receipt + form) */}
                <div>
                  {!activeOrder ? (
                    <div style={{ ...styles.proofPanel, minHeight: '300px' }}>
                      <FileText size={32} color="var(--text-muted)" />
                      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '10px', textAlign: 'center' }}>
                        Sélectionnez une commande pour afficher le reçu et le formulaire de validation.
                      </p>
                    </div>
                  ) : (
                    <div>
                      {/* Mobile tabs */}
                      {isMobile && (
                        <div style={styles.tabBar}>
                          <button
                            type="button"
                            style={{ ...styles.tab, ...(mobileTab === 'receipt' ? styles.tabActive : {}) }}
                            onClick={() => setMobileTab('receipt')}
                          >
                            1. Reçu WhatsApp
                          </button>
                          <button
                            type="button"
                            style={{ ...styles.tab, ...(mobileTab === 'form' ? styles.tabActive : {}) }}
                            onClick={() => setMobileTab('form')}
                          >
                            2. Formulaire
                          </button>
                        </div>
                      )}

                      {/* Comparative split layout container (2-column on desktop) */}
                      <div style={isMobile ? {} : { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'start' }}>
                        {/* Receipt panel */}
                        {(!isMobile || mobileTab === 'receipt') && (
                          <div style={{ marginBottom: 0 }}>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              Reçu WhatsApp
                            </div>
                            <div style={styles.proofPanel}>
                              {previewUnavailable ? (
                                <p style={{ fontSize: '13px', color: 'var(--color-red)', fontStyle: 'italic' }}>{t('admin.receipt_unavailable')}</p>
                              ) : previewUrl ? (
                                <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                                  <img src={previewUrl} alt="Reçu WhatsApp" style={{ maxWidth: '100%', maxHeight: '320px', borderRadius: '10px', border: '1px solid var(--hairline)' }} />
                                </a>
                              ) : activeOrder.proof_path ? (
                                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>{t('loading.skeleton')}</p>
                              ) : (
                                <div style={{ textAlign: 'center' }}>
                                  <MessageCircle size={28} color="var(--text-muted)" />
                                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px' }}>
                                    {activeOrder.details || 'Aucun reçu disponible'}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}


                        {/* Validation form panel */}
                        {(!isMobile || mobileTab === 'form') && (
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              Formulaire de validation
                            </div>
                            <div style={{ background: '#FFFFFF', border: '1px solid var(--hairline)', borderRadius: '12px', padding: '16px' }}>
                              {/* Pre-filled form fields (read-only summary) */}
                              <div className="form-group" style={{ marginBottom: '10px' }}>
                                <label className="form-label">Client</label>
                                <input className="form-control" readOnly value={activeOrder.customer_name || '—'} style={{ margin: 0 }} />
                              </div>
                              <div className="form-group" style={{ marginBottom: '10px' }}>
                                <label className="form-label">Téléphone</label>
                                <input className="form-control" readOnly value={activeOrder.customer_phone || '—'} style={{ margin: 0 }} />
                              </div>
                              <div className="form-group" style={{ marginBottom: '10px' }}>
                                <label className="form-label">Détails</label>
                                <textarea className="form-control" readOnly value={activeOrder.details || '—'} rows={3} style={{ margin: 0, resize: 'none' }} />
                              </div>
                              <div className="form-group" style={{ marginBottom: '10px' }}>
                                <label className="form-label">Date de réception</label>
                                <input className="form-control" readOnly value={formatDate(activeOrder.created_at)} style={{ margin: 0 }} />
                              </div>

                              {/* Action buttons - thumb-reachable at bottom */}
                              <div style={styles.actionRow}>
                                <button
                                  type="button"
                                  style={{
                                    ...styles.btnConfirm,
                                    ...(busyId === activeOrder.id ? { opacity: 0.7, pointerEvents: 'none' } : {}),
                                  }}
                                  onClick={() => {
                                    if (confirmingId === activeOrder.id) {
                                      handleConfirm(activeOrder);
                                    } else {
                                      setConfirmingId(activeOrder.id);
                                      setError(null); setSuccess(null);
                                    }
                                  }}
                                  onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
                                  onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                                  disabled={busyId === activeOrder.id}
                                >
                                  <Check size={16} />
                                  <span>{confirmingId === activeOrder.id ? 'Confirmer ?' : 'Confirmer la transaction'}</span>
                                </button>
                                <button
                                  type="button"
                                  style={{
                                    ...styles.btnReject,
                                    ...(busyId === activeOrder.id ? { opacity: 0.7, pointerEvents: 'none' } : {}),
                                  }}
                                  onClick={() => handleReject(activeOrder)}
                                  onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
                                  onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                                  disabled={busyId === activeOrder.id}
                                >
                                  <X size={16} />
                                  <span>Rejeter</span>
                                </button>
                              </div>
                              {confirmingId === activeOrder.id && (
                                <p style={{ fontSize: '11px', color: 'var(--color-orange)', marginTop: '8px', textAlign: 'center' }}>
                                  ⚠️ Cliquez à nouveau sur « Confirmer ? » pour valider définitivement.
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
