import { LayoutDashboard, ArrowLeftRight, TrendingDown, Landmark, Coins, Settings, Users, Repeat, CalendarCheck, MessageSquare, Smartphone } from 'lucide-react';
import { useT } from '../i18n';

export default function Navbar({ activeTab, setActiveTab, isUsingMock }) {
  const t = useT();

  const tabs = [
    { id: 'dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
    { id: 'transactions', label: t('nav.transactions'), icon: ArrowLeftRight },
    { id: 'wallets', label: t('nav.wallets'), icon: Landmark },
    { id: 'transfers', label: t('nav.transfers'), icon: Repeat },
    { id: 'remote-orders', label: t('nav.remoteOrders'), icon: Smartphone },
    { id: 'subscriptions', label: t('nav.subscriptions'), icon: CalendarCheck },
    { id: 'employees', label: t('nav.employees'), icon: Users },
    { id: 'tickets', label: t('nav.tickets'), icon: MessageSquare },
    { id: 'expenses', label: t('nav.expenses'), icon: TrendingDown },
    { id: 'loans', label: t('nav.loans'), icon: Coins },
    { id: 'settings', label: t('nav.settings'), icon: Settings, className: 'settings-tab' }
  ];

  return (
    <nav className="mobile-navbar">
      {/* Sidebar header (visible only on desktop via CSS) */}
      <div className="sidebar-logo">
        <span className="logo-subtitle">{t('app.subtitle')}</span>
        <h2 className="logo-title">{t('app.title')}</h2>
        {isUsingMock && (
          <span className="mock-badge" style={{ marginTop: '8px', display: 'inline-block' }}>{t('app.demo')}</span>
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
              className={`navbar-tab ${isActive ? 'active' : ''} ${tab.className || ''}`}
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
