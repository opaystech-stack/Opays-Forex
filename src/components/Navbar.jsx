import { LayoutDashboard, ArrowLeftRight, TrendingDown, Settings } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab }) {
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight },
    { id: 'expenses', label: 'Dépenses', icon: TrendingDown },
    { id: 'settings', label: 'Paramètres', icon: Settings },
  ];

  return (
    <nav className="mobile-navbar">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`navbar-tab ${isActive ? 'active' : ''}`}
            aria-label={tab.label}
          >
            <Icon className="navbar-icon" size={24} />
            <span className="navbar-label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
