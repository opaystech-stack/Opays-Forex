import { Routes, Route, Navigate } from 'react-router-dom';
import { useState } from 'react';
import { useApp } from '../context/AppContext';
import Navbar from '../components/Navbar';
import Dashboard from './Dashboard';
import Transactions from './Transactions';
import WalletsPage from './Wallets';
import Expenses from './Expenses';
import LoansPage from './Loans';
import SettingsPage from './Settings';
import AgencyAdmin from './AgencyAdmin';
import Employees from './Employees';
import Transfers from './Transfers';
import Subscriptions from './Subscriptions';
import Tickets from './Tickets';
import RemoteOrders from './RemoteOrders';

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
      case 'wallets':
        return <WalletsPage />;
      case 'expenses':
        return <Expenses />;
      case 'loans':
        return <LoansPage />;
      case 'settings':
        return <SettingsPage />;
      case 'employees':
        return <Employees />;
      case 'transfers':
        return <Transfers />;
      case 'subscriptions':
        return <Subscriptions />;
      case 'tickets':
        return <Tickets />;
      case 'remote-orders':
        return <RemoteOrders />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="app-container">
      <div className="floating-spheres">
        <div className="sphere sphere-1"></div>
        <div className="sphere sphere-2"></div>
        <div className="sphere sphere-3"></div>
        <div className="sphere sphere-4"></div>
      </div>

      <header className="app-header">
        <div>
          <span className="app-subtitle">Gestion Kiosque</span>
          <h1 className="app-title">OpaysFox</h1>
        </div>
        {isUsingMock && <span className="mock-badge">Démo</span>}
      </header>

      <main className="page-content">
        {renderActiveTab()}
      </main>

      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
}

export default function AppShell() {
  return (
    <Routes>
      {<Route path="/" element={<AppContent />} />}
      {<Route path="/admin" element={<AgencyAdmin />} />}
      {<Route path="*" element={<Navigate to="/app" replace />} />}
    </Routes>
  );
}
