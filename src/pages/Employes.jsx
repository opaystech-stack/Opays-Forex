import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  Users, UserPlus, CheckCircle2, AlertCircle, Lock,
  UserCheck, UserX, Pencil, Save, X, ChevronRight,
} from 'lucide-react';
import { useT } from '../i18n';
import { ROLES, PERMISSIONS } from '../utils/authorization';

// Gestion des Comptes_Employés et des Invitations_Collaborateur (Exigence 1).
//
// Cet écran permet au Propriétaire_Agence (ou à tout utilisateur disposant de
// la permission `employes.gerer`) de :
//   - inviter un collaborateur par e-mail, avec un Rôle et des Permissions
//     individuelles (Req 1.1, 1.2, 1.8) ;
//   - lister les Comptes_Employés avec e-mail, rôle et état d'activation
//     (Req 1.10) ;
//   - modifier le rôle d'un compte existant (Req 1.8) ;
//   - désactiver un compte (Req 1.9) ;
//   - lister les Invitations_Collaborateur avec leur état (Req 1.10) ;
//   - refuser l'accès à tout utilisateur sans la permission `employes.gerer`
//     (Req 1.1, 1.11).
//
// La garde côté React est une commodité UX ; l'autorité finale reste la RLS
// PostgreSQL et les gardes du contexte (AppContext).

// Libellés lisibles pour chaque permission de l'ensemble fermé.
// Les quatre clés qui ont un équivalent i18n (`employes.perm_*`) sont
// récupérées dynamiquement ; les autres sont affichées en dot-notation.
const PERM_LABEL_KEY = {
  'transactions.creer': 'perm_transactions_creer',
  'taux.modifier': 'perm_taux_modifier',
  'employes.gerer': 'perm_employes_gerer',
  'services.vendre': 'perm_services_vendre',
};

export default function Employes() {
  const t = useT();
  const {
    employees,
    invitations,
    hasPermission,
    createInvitation,
    updateMemberRole,
    setMemberActivation,
    loading,
  } = useApp();

  // ---- Formulaire d'invitation ----
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [grantPerms, setGrantPerms] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  // ---- Édition inline du rôle d'un membre ----
  // { id: string, role: string } | null
  const [editingRole, setEditingRole] = useState(null);
  const [busyMember, setBusyMember] = useState(null); // id du membre en cours de maj

  const canManage = hasPermission('employes.gerer');

  // Libellé traduit d'un rôle.
  const roleLabel = (r) => t(`employes.role_${r}`) || r;

  // Libellé traduit d'une permission.
  const permLabel = (p) => {
    const key = PERM_LABEL_KEY[p];
    if (key) {
      const translated = t(`employes.${key}`);
      if (translated) return translated;
    }
    return p;
  };

  // Badge d'état d'invitation.
  const invStateBadge = (state) => {
    const map = {
      en_attente: 'pending',
      acceptée: 'completed',
      expirée: 'expired',
    };
    const pillClass = map[state] || 'draft';
    const key = state === 'en_attente' ? 'inv_status_en_attente'
      : state === 'acceptée' ? 'inv_status_acceptee'
      : state === 'expirée' ? 'inv_status_expiree'
      : state;
    return (
      <span className={`status-pill ${pillClass}`}>
        {t(`employes.${key}`) || state}
      </span>
    );
  };

  // Badge d'état d'activation d'un membre.
  const memberStateBadge = (activationState) => {
    const isActive = activationState === 'actif';
    const pillClass = isActive ? 'active' : 'suspendue';
    const label = isActive ? t('employes.status_actif') : t('employes.status_desactive');
    return (
      <span className={`status-pill ${pillClass}`}>
        {label}
      </span>
    );
  };

  // Basculer une permission individuelle d'octroi dans le formulaire.
  const toggleGrantPerm = (perm) => {
    setGrantPerms((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm],
    );
  };

  const resetForm = () => {
    setEmail('');
    setRole('');
    setGrantPerms([]);
  };

  // Envoi du formulaire d'invitation (Req 1.2, 1.4, 1.5, 1.6).
  const handleInvite = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const res = await createInvitation({
      email: email.trim(),
      role,
      permission_grants: grantPerms,
      permission_denies: [],
    });

    setSaving(false);

    if (res.success) {
      setMessage({ type: 'success', text: t('employes.invite_success') });
      resetForm();
    } else {
      // Mapper les erreurs contextuelles sur les clés i18n du champ.
      const fieldMsg = {
        email: res.field === 'email'
          ? (res.error?.includes('déjà')
            ? t('employes.error_email_used')
            : t('employes.error_email_invalid'))
          : null,
        role: res.field === 'role' ? t('employes.error_role_invalid') : null,
      };
      const text = fieldMsg[res.field] || res.error || t('employes.error_email_invalid');
      setMessage({ type: 'error', text });
    }
  };

  // Enregistrer la modification de rôle d'un membre (Req 1.8).
  const handleSaveRole = async (memberId) => {
    if (!editingRole || editingRole.id !== memberId) return;
    setBusyMember(memberId);
    const res = await updateMemberRole(memberId, editingRole.role);
    setBusyMember(null);
    if (res.success) {
      setMessage({ type: 'success', text: t('employes.role_updated') });
      setEditingRole(null);
    } else {
      setMessage({
        type: 'error',
        text: res.field === 'role' ? t('employes.error_role_invalid') : res.error,
      });
    }
  };

  // Désactiver un compte employé (Req 1.9).
  const handleDeactivate = async (member) => {
    const confirmText = t('employes.deactivate_confirm');
    if (typeof window !== 'undefined' && !window.confirm(confirmText)) return;
    setBusyMember(member.id);
    const res = await setMemberActivation(member.id, 'désactivé');
    setBusyMember(null);
    if (res.success) {
      setMessage({ type: 'success', text: t('employes.account_deactivated') });
    } else {
      setMessage({ type: 'error', text: res.error });
    }
  };

  const membersList = useMemo(
    () => (Array.isArray(employees) ? employees : []),
    [employees],
  );

  const invitationsList = useMemo(
    () => (Array.isArray(invitations) ? invitations : []),
    [invitations],
  );

  if (loading) {
    return (
      <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '20px' }}>
        {t('loading.data')}
      </p>
    );
  }

  // Garde de page : `employes.gerer` requise (Req 1.1, 1.11).
  if (!canManage) {
    return (
      <div>
        <div className="screen-header">
          <h2 className="screen-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={20} color="var(--color-primary)" />
            <span>{t('employes.title')}</span>
          </h2>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '30px 20px' }}>
          <Lock size={40} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            {t('employes.permission_denied')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="screen-header">
        <h2 className="screen-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Users size={20} color="var(--color-primary)" />
          <span>{t('employes.title')}</span>
        </h2>
        <p className="screen-desc">{t('employes.desc')}</p>
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

      {/* ---- Formulaire d'invitation (Req 1.2) ---- */}
      <form onSubmit={handleInvite} className="card" style={{ marginBottom: '18px' }}>
        <h3 style={{
          fontSize: '14px', fontWeight: 700, marginBottom: '14px', color: 'var(--deep-navy)',
          display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <UserPlus size={15} />
          {t('employes.invite_title')}
        </h3>

        {/* Adresse e-mail */}
        <div className="form-group">
          <label className="form-label">{t('employes.invite_email_label')}</label>
          <input
            type="email"
            className="form-control"
            maxLength={254}
            placeholder={t('employes.invite_email_placeholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        {/* Rôle */}
        <div className="form-group">
          <label className="form-label">{t('employes.invite_role_label')}</label>
          <select
            className="form-control"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            required
          >
            <option value="">— {t('employes.invite_role_label')} —</option>
            {ROLES.filter((r) => r !== 'proprietaire').map((r) => (
              <option key={r} value={r}>{roleLabel(r)}</option>
            ))}
          </select>
        </div>

        {/* Permissions individuelles d'octroi (Req 2.5) */}
        <div className="form-group">
          <label className="form-label">{t('employes.invite_permissions_label')}</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
            {PERMISSIONS.map((perm) => {
              const checked = grantPerms.includes(perm);
              return (
                <label
                  key={perm}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    fontSize: '12px', cursor: 'pointer',
                    padding: '6px 12px', borderRadius: 'var(--radius-btn, 12px)',
                    border: `1px solid ${checked ? 'var(--indigo-strong)' : 'var(--border-color)'}`,
                    color: checked ? 'var(--indigo-strong)' : 'var(--text-secondary)',
                    background: checked ? 'var(--indigo-soft)' : 'transparent',
                    minHeight: '44px',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleGrantPerm(perm)}
                    style={{ width: '15px', height: '15px' }}
                  />
                  {permLabel(perm)}
                </label>
              );
            })}
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
          <UserPlus size={16} />
          <span>{saving ? t('employes.inviting') : t('employes.invite_button')}</span>
        </button>
      </form>

      {/* ---- Liste des Comptes_Employés (Req 1.10) ---- */}
      <div className="screen-header" style={{ marginTop: '8px' }}>
        <h3 style={{
          fontSize: '14px', textTransform: 'uppercase', color: 'var(--text-secondary)',
          letterSpacing: '0.5px',
        }}>
          {t('employes.accounts_title')}
        </h3>
      </div>

      <div className="card" style={{ marginBottom: '16px' }}>
        {membersList.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            {t('employes.empty_accounts')}
          </p>
        ) : (
          <div className="ledger-list">
            {membersList.map((member) => {
              const isEditing = editingRole && editingRole.id === member.id;
              const isBusy = busyMember === member.id;
              const isActive = member.activation_state === 'actif';

              return (
                <div key={member.id} className="ledger-item">
                  <div className="ledger-left" style={{ flex: 1 }}>
                    <div className="ledger-icon-box">
                      {isActive ? <UserCheck size={18} /> : <UserX size={18} />}
                    </div>
                    <div className="ledger-details" style={{ flex: 1 }}>
                      <span className="ledger-title" style={{ wordBreak: 'break-all' }}>
                        {member.email || member.user_id}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                        {isEditing ? (
                          <select
                            className="form-control"
                            value={editingRole.role}
                            onChange={(e) =>
                              setEditingRole({ ...editingRole, role: e.target.value })
                            }
                            style={{ maxWidth: '160px', padding: '4px 8px', height: '36px' }}
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>{roleLabel(r)}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="ledger-subtitle">
                            {t('employes.col_role')}: {roleLabel(member.role)}
                          </span>
                        )}
                        {memberStateBadge(member.activation_state)}
                      </div>
                    </div>
                  </div>

                  {/* Actions : modifier le rôle, désactiver */}
                  <div
                    className="ledger-right"
                    style={{ flexDirection: 'row', gap: '6px', alignItems: 'center' }}
                  >
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-outline"
                          disabled={isBusy}
                          style={{ width: 'auto', padding: '8px 10px', margin: 0 }}
                          onClick={() => handleSaveRole(member.id)}
                          aria-label={t('employes.edit_role')}
                          title={t('employes.edit_role')}
                        >
                          <Save size={15} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline"
                          style={{ width: 'auto', padding: '8px 10px', margin: 0 }}
                          onClick={() => setEditingRole(null)}
                          aria-label={t('common.no') || 'Annuler'}
                        >
                          <X size={15} />
                        </button>
                      </>
                    ) : (
                      <>
                        {/* Modifier le rôle (Req 1.8) */}
                        <button
                          type="button"
                          className="btn btn-outline"
                          disabled={isBusy}
                          style={{ width: 'auto', padding: '8px 10px', margin: 0 }}
                          onClick={() =>
                            setEditingRole({ id: member.id, role: member.role || 'caissier' })
                          }
                          aria-label={t('employes.edit_role')}
                          title={t('employes.edit_role')}
                        >
                          <Pencil size={15} />
                        </button>

                        {/* Désactiver (Req 1.9) : seulement si le compte est actif */}
                        {isActive && (
                          <button
                            type="button"
                            className="btn btn-outline"
                            disabled={isBusy}
                            style={{
                              width: 'auto', padding: '8px 12px', margin: 0,
                              borderColor: 'var(--color-red)',
                              color: 'var(--color-red)',
                              display: 'inline-flex', alignItems: 'center', gap: '4px',
                            }}
                            onClick={() => handleDeactivate(member)}
                          >
                            <UserX size={14} />
                            <span>{t('employes.deactivate')}</span>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ---- Liste des Invitations_Collaborateur (Req 1.10) ---- */}
      <div className="screen-header" style={{ marginTop: '8px' }}>
        <h3 style={{
          fontSize: '14px', textTransform: 'uppercase', color: 'var(--text-secondary)',
          letterSpacing: '0.5px',
        }}>
          {t('employes.invitations_title')}
        </h3>
      </div>

      <div className="card" style={{ marginBottom: '16px' }}>
        {invitationsList.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            {t('employes.empty_invitations')}
          </p>
        ) : (
          <div className="ledger-list">
            {invitationsList.map((inv) => {
              const created = inv.created_at ? new Date(inv.created_at) : null;
              const dateStr = created
                ? created.toLocaleDateString('fr-FR', {
                    day: '2-digit', month: '2-digit', year: '2-digit',
                  })
                : '—';

              return (
                <div key={inv.id} className="ledger-item">
                  <div className="ledger-left" style={{ flex: 1 }}>
                    <div className="ledger-icon-box">
                      <ChevronRight size={18} />
                    </div>
                    <div className="ledger-details" style={{ flex: 1 }}>
                      <span className="ledger-title" style={{ wordBreak: 'break-all' }}>
                        {inv.email}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                        <span className="ledger-subtitle">
                          {t('employes.inv_col_role')}: {roleLabel(inv.role)}
                        </span>
                        <span className="ledger-subtitle">
                          {t('employes.inv_col_sent')}: {dateStr}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="ledger-right" style={{ flexDirection: 'row', gap: '6px', alignItems: 'center' }}>
                    {invStateBadge(inv.state)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
