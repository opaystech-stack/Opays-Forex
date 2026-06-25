import { useState } from 'react';
import { X, Users, Repeat, CalendarCheck, MessageSquare, Smartphone, Settings, Shield, LogOut, Building2, ChevronRight, Plus } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function ProfileDrawer({ isOpen, onClose, onNavigate }) {
  const { user, logOut, userAgencies, switchAgency, createAgency } = useApp();
  const [showCreate, setShowCreate] = useState(false);
  const [newAgencyName, setNewAgencyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [switchingId, setSwitchingId] = useState(null);

  if (!isOpen) return null;

  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}` || 'OP';
  const fullName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.email || 'Utilisateur';

  const menuItems = [
    { id: 'employees', label: 'Employes', icon: Users },
    { id: 'transfers', label: 'Transferts', icon: Repeat },
    { id: 'subscriptions', label: 'Abonnements', icon: CalendarCheck },
    { id: 'tickets', label: 'Tickets', icon: MessageSquare },
    { id: 'remote-orders', label: 'Commandes', icon: Smartphone },
    { id: 'admin', label: 'Admin agence', icon: Building2 },
    ...(user?.role === 'superadmin' ? [{ id: 'superadmin', label: 'Super Admin', icon: Shield }] : []),
    { id: 'settings', label: 'Parametres', icon: Settings },
  ];

  const activeAgency = userAgencies.find(a => a.id === user?.agencyId) || userAgencies[0];

  const handleSwitch = async (agencyId) => {
    if (agencyId === user?.agencyId) return;
    setSwitchingId(agencyId);
    const res = await switchAgency(agencyId);
    setSwitchingId(null);
    if (res.success) onClose();
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newAgencyName.trim()) return;
    setCreating(true);
    await createAgency(newAgencyName.trim());
    setCreating(false);
    setShowCreate(false);
    setNewAgencyName('');
  };

  return (
    <>
      <div className="ofx-drawer-overlay" onClick={onClose} />
      <div className="ofx-drawer">
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
        >
          <X size={24} />
        </button>

        <div className="ofx-drawer-header">
          <div className="ofx-drawer-avatar">{initials}</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '15px' }}>{fullName}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{user?.email}</div>
          </div>
        </div>

        <div className="ofx-drawer-section">
          <div className="ofx-section-title" style={{ padding: '0 20px' }}>Agences</div>
          <div className="ofx-agency-list">
            {activeAgency && (
              <div className="ofx-agency-item active">
                <Building2 size={18} />
                <div className="ofx-agency-info">
                  <div className="ofx-agency-name">{activeAgency.name}</div>
                  <div className="ofx-agency-meta">Active</div>
                </div>
                <span className="ofx-agency-check">✓</span>
              </div>
            )}
            {userAgencies.filter(a => a.id !== user?.agencyId).map(a => (
              <button
                key={a.id}
                className="ofx-agency-item"
                onClick={() => handleSwitch(a.id)}
                disabled={switchingId === a.id}
              >
                <Building2 size={18} />
                <div className="ofx-agency-info">
                  <div className="ofx-agency-name">{a.name}</div>
                </div>
                {switchingId === a.id ? (
                  <span className="ofx-agency-loading">...</span>
                ) : (
                  <ChevronRight size={18} style={{ color: 'var(--text-muted)' }} />
                )}
              </button>
            ))}
          </div>

          {showCreate ? (
            <form onSubmit={handleCreate} className="ofx-agency-create">
              <input
                type="text"
                placeholder="Nom de la nouvelle agence"
                value={newAgencyName}
                onChange={(e) => setNewAgencyName(e.target.value)}
                autoFocus
              />
              <button type="submit" disabled={creating || !newAgencyName.trim()}>
                {creating ? '...' : 'Creer'}
              </button>
            </form>
          ) : (
            <button className="ofx-agency-add" onClick={() => setShowCreate(true)}>
              <Plus size={18} />
              Ajouter une agence
            </button>
          )}
        </div>

        <div className="ofx-drawer-menu">
          <div className="ofx-section-title" style={{ padding: '0 20px' }}>Menu</div>
          {menuItems.map(item => (
            <button
              key={item.id}
              className="ofx-drawer-item"
              onClick={() => { onNavigate(item.id); onClose(); }}
            >
              <item.icon size={18} />
              {item.label}
            </button>
          ))}

          <button className="ofx-drawer-item" onClick={logOut} style={{ marginTop: '20px', color: 'var(--color-red)' }}>
            <LogOut size={18} />
            Se deconnecter
          </button>
        </div>
      </div>
    </>
  );
}
