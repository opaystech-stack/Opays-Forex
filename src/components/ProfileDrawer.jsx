import { useApp } from '../context/AppContext';
import { useT } from '../i18n';
import { X, LogOut, Settings, Users, Building2, Shield, ArrowRightLeft, Landmark, Repeat, CalendarCheck, MessageSquare, Smartphone, ChevronRight } from 'lucide-react';

const MENU = [
  { id: 'transactions', label: 'Transactions', icon: ArrowRightLeft },
  { id: 'customers', label: 'Clients', icon: Users },
  { id: 'loans', label: 'Prets & Creances', icon: Landmark },
  { id: 'employees', label: 'Employes', icon: Users },
  { id: 'transfers', label: 'Transferts', icon: Repeat },
  { id: 'subscriptions', label: 'Abonnements', icon: CalendarCheck },
  { id: 'tickets', label: 'Tickets', icon: MessageSquare },
  { id: 'remote-orders', label: 'Commandes', icon: Smartphone },
  { id: 'settings', label: 'Parametres', icon: Settings },
  { id: 'admin', label: 'Admin agence', icon: Building2 },
];

export default function ProfileDrawer({ isOpen, onClose, onNavigate }) {
  const t = useT();
  const { user, logOut, userAgencies, switchAgency } = useApp();

  if (!isOpen) return null;
  return (
    <div className="ofx-drawer" onClick={onClose}>
      <div className="ofx-drawer-panel" onClick={(e) => e.stopPropagation()}>
        <div className="ofx-drawer-header">
          <div className="ofx-drawer-avatar">
            {(user?.firstName?.[0] || 'O') + (user?.lastName?.[0] || 'P')}
          </div>
          <div className="ofx-drawer-meta">
            <h3>{user?.firstName || 'Utilisateur'} {user?.lastName || ''}</h3>
            <p>{user?.email}</p>
            <span className="ofx-role-badge">{user?.role || 'user'}</span>
          </div>
          <button className="ofx-drawer-close" onClick={onClose}>
            <X size={22} />
          </button>
        </div>

        <div className="ofx-drawer-section">
          <div className="ofx-drawer-section-title">{t('ui.agencies') || 'Agences'}</div>
          <div className="ofx-agency-list">
            {userAgencies?.map(a => (
              <button
                key={a.id}
                className={`ofx-agency-item ${a.id === user?.agencyId ? 'active' : ''}`}
                onClick={() => { switchAgency(a.id); onClose(); }}
              >
                <span>{a.name}</span>
                {a.id === user?.agencyId && <span className="ofx-agency-active">Actif</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="ofx-drawer-section">
          <div className="ofx-drawer-section-title">Menu</div>
          {MENU.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className="ofx-drawer-item"
                onClick={() => { onNavigate(item.id); onClose(); }}
              >
                <Icon size={18} />
                <span>{item.label}</span>
                <ChevronRight size={16} />
              </button>
            );
          })}
          {user?.role === 'superadmin' && (
            <button className="ofx-drawer-item superadmin" onClick={() => { onNavigate('superadmin'); onClose(); }}>
              <Shield size={18} />
              <span>Super Admin</span>
              <ChevronRight size={16} />
            </button>
          )}
        </div>

        <button className="ofx-drawer-logout" onClick={() => { logOut(); onClose(); }}>
          <LogOut size={18} />
          <span>{t('auth.logout') || 'Se deconnecter'}</span>
        </button>
      </div>
    </div>
  );
}
