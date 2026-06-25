import { X, Users, Repeat, CalendarCheck, MessageSquare, Smartphone, Settings, Shield, LogOut, Building2 } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function ProfileDrawer({ isOpen, onClose, onNavigate }) {
  const { user, logOut } = useApp();

  if (!isOpen) return null;

  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}` || 'OP';
  const fullName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.email || 'Utilisateur';

  const menuItems = [
    { id: 'employees', label: 'Employés', icon: Users },
    { id: 'transfers', label: 'Transferts', icon: Repeat },
    { id: 'subscriptions', label: 'Abonnements', icon: CalendarCheck },
    { id: 'tickets', label: 'Tickets', icon: MessageSquare },
    { id: 'remote-orders', label: 'Commandes', icon: Smartphone },
    { id: 'admin', label: 'Admin agence', icon: Building2 },
    ...(user?.role === 'superadmin' ? [{ id: 'superadmin', label: 'Super Admin', icon: Shield }] : []),
    { id: 'settings', label: 'Paramètres', icon: Settings },
  ];

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

        <div className="ofx-drawer-menu">
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
            Se déconnecter
          </button>
        </div>
      </div>
    </>
  );
}
