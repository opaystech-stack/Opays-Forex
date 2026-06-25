import { LayoutDashboard, Wallet, Receipt, Menu, Plus } from 'lucide-react';

const tabs = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'wallets', label: 'Caisse', icon: Wallet },
  { id: 'expenses', label: 'Depense', icon: Receipt },
  { id: 'menu', label: 'Menu', icon: Menu },
];

export default function MobileNavbar({ activeTab, onChange, onAdd }) {
  return (
    <nav className="ofx-nav">
      {tabs.slice(0, 2).map(tab => (
        <button
          key={tab.id}
          className={`ofx-nav-item ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          <tab.icon size={22} />
          <span>{tab.label}</span>
        </button>
      ))}

      <button
        className="ofx-nav-add"
        onClick={onAdd}
        aria-label="Ajouter"
      >
        <Plus size={28} />
      </button>

      {tabs.slice(2).map(tab => (
        <button
          key={tab.id}
          className={`ofx-nav-item ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          <tab.icon size={22} />
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
