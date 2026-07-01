import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useT } from '../i18n';
import {
  Building2, Users, Settings, Shield, Mail, Calendar,
  CheckCircle2, AlertCircle, X, UserPlus, ToggleLeft, ToggleRight,
  Activity, Wallet, TrendingUp, BarChart3, Trash2, Edit3, Save,
} from 'lucide-react';

export default function AgencyAdmin() {
  const {
    currentAgency, agencyId, user, employees, invitations,
    moduleStates, isModuleEnabled, setModuleEnabled,
    createInvitation, updateMemberRole, setMemberActivation,
    platformAgencies, setAgencyState, loading,
    wallets, transactions, expenses, loans, debts,
    isUsingMock, refreshData,
  } = useApp();
  const t = useT();

  const [activeTab, setActiveTab] = useState('info');
  const [message, setMessage] = useState(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('employee');
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');

  const agency = currentAgency;
  const agencyEmployees = employees || [];
  const agencyInvitations = invitations || [];

  // Stats
  const totalTxns = (transactions || []).length;
  const totalVolume = (transactions || []).reduce((sum, t) => sum + (t.source_amount || 0), 0);
  const totalWallets = (wallets || []).length;
  const totalCustomers = 0; // customers not in context directly

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    const res = await createInvitation({ email: inviteEmail.trim(), role: inviteRole });
    if (res.success) {
      setMessage({ type: 'success', text: "Invitation envoyée à " + inviteEmail });
      setInviteEmail('');
    } else {
      setMessage({ type: 'error', text: res.error || "Erreur lors de l'invitation" });
    }
  };

  const handleToggleModule = async (moduleKey) => {
    const newState = !isModuleEnabled(moduleKey);
    const res = await setModuleEnabled(moduleKey, newState);
    if (res && res.success === false) {
      setMessage({ type: 'error', text: res.error || "Erreur lors du changement de module" });
    }
  };

  const handleToggleEmployee = async (empId, currentActive) => {
    const res = await setMemberActivation(empId, !currentActive);
    if (res && res.success === false) {
      setMessage({ type: 'error', text: res.error || "Erreur lors du changement de statut" });
    }
  };

  const handleChangeRole = async (empId, newRole) => {
    const res = await updateMemberRole(empId, newRole);
    if (res && res.success === false) {
      setMessage({ type: 'error', text: res.error || "Erreur lors du changement de rôle" });
    }
  };

  const handleSaveName = async () => {
    if (!newName.trim()) return;
    // Use setAgencyState or direct update
    setEditingName(false);
    setMessage({ type: 'success', text: "Nom d'agence mis à jour (mode démo)" });
  };

  const tabs = [
    { key: 'info', label: 'Informations', icon: Building2 },
    { key: 'employees', label: 'Employés', icon: Users },
    { key: 'modules', label: 'Modules', icon: Settings },
    { key: 'stats', label: 'Statistiques', icon: BarChart3 },
  ];

  if (!agency) {
    return (
      <div className="ofx-scrollable-page">
        <div className="ofx-screen-header">
          <div className="ofx-screen-icon"><Building2 size={28} /></div>
          <div>
            <h2 className="ofx-screen-title">Admin Agence</h2>
            <p className="ofx-screen-desc">Aucune agence active.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ofx-scrollable-page">
      <div className="ofx-screen-header">
        <div className="ofx-screen-icon"><Building2 size={28} /></div>
        <div>
          <h2 className="ofx-screen-title">{agency.name || 'Admin Agence'}</h2>
          <p className="ofx-screen-desc">Tableau de bord d'administration de l'agence</p>
        </div>
      </div>

      {message && (
        <div className={'alert ' + (message.type === 'success' ? 'alert-success' : 'alert-info')}
          style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span style={{ flex: 1 }}>{message.text}</span>
          <button type="button" onClick={() => setMessage(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="ofx-tabs" style={{ display: 'flex', gap: '4px', marginBottom: '20px', overflowX: 'auto' }}>
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.key} type="button"
              onClick={() => setActiveTab(tab.key)}
              className={'ofx-tab ' + (activeTab === tab.key ? 'ofx-tab--active' : '')}
              style={{
                padding: '8px 16px', borderRadius: '10px', border: 'none',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap',
                background: activeTab === tab.key ? 'var(--primary-blue)' : 'var(--border-color)',
                color: activeTab === tab.key ? '#fff' : 'var(--text-secondary)',
                transition: 'all 0.15s',
              }}>
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab: Informations */}
      {activeTab === 'info' && (
        <div className="ofx-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700' }}>Informations de l'agence</h3>
            <button type="button" onClick={() => { setEditingName(!editingName); if (!editingName) setNewName(agency.name); }}
              className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: '12px' }}>
              <Edit3 size={14} />
              <span>Modifier</span>
            </button>
          </div>

          {editingName ? (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <input type="text" className="form-control" value={newName}
                onChange={(e) => setNewName(e.target.value)}
                style={{ flex: 1, padding: '8px 12px', fontSize: '13px' }} />
              <button type="button" onClick={handleSaveName} className="btn btn-primary"
                style={{ padding: '8px 16px', fontSize: '12px' }}>
                <Save size={14} />
                <span>Enregistrer</span>
              </button>
              <button type="button" onClick={() => setEditingName(false)} className="btn btn-ghost"
                style={{ padding: '8px 16px', fontSize: '12px' }}>
                <X size={14} />
              </button>
            </div>
          ) : null}

          <div className="ofx-info-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="ofx-info-item" style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: '10px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Nom</div>
              <div style={{ fontSize: '14px', fontWeight: '700' }}>{agency.name || '—'}</div>
            </div>
            <div className="ofx-info-item" style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: '10px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Slug</div>
              <div style={{ fontSize: '14px', fontWeight: '700' }}>{agency.slug || '—'}</div>
            </div>
            <div className="ofx-info-item" style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: '10px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Statut</div>
              <div style={{ fontSize: '14px', fontWeight: '700' }}>
                <span className={'badge ' + (agency.state === 'active' ? 'badge-success' : 'badge-warning')}
                  style={{ padding: '2px 10px', borderRadius: '20px', fontSize: '12px' }}>
                  {agency.state === 'active' ? 'Actif' : 'Suspendu'}
                </span>
              </div>
            </div>
            <div className="ofx-info-item" style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: '10px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Créée le</div>
              <div style={{ fontSize: '14px', fontWeight: '700' }}>
                {agency.created_at ? new Date(agency.created_at).toLocaleDateString('fr-FR') : '—'}
              </div>
            </div>
            <div className="ofx-info-item" style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: '10px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>ID</div>
              <div style={{ fontSize: '12px', fontWeight: '500', fontFamily: 'monospace' }}>{agency.id || '—'}</div>
            </div>
            <div className="ofx-info-item" style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: '10px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Employés</div>
              <div style={{ fontSize: '14px', fontWeight: '700' }}>{agencyEmployees.length}</div>
            </div>
          </div>

          <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.15)', borderRadius: '12px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-red)', marginBottom: '8px' }}>Zone de danger</h4>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              La suppression de l'agence est irréversible. Toutes les données associées seront perdues.
            </p>
            <button type="button" className="btn btn-danger"
              style={{ padding: '8px 16px', fontSize: '12px' }}
              onClick={() => {
                if (window.confirm('Confirmer la suppression de l\'agence "' + agency.name + '" ?')) {
                  setMessage({ type: 'success', text: 'Agence supprimée (mode démo)' });
                }
              }}>
              <Trash2 size={14} />
              <span>Supprimer l'agence</span>
            </button>
          </div>
        </div>
      )}

      {/* Tab: Employees */}
      {activeTab === 'employees' && (
        <div>
          {/* Invite form */}
          <div className="ofx-card" style={{ padding: '16px', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <UserPlus size={16} />
              <span>Inviter un employé</span>
            </h3>
            <form onSubmit={handleInvite} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input type="email" className="form-control" placeholder="Email de l'employé"
                value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
                required style={{ flex: '1 1 200px', padding: '8px 12px', fontSize: '13px' }} />
              <select className="form-control" value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                style={{ width: 'auto', padding: '8px 12px', fontSize: '13px' }}>
                <option value="employee">Employé</option>
                <option value="admin">Admin</option>
                <option value="supervisor">Superviseur</option>
              </select>
              <button type="submit" className="btn btn-primary"
                style={{ padding: '8px 16px', fontSize: '13px' }}>
                <UserPlus size={14} />
                <span>Inviter</span>
              </button>
            </form>
          </div>

          {/* Employees list */}
          <div className="ofx-card" style={{ padding: '16px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '12px' }}>
              Employés ({agencyEmployees.length})
            </h3>
            {agencyEmployees.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', padding: '20px' }}>
                Aucun employé dans cette agence.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {agencyEmployees.map(emp => (
                  <div key={emp.id} className="ofx-employee-row"
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '12px', background: 'var(--bg-secondary)',
                      borderRadius: '10px', border: '1px solid var(--border-color)',
                    }}>
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '50%',
                      background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontWeight: '700', fontSize: '14px', flexShrink: 0,
                    }}>
                      {(emp.email || emp.name || '?')[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>
                        {emp.name || emp.email || 'Employé'}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {emp.email || '—'}
                      </div>
                    </div>
                    <select className="form-control" value={emp.role || 'employee'}
                      onChange={(e) => handleChangeRole(emp.id, e.target.value)}
                      style={{ width: 'auto', padding: '4px 8px', fontSize: '11px' }}>
                      <option value="employee">Employé</option>
                      <option value="admin">Admin</option>
                      <option value="supervisor">Superviseur</option>
                    </select>
                    <button type="button"
                      onClick={() => handleToggleEmployee(emp.id, emp.is_active !== false)}
                      style={{
                        padding: '6px 10px', borderRadius: '8px', border: 'none',
                        cursor: 'pointer', fontSize: '11px', fontWeight: '600',
                        background: emp.is_active !== false ? 'rgba(34,197,94,0.1)' : 'rgba(220,38,38,0.1)',
                        color: emp.is_active !== false ? 'var(--color-green)' : 'var(--color-red)',
                        display: 'flex', alignItems: 'center', gap: '4px',
                      }}>
                      {emp.is_active !== false ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                      <span>{emp.is_active !== false ? 'Actif' : 'Inactif'}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Invitations list */}
          {agencyInvitations.length > 0 && (
            <div className="ofx-card" style={{ padding: '16px', marginTop: '16px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '12px' }}>
                Invitations en attente ({agencyInvitations.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {agencyInvitations.map(inv => (
                  <div key={inv.id} style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '10px 12px', background: 'rgba(245,158,11,0.05)',
                    borderRadius: '10px', border: '1px solid rgba(245,158,11,0.15)',
                  }}>
                    <Mail size={16} color="var(--color-orange)" />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: '600' }}>{inv.email}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        Rôle: {inv.role || 'employee'} — {inv.status || 'pending'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Modules */}
      {activeTab === 'modules' && (
        <div className="ofx-card" style={{ padding: '16px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '16px' }}>
            Modules de l'agence
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {Object.entries(moduleStates || {}).map(([key, enabled]) => (
              <div key={key} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px', background: 'var(--bg-secondary)',
                borderRadius: '10px', border: '1px solid var(--border-color)',
              }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '600', textTransform: 'capitalize' }}>
                    {key.replace(/_/g, ' ')}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    {enabled ? 'Activé' : 'Désactivé'}
                  </div>
                </div>
                <button type="button"
                  onClick={() => handleToggleModule(key)}
                  className={'btn ' + (enabled ? 'btn-success' : 'btn-ghost')}
                  style={{ padding: '6px 14px', fontSize: '12px', borderRadius: '20px' }}>
                  {enabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                  <span>{enabled ? 'Actif' : 'Inactif'}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Stats */}
      {activeTab === 'stats' && (
        <div>
          <div className="ofx-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            <div className="ofx-stat-card" style={{ padding: '16px', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
              <Wallet size={20} color="var(--primary-blue)" />
              <div style={{ fontSize: '24px', fontWeight: '800', marginTop: '8px' }}>{totalWallets}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Portefeuilles</div>
            </div>
            <div className="ofx-stat-card" style={{ padding: '16px', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
              <Activity size={20} color="var(--color-green)" />
              <div style={{ fontSize: '24px', fontWeight: '800', marginTop: '8px' }}>{totalTxns}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Transactions</div>
            </div>
            <div className="ofx-stat-card" style={{ padding: '16px', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
              <TrendingUp size={20} color="var(--color-cyan)" />
              <div style={{ fontSize: '24px', fontWeight: '800', marginTop: '8px' }}>
                {new Intl.NumberFormat('fr-FR').format(totalVolume)} USD
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Volume total</div>
            </div>
            <div className="ofx-stat-card" style={{ padding: '16px', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
              <Users size={20} color="var(--color-orange)" />
              <div style={{ fontSize: '24px', fontWeight: '800', marginTop: '8px' }}>{agencyEmployees.length}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Employés</div>
            </div>
          </div>

          <div className="ofx-card" style={{ padding: '16px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '12px' }}>Détails</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Dépenses</span>
                <span style={{ fontSize: '13px', fontWeight: '600' }}>{(expenses || []).length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Prêts</span>
                <span style={{ fontSize: '13px', fontWeight: '600' }}>{(loans || []).length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Dettes</span>
                <span style={{ fontSize: '13px', fontWeight: '600' }}>{(debts || []).length}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
