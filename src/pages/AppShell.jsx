import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useT } from '../i18n';
import FloatingSearchBar from '../components/FloatingSearchBar';
import SuggestionChips from '../components/SuggestionChips';
import TreasuryCanvas from '../components/TreasuryCanvas';
import BottomSheet from '../components/BottomSheet';
import MobileNavbar from '../components/MobileNavbar';
import WhatsAppFab from '../components/WhatsAppFab';
import WhatsAppCatalog from '../components/WhatsAppCatalog';
import ProfileDrawer from '../components/ProfileDrawer';
import WalletsPage from './Wallets';
import Expenses from './Expenses';

const menuItems = [
  { id: 'transactions', label: 'Transactions', icon: 'ArrowRightLeft' },
  { id: 'customers', label: 'Clients', icon: 'Users' },
  { id: 'loans', label: 'Prets & Creances', icon: 'Landmark' },
  { id: 'employees', label: 'Employes', icon: 'Users' },
  { id: 'transfers', label: 'Transferts', icon: 'Repeat' },
  { id: 'subscriptions', label: 'Abonnements', icon: 'CalendarCheck' },
  { id: 'tickets', label: 'Tickets', icon: 'MessageSquare' },
  { id: 'remote-orders', label: 'Commandes', icon: 'Smartphone' },
  { id: 'admin', label: 'Admin agence', icon: 'Building2' },
  { id: 'settings', label: 'Parametres', icon: 'Settings' },
];

function MenuView() {
  const navigate = useNavigate();
  const { user } = useApp();
  return (
    <div className="ofx-scrollable-page">
      <div className="screen-header">
        <h2 className="screen-title">Menu</h2>
        <p className="screen-desc">Accedez a tous les modules OpaysFox</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
        {menuItems.map(item => (
          <button
            key={item.id}
            className="ofx-service-card"
            onClick={() => navigate(`/app/${item.id}`)}
          >
            <div className="title">{item.label}</div>
          </button>
        ))}
        {user?.role === 'superadmin' && (
          <button className="ofx-service-card" onClick={() => navigate('/admin-plateforme')} style={{ gridColumn: 'span 2', background: 'rgba(220,38,38,0.08)', borderColor: 'rgba(220,38,38,0.25)' }}>
            <div className="title" style={{ color: 'var(--color-red)' }}>Super Admin</div>
          </button>
        )}
      </div>
    </div>
  );
}

function DashboardView({ searchQuery }) {
  return (
    <div className="ofx-scrollable-page" style={{ paddingTop: 'calc(118px + var(--safe-top))', paddingBottom: 'calc(96px + var(--safe-bottom))' }}>
      <TreasuryCanvas searchQuery={searchQuery} />
      <BottomSheet />
    </div>
  );
}

export default function AppShell() {
  const navigate = useNavigate();
  const t = useT();
  const { user, logOut, userAgencies } = useApp();

  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);

  const handleNavigate = (id) => {
    if (id === 'logout') { logOut(); return; }
    if (['dashboard','wallets','expenses'].includes(id)) { setActiveTab(id); }
    else { navigate(`/app/${id}`); }
  };

  const handleSuggestion = (action) => {
    if (action === 'transaction' || action === 'topup' || action === 'new-wallet' || action === 'biz-expense') {
      navigate(`/app/transactions`);
      return;
    }
    if (action === 'employees' || action === 'transfers' || action === 'tickets') {
      navigate(`/app/${action}`);
      return;
    }
    if (action === 'low-balance') {
      setActiveTab('wallets');
    }
  };

  const activeAgency = userAgencies.find(a => a.id === user?.agencyId) || { name: 'OpaysFox' };
  const initials = (user?.firstName?.[0] || 'O') + (user?.lastName?.[0] || 'P');

  return (
    <div className="ofx-app">
      <header className="ofx-top-bar">
        <div className="ofx-top-bar-left">
          <div className="ofx-brand-mini">OpaysFox</div>
          <span className="ofx-agency-pill">{activeAgency.name}</span>
        </div>
        <button className="ofx-avatar-btn" onClick={() => setDrawerOpen(true)} aria-label={t('ui.profile')}>
          {initials}
        </button>
      </header>

      <FloatingSearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        onVoice={() => setCatalogOpen(true)}
        placeholder={t('ui.searchPlaceholder')}
      />

      <SuggestionChips activeTab={activeTab} onAction={handleSuggestion} />

      <main className="ofx-main">
        {activeTab === 'dashboard' && <DashboardView searchQuery={searchQuery} />}
        {activeTab === 'wallets' && <WalletsPage />}
        {activeTab === 'expenses' && <Expenses />}
        {activeTab === 'menu' && <MenuView />}
      </main>

      <MobileNavbar
        activeTab={activeTab}
        onChange={setActiveTab}
        onAdd={() => navigate('/app/transactions')}
      />

      <WhatsAppFab onClick={() => setCatalogOpen(true)} />

      <WhatsAppCatalog
        isOpen={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        onService={(id) => {
          const phone = '+243000000000';
          const text = encodeURIComponent(`Bonjour OpaysFox, je souhaite utiliser le service: ${id}`);
          window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
        }}
      />

      <ProfileDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onNavigate={handleNavigate}
      />
    </div>
  );
}
