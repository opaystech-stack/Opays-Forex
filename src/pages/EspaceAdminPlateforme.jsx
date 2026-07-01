import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  Building2, CheckCircle2, AlertCircle, Lock, Plus, Check, X,
  Power, Pencil, Save, ChevronRight, Sliders,
} from 'lucide-react';
import { useT } from '../i18n';
import { countAgenciesByState } from '../utils/agencyStats';
import { ADDITIONAL_MODULES } from '../utils/moduleEntitlements';
import { isValidCatalogLabel, isDeletableMethod } from '../utils/catalogs';
import { hasDebugDemo } from '../utils/debugDemo';

// Espace_Administration_Plateforme — réservé à l'Editeur_Plateforme (Exigences 4, 5, 9, 11).
//
// Cet écran central de super-administration permet à l'Editeur_Plateforme :
//   - d'accorder ou révoquer les Droits_Module (Module_Additionnel) de chaque
//     Agence (Req 4.2, 4.4, 4.5, 4.6, 4.9) ;
//   - de lister toutes les Agences et d'en suspendre ou réactiver le cycle de
//     vie (Req 5.1, 5.3) ;
//   - d'administrer les catalogues de référence — Catalogue_Methodes_Transfert
//     et Catalogue_Fournisseurs_Abonnement (Req 9.2, 11.2) ;
//   - de consulter la statistique du nombre d'Agences par Etat_Agence (Req 5.8).
//
// La page entière est gardée par le rôle Editeur_Plateforme (Req 4.7, 5.5, 9.6,
// 11.7) : la garde côté React est une commodité UX, l'autorité finale restant la
// RLS PostgreSQL (les actions du contexte sont elles aussi gardées). La logique
// pure est déléguée à `agencyStats.js`, `moduleEntitlements.js` et `catalogs.js`.

const normalizeLabel = (label) =>
  typeof label === 'string' ? label.trim().toLowerCase() : '';

// Détermine si un libellé candidat est un doublon d'un libellé existant, afin de
// présenter un message distinct du libellé hors bornes (Req 9.5, 11.6).
const isDuplicateLabel = (label, existingLabels) =>
  existingLabels.some((candidate) => normalizeLabel(candidate) === normalizeLabel(label));

export default function EspaceAdminPlateforme({ activeTab }) {
  const t = useT();
  const {
    profilAcces,
    user,
    loading,
    platformAgencies,
    platformModuleEntitlements,
    setModuleEntitlement,
    setAgencyState,
    transferMethods,
    subscriptionProviders,
    createTransferMethod,
    updateTransferMethod,
    createSubscriptionProvider,
    updateSubscriptionProvider,
  } = useApp();

  const [message, setMessage] = useState(null);
  const [newMethodLabel, setNewMethodLabel] = useState('');
  const [newProviderLabel, setNewProviderLabel] = useState('');
  // Édition inline d'un libellé de catalogue : { kind: 'method'|'provider', id, label }.
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  // Garde de page : réservé à l'Editeur_Plateforme (Req 4.7, 5.5). Le mode démo
  // est autorisé à explorer l'écran (les actions du contexte tolèrent `isDemo`).
  // `hasDebugDemo()` aligne la garde interne sur la garde de route
  // `PlatformEditorRoute` : l'ouverture via `?debug_force_demo` est honorée dès
  // le premier rendu, avant que l'auto-connexion asynchrone ne positionne
  // `user.isDemo` (Req 2.1).
  const isPlatformEditor =
    Boolean(profilAcces?.is_platform_editor) || Boolean(user?.isDemo) || hasDebugDemo();

  const agencies = useMemo(
    () => (Array.isArray(platformAgencies) ? platformAgencies : []),
    [platformAgencies],
  );

  // Statistique du nombre d'Agences par Etat_Agence (Req 5.8) — logique pure.
  const stats = useMemo(() => countAgenciesByState(agencies), [agencies]);

  const methods = useMemo(
    () => (Array.isArray(transferMethods) ? transferMethods : []),
    [transferMethods],
  );
  const providers = useMemo(
    () => (Array.isArray(subscriptionProviders) ? subscriptionProviders : []),
    [subscriptionProviders],
  );

  const showMessage = (type, text) => setMessage({ type, text });

  const showStats = !activeTab || activeTab === 'stats';
  const showAgencies = !activeTab || activeTab === 'agencies';
  const showCatalogs = !activeTab || activeTab === 'catalogs';

  // ---- Droits_Module : accorder / révoquer (Req 4.2, 4.4, 4.5, 4.9) ----
  const handleToggleModule = async (agency, moduleKey, currentlyGranted) => {
    if (busy) return;
    setBusy(true);
    const res = await setModuleEntitlement(agency.id, moduleKey, !currentlyGranted);
    setBusy(false);
    if (res?.success) {
      showMessage(
        'success',
        currentlyGranted ? t('platform_admin.module_revoked_success') : t('platform_admin.module_granted_success'),
      );
    } else {
      showMessage('error', res?.error || t('platform_admin.error_permission'));
    }
  };

  // ---- Cycle de vie d'une Agence : suspendre / réactiver (Req 5.1, 5.3) ----
  const handleToggleAgencyState = async (agency) => {
    if (busy) return;
    const nextState = agency.state === 'active' ? 'suspendue' : 'active';
    const confirmText =
      nextState === 'suspendue'
        ? t('platform_admin.suspend_confirm')
        : t('platform_admin.reactivate_confirm');
    if (typeof window !== 'undefined' && !window.confirm(confirmText)) return;

    setBusy(true);
    const res = await setAgencyState(agency.id, nextState);
    setBusy(false);
    if (res?.success) {
      showMessage(
        'success',
        nextState === 'suspendue'
          ? t('platform_admin.agency_suspended_success')
          : t('platform_admin.agency_reactivated_success'),
      );
    } else {
      showMessage('error', res?.error || t('platform_admin.error_permission'));
    }
  };

  // ---- Catalogues : ajout d'une entrée (Req 9.2, 9.3, 11.2, 11.4) ----
  const handleAdd = async (kind) => {
    if (busy) return;
    const isMethod = kind === 'method';
    const rawLabel = isMethod ? newMethodLabel : newProviderLabel;
    const existingLabels = (isMethod ? methods : providers).map((e) => e.label);

    const check = isValidCatalogLabel(rawLabel, existingLabels);
    if (!check.ok) {
      showMessage(
        'error',
        isDuplicateLabel(rawLabel, existingLabels)
          ? t('platform_admin.error_label_duplicate')
          : t('platform_admin.error_label_invalid'),
      );
      return;
    }

    setBusy(true);
    const label = rawLabel.trim();
    const res = isMethod
      ? await createTransferMethod({ label })
      : await createSubscriptionProvider({ label });
    setBusy(false);

    if (res?.success) {
      if (isMethod) setNewMethodLabel('');
      else setNewProviderLabel('');
      showMessage('success', t('platform_admin.save'));
    } else {
      showMessage('error', res?.error || t('platform_admin.error_permission'));
    }
  };

  // ---- Catalogues : activer / désactiver une entrée (Req 9.4, 11.5) ----
  const handleToggleActive = async (kind, entry) => {
    if (busy) return;
    setBusy(true);
    const updates = { is_active: !entry.is_active };
    const res =
      kind === 'method'
        ? await updateTransferMethod(entry.id, updates)
        : await updateSubscriptionProvider(entry.id, updates);
    setBusy(false);
    if (res?.success) {
      showMessage('success', t('platform_admin.save'));
    } else {
      showMessage('error', res?.error || t('platform_admin.error_permission'));
    }
  };

  // ---- Catalogues : modifier le libellé d'une entrée (Req 9.2, 9.5, 11.2, 11.6) ----
  const handleSaveEdit = async () => {
    if (busy || !editing) return;
    const isMethod = editing.kind === 'method';
    const list = isMethod ? methods : providers;
    // Unicité : on exclut l'entrée éditée du jeu de libellés comparés.
    const existingLabels = list
      .filter((e) => e.id !== editing.id)
      .map((e) => e.label);

    const check = isValidCatalogLabel(editing.label, existingLabels);
    if (!check.ok) {
      showMessage(
        'error',
        isDuplicateLabel(editing.label, existingLabels)
          ? t('platform_admin.error_label_duplicate')
          : t('platform_admin.error_label_invalid'),
      );
      return;
    }

    setBusy(true);
    const label = editing.label.trim();
    const res = isMethod
      ? await updateTransferMethod(editing.id, { label })
      : await updateSubscriptionProvider(editing.id, { label });
    setBusy(false);

    if (res?.success) {
      setEditing(null);
      showMessage('success', t('platform_admin.save'));
    } else {
      showMessage('error', res?.error || t('platform_admin.error_permission'));
    }
  };

  if (loading) {
    return (
      <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '20px' }}>
        {t('loading.data')}
      </p>
    );
  }

  // Refus d'accès pour tout Utilisateur dépourvu du rôle Editeur_Plateforme
  // (Req 4.7, 5.5, 9.6, 11.7).
  if (!isPlatformEditor) {
    return (
      <div>
        <div className="screen-header">
          <h2 className="screen-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders size={20} color="var(--color-primary)" />
            <span>{t('platform_admin.title')}</span>
          </h2>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '30px 20px' }}>
          <Lock size={40} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            {t('platform_admin.permission_denied')}
          </p>
        </div>
      </div>
    );
  }

  const renderCatalogSection = (kind, title, list, newLabel, setNewLabel, addLabel) => (
    <div className="card" style={{ marginBottom: '16px' }}>
      <h3 className="dash-section-title" style={{ marginBottom: '12px' }}>
        {title}
      </h3>

      {/* Formulaire d'ajout d'une entrée de catalogue */}
      <div className="form-row" style={{ alignItems: 'flex-end', marginBottom: '14px' }}>
        <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
          <label className="form-label">{t('platform_admin.label_label')}</label>
          <input
            type="text"
            className="form-control"
            maxLength={60}
            placeholder={t('platform_admin.label_placeholder')}
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          style={{ width: 'auto', padding: '0 16px', height: '44px', whiteSpace: 'nowrap' }}
          onClick={() => handleAdd(kind)}
        >
          <Plus size={16} />
          <span>{addLabel}</span>
        </button>
      </div>

      {list.length === 0 ? (
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>—</p>
      ) : (
        <div className="ledger-list">
          {list.map((entry) => {
            const isEditingThis = editing && editing.kind === kind && editing.id === entry.id;
            // 'Autre' du Catalogue_Methodes_Transfert est permanent : ni édition ni
            // désactivation (Req 9.1, 9.7).
            const locked = kind === 'method' && !isDeletableMethod(entry.label);
            return (
              <div key={entry.id} className="ledger-item">
                <div className="ledger-left" style={{ flex: 1 }}>
                  <div className="ledger-icon-box" style={{ background: 'var(--indigo-soft)', color: 'var(--indigo-strong)' }}>
                    <ChevronRight size={18} />
                  </div>
                  <div className="ledger-details" style={{ flex: 1 }}>
                    {isEditingThis ? (
                      <input
                        type="text"
                        className="form-control"
                        maxLength={60}
                        value={editing.label}
                        onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                        style={{ maxWidth: '260px' }}
                      />
                    ) : (
                      <span className="ledger-title">{entry.label}</span>
                    )}
                    <span className={`badge ${entry.is_active ? 'badge-success' : 'badge-danger'}`}>
                      {entry.is_active
                        ? t('platform_admin.active_badge')
                        : t('platform_admin.inactive_badge')}
                    </span>
                  </div>
                </div>
                <div className="ledger-right" style={{ flexDirection: 'row', gap: '6px', alignItems: 'center' }}>
                  {isEditingThis ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-outline"
                        disabled={busy}
                        style={{ width: 'auto', padding: '8px 10px', margin: 0 }}
                        onClick={handleSaveEdit}
                        aria-label={t('platform_admin.save')}
                      >
                        <Save size={15} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{ width: 'auto', padding: '8px 10px', margin: 0 }}
                        onClick={() => setEditing(null)}
                        aria-label={t('platform_admin.cancel')}
                      >
                        <X size={15} />
                      </button>
                    </>
                  ) : (
                    !locked && (
                      <>
                        <button
                          type="button"
                          className="btn btn-outline"
                          style={{ width: 'auto', padding: '8px 10px', margin: 0 }}
                          onClick={() => setEditing({ kind, id: entry.id, label: entry.label })}
                          aria-label={t('platform_admin.edit')}
                          title={t('platform_admin.edit')}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline"
                          disabled={busy}
                          style={{
                            width: 'auto', padding: '8px 10px', margin: 0,
                            borderColor: entry.is_active ? 'var(--color-red)' : 'var(--color-green)',
                            color: entry.is_active ? 'var(--color-red)' : 'var(--color-green)',
                          }}
                          onClick={() => handleToggleActive(kind, entry)}
                        >
                          <Power size={15} />
                          <span>
                            {entry.is_active
                              ? t('platform_admin.deactivate')
                              : t('platform_admin.activate')}
                          </span>
                        </button>
                      </>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <div className="screen-header">
        <h2 className="screen-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sliders size={20} color="var(--color-primary)" />
          <span>{t('platform_admin.title')}</span>
        </h2>
        <p className="screen-desc">{t('platform_admin.desc')}</p>
      </div>

      {message && (
        <div
          className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-info'}`}
          role="alert"
          style={{ marginBottom: '14px' }}
        >
          {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Statistique des Agences par Etat_Agence (Req 5.8) */}
      {showStats && (
        <>
          <h3 className="dash-section-title" style={{ marginBottom: '12px' }}>
            {t('platform_admin.stats_title')}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '18px' }}>
            <div className="kpi-card stat-box">
              <div className="kpi-card__head">
                <span className="kpi-icon" style={{ background: 'color-mix(in srgb, var(--color-green) 10%, var(--card-bg))', color: 'var(--color-green)' }}><CheckCircle2 size={17} /></span>
                <span className="kpi-label stat-label">{t('platform_admin.stats_active')}</span>
              </div>
              <div className="kpi-value stat-value" style={{ color: 'var(--color-green)' }}>{stats.active}</div>
            </div>
            <div className="kpi-card stat-box">
              <div className="kpi-card__head">
                <span className="kpi-icon" style={{ background: '#FEF2F2', color: 'var(--color-red)' }}><AlertCircle size={17} /></span>
                <span className="kpi-label stat-label">{t('platform_admin.stats_suspended')}</span>
              </div>
              <div className="kpi-value stat-value" style={{ color: 'var(--color-red)' }}>{stats.suspendue}</div>
            </div>
            <div className="kpi-card stat-box">
              <div className="kpi-card__head">
                <span className="kpi-icon"><Building2 size={17} /></span>
                <span className="kpi-label stat-label">{t('platform_admin.stats_total')}</span>
              </div>
              <div className="kpi-value stat-value">{stats.total}</div>

      {/* Stats globales enrichies */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px", marginBottom: "20px" }}>
        <div className="card" style={{ padding: "14px" }}>
          <div style={{ fontSize: "11px", color: "#6b7280", fontWeight: 500 }}>Portefeuilles</div>
          <div style={{ fontSize: "22px", fontWeight: 700, color: "#4F46E5" }}>{(wallets || []).length}</div>
        </div>
        <div className="card" style={{ padding: "14px" }}>
          <div style={{ fontSize: "11px", color: "#6b7280", fontWeight: 500 }}>Transactions</div>
          <div style={{ fontSize: "22px", fontWeight: 700, color: "#0E7490" }}>{(transactions || []).length}</div>
        </div>
        <div className="card" style={{ padding: "14px" }}>
          <div style={{ fontSize: "11px", color: "#6b7280", fontWeight: 500 }}>Employes</div>
          <div style={{ fontSize: "22px", fontWeight: 700, color: "#7C3AED" }}>{(employees || []).length}</div>
        </div>
      </div>
            </div>
          </div>
        </>
      )}

      {/* Liste des Agences : identifiant, propriétaire, état, Droits_Module, actions (Req 5.1) */}
      {showAgencies && (
        <div className="card" style={{ marginBottom: '24px', border: 'none', background: 'none', boxShadow: 'none', padding: 0 }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Building2 size={18} style={{ color: 'var(--indigo-strong)' }} />
            <span>{t('platform_admin.agencies_title')}</span>
          </h3>

          {agencies.length === 0 ? (
            <div className="card" style={{ padding: '24px', textAlign: 'center' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic', margin: 0 }}>—</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {agencies.map((agency) => {
                const ents = platformModuleEntitlements?.[agency.id] || {};
                const isActive = agency.state === 'active';
                return (
                  <div
                    key={agency.id}
                    className="card"
                    style={{
                      padding: '16px',
                      border: '1px solid transparent',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', gap: '12px', minWidth: 0 }}>
                        <span className="dash-client__avatar" style={{ width: '40px', height: '40px', fontSize: '15px', flexShrink: 0 }}>
                          {(agency.name || agency.id || '?').slice(0, 1).toUpperCase()}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {agency.name || agency.id}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', wordBreak: 'break-all' }}>
                            {t('platform_admin.col_id')}: {agency.id}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', wordBreak: 'break-all' }}>
                            {t('platform_admin.col_owner')}: {agency.owner_id || '—'}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                        <span className={`badge ${isActive ? 'badge-success' : 'badge-danger'}`}>
                          {isActive
                            ? t('platform_admin.state_active')
                            : t('platform_admin.state_suspendue')}
                        </span>
                        <button
                          type="button"
                          className="btn btn-outline"
                          disabled={busy}
                          style={{
                            width: 'auto', padding: '6px 12px', margin: 0,
                            borderColor: isActive ? 'var(--color-red)' : 'var(--color-green)',
                            color: isActive ? 'var(--color-red)' : 'var(--color-green)',
                          }}
                          onClick={() => handleToggleAgencyState(agency)}
                        >
                          <Power size={14} style={{ marginRight: '4px' }} />
                          <span>
                            {isActive
                              ? t('platform_admin.suspend')
                              : t('platform_admin.reactivate')}
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Droits_Module accordés/révoqués par Module_Additionnel (Req 4.2) */}
                    <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                        {t('platform_admin.col_modules')}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {ADDITIONAL_MODULES.map((moduleKey) => {
                          const granted = ents?.[moduleKey] === true;
                          return (
                            <button
                              key={moduleKey}
                              type="button"
                              disabled={busy}
                              onClick={() => handleToggleModule(agency, moduleKey, granted)}
                              className="btn btn-outline"
                              style={{
                                width: 'auto', margin: 0, padding: '6px 12px',
                                display: 'inline-flex', alignItems: 'center', gap: '6px',
                                borderColor: granted ? 'var(--color-green)' : 'var(--border-color)',
                                color: granted ? 'var(--color-green)' : 'var(--text-secondary)',
                              }}
                              title={granted ? t('platform_admin.revoke') : t('platform_admin.grant')}
                            >
                              {granted ? <Check size={14} /> : <X size={14} />}
                              <span>{t(`platform_admin.module_${moduleKey}`)}</span>
                              <span style={{ opacity: 0.7 }}>
                                · {granted ? t('platform_admin.revoke') : t('platform_admin.grant')}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Catalogues de référence administrables (Req 9.2, 11.2) */}
      {showCatalogs && (
        <>
          <div className="screen-header" style={{ marginTop: '16px', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '14px', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px', margin: 0 }}>
              {t('platform_admin.catalogs_title')}
            </h3>
          </div>

          {renderCatalogSection(
            'method',
            t('platform_admin.transfer_methods_title'),
            methods,
            newMethodLabel,
            setNewMethodLabel,
            t('platform_admin.add_method'),
          )}

          {renderCatalogSection(
            'provider',
            t('platform_admin.providers_title'),
            providers,
            newProviderLabel,
            setNewProviderLabel,
            t('platform_admin.add_provider'),
          )}
        </>
      )}
    </div>
  );
}
