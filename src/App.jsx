import { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Expenses from './pages/Expenses';
import SettingsPage from './pages/Settings';

function AppContent() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [draftToEdit, setDraftToEdit] = useState(null);
  const { isUsingMock } = useApp();

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
      case 'expenses':
        return <Expenses />;
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
          {renderActiveTab()}
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
