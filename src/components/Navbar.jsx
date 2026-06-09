import { LayoutDashboard, ArrowLeftRight, TrendingDown, Settings } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, isUsingMock }) {
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight },
    { id: 'expenses', label: 'Dépenses', icon: TrendingDown },
    { id: 'settings', label: 'Paramètres', icon: Settings },
  ];

  return (
    <nav className="mobile-navbar">
      {/* Sidebar header (visible only on desktop via CSS) */}
      <div className="sidebar-logo">
        <span className="logo-subtitle">Gestion Kiosque</span>
        <h2 className="logo-title">Forex Ledger</h2>
        {isUsingMock && (
          <span className="mock-badge" style={{ marginTop: '8px', display: 'inline-block' }}>Démo</span>
        )}
      </div>

      <div className="navbar-tabs-container">
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
              <Icon className="navbar-icon" size={22} />
              <span className="navbar-label">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
