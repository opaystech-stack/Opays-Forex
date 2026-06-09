import { lazy, Suspense, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import Navbar from './components/Navbar';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Transactions = lazy(() => import('./pages/Transactions'));
const WalletsPage = lazy(() => import('./pages/Wallets'));
const Expenses = lazy(() => import('./pages/Expenses'));
const LoansPage = lazy(() => import('./pages/Loans'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const Auth = lazy(() => import('./pages/Auth'));

import { Loader2 } from 'lucide-react';

function AppContent() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [draftToEdit, setDraftToEdit] = useState(null);
  const { isUsingMock, user, loading } = useApp();

  // Show a premium loading screen during initial session verification
  if (loading) {
    return (
      <div className="auth-overlay" style={{ display: 'flex', flexDirection: 'column', gap: '20px', justifyContent: 'center', alignItems: 'center' }}>
        <div className="auth-header" style={{ marginBottom: '0' }}>
          <span className="auth-subtitle">Forex Ledger</span>
          <h1 className="auth-title" style={{ fontSize: '28px', marginTop: '4px' }}>Initialisation...</h1>
        </div>
        <div style={{ color: '#ffffff', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', fontWeight: '500', opacity: 0.8 }}>
          <Loader2 className="animate-spin" size={20} style={{ animation: 'spin 1s linear infinite' }} />
          <span>Vérification de la session en cours</span>
        </div>
      </div>
    );
  }

  // If not authenticated, show login page
  if (!user) {
    return (
      <Suspense fallback={<div className="auth-overlay"><div className="auth-card-container"><div className="card glass-card auth-card">Chargement…</div></div></div>}>
        <Auth />
      </Suspense>
    );
  }

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard 
            onSelectDraft={(draft) => {
              setDraftToEdit(draft);
              setActiveTab('transactions');
            }} 
          />
        );
      case 'transactions':
        return (
          <Transactions 
            draftToEdit={draftToEdit} 
            clearDraftToEdit={() => setDraftToEdit(null)} 
          />
        );
      case 'wallets':
        return <WalletsPage />;
      case 'expenses':
        return <Expenses />;
      case 'loans':
        return <LoansPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="app-container">
      {/* Navigation (Sidebar on PC, Bottom tabbar on Mobile) */}
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} isUsingMock={isUsingMock} />

      <div className="main-layout">
        {/* 3D spheres background from design */}
        <div className="floating-spheres">
          <div className="sphere sphere-1"></div>
          <div className="sphere sphere-2"></div>
          <div className="sphere sphere-3"></div>
          <div className="sphere sphere-4"></div>
        </div>

        {/* App Header */}
        <header className="app-header">
          <div>
            <span className="app-subtitle">Gestion Kiosque</span>
            <h1 className="app-title">Forex Ledger</h1>
          </div>
          {isUsingMock && (
            <span className="mock-badge">Démo</span>
          )}
        </header>

        {/* Dynamic Page Scrollable Body */}
        <main className="page-content">
          <Suspense fallback={<div className="card glass-card" style={{ padding: '16px' }}>Chargement de la page…</div>}>
            {renderActiveTab()}
          </Suspense>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

