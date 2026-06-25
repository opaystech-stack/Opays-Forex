import { LayoutDashboard, Wallet, Receipt, Menu, Plus } from 'lucide-react';
import { useT } from '../i18n';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'wallets', label: 'Caisse', icon: Wallet },
  { id: 'expenses', label: 'Depense', icon: Receipt },
  { id: 'menu', label: 'Menu', icon: Menu },
];

export default function MobileNavbar({ activeTab, onChange, onAdd }) {
  const t = useT();
  return (
    <nav className="ofx-bottom-nav">
      {TABS.map(tab => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            className={`ofx-nav-item ${active ? 'active' : ''}`}
            onClick={() => onChange(tab.id)}
            aria-label={t(`nav.${tab.id}`) || tab.label}
          >
            <div className="ofx-nav-icon">
              <Icon size={22} />
            </div>
            <span className="ofx-nav-label">{tab.label}</span>
          </button>
        );
      })}
      <button className="ofx-nav-add" onClick={onAdd} aria-label={t('ui.add') || 'Ajouter'}>
        <Plus size={24} />
      </button>
    </nav>
  );
}
