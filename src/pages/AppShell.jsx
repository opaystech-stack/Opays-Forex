import { Routes, Route, Navigate } from 'react-router-dom';
import { useState } from 'react';
import { useApp } from '../context/AppContext';
import FloatingSearchBar from '../components/FloatingSearchBar';
import FilterPills from '../components/FilterPills';
import TreasuryCanvas from '../components/TreasuryCanvas';
import BottomSheet from '../components/BottomSheet';
import MobileNavbar from '../components/MobileNavbar';
import WhatsAppFab from '../components/WhatsAppFab';
import ProfileDrawer from '../components/ProfileDrawer';
import Transactions from './Transactions';
import Expenses from './Expenses';
import LoansPage from './Loans';
import Employees from './Employees';
import Transfers from './Transfers';
import Subscriptions from './Subscriptions';
import Tickets from './Tickets';
import RemoteOrders from './RemoteOrders';
import AgencyAdmin from './AgencyAdmin';
import SuperAdmin from './SuperAdmin';
import { useT } from '../i18n';

function TreasuryView({ searchQuery, selectedWallet, onSelectWallet }) {
  const t = useT();
  return (
    <>
      <TreasuryCanvas
        searchQuery={searchQuery}
        selectedWalletId={selectedWallet}
        onSelectWallet={onSelectWallet}
      />
      <div style={{
        position: 'absolute',
        bottom: 'calc(152px + var(--safe-bottom))',
        left: '16px',
        zIndex: 120,
        color: 'var(--text-muted)',
        fontSize: '12px'
      }}>
        {t('ui.tapNode') || 'Tapez un nœud pour filtrer'}
      </div>
    </>
  );
}

function LedgerView({ selectedWallet }) {
  const t = useT();
  const { transactions, loans, wallets } = useApp();

  const filteredTransactions = transactions.filter(t => {
    if (!selectedWallet) return true;
    return t.source_wallet_id === selectedWallet || t.dest_wallet_id === selectedWallet;
  });

  const formatValue = (value, currency) => {
    if (currency === 'USD') return `$${Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 0 })}`;
    return `${Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} ${currency}`;
  };

  return (
    <div className="ofx-sheet-content" style={{ paddingTop: '20px' }}>
      <div className="ofx-section-title">{t('ui.ledgerTitle') || 'Dettes & Créances'}</div>

      {loans.length > 0 && (
        <>
          <div className="ofx-section-title" style={{ marginTop: '8px' }}>{t('nav.loans')}</div>
          {loans.map(l => (
            <div key={l.id} className="ofx-card" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>{l.note || 'Prêt'}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {l.status === 'pending' ? 'En cours' : l.status}
                </div>
              </div>
              <div style={{ fontWeight: 700, color: 'var(--color-orange)' }}>
                {formatValue(l.amount, l.currency || l.currency_code)}
              </div>
            </div>
          ))}
        </>
      )}

      <div className="ofx-section-title" style={{ marginTop: '8px' }}>{t('nav.transactions')}</div>
      {filteredTransactions.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>{t('dashboard.no_txns')}</p>
      ) : (
        filteredTransactions.slice(0, 8).map(t => {
          const sWallet = wallets.find(w => w.id === t.source_wallet_id);
          const dWallet = wallets.find(w => w.id === t.dest_wallet_id);
          return (
            <div key={t.id} className="ofx-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>{sWallet?.name || 'Capital'} → {dWallet?.name || 'Retrait'}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t.note || ''}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-green)' }}>+${(t.profit_usd || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}</div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function AddView({ onClose }) {
  const t = useT();
  const [subTab, setSubTab] = useState('transaction');

  return (
    <div className="ofx-sheet-content" style={{ paddingTop: '20px' }}>
      <div className="ofx-section-title">{t('ui.addTitle') || 'Nouvelle opération'}</div>
      <div className="ofx-quick-actions" style={{ marginBottom: '20px' }}>
        {[
          { id: 'transaction', label: t('nav.transactions'), icon: '↔️' },
          { id: 'expense', label: t('nav.expenses'), icon: '🧾' },
          { id: 'loan', label: t('nav.loans'), icon: '🏦' },
        ].map(tab => (
          <button
            key={tab.id}
            className="ofx-quick-btn"
            style={subTab === tab.id ? { borderColor: 'var(--opays-blue)', color: 'white', background: 'rgba(59, 98, 212, 0.2)' } : {}}
            onClick={() => setSubTab(tab.id)}
          >
            <span style={{ fontSize: '20px' }}>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {subTab === 'transaction' && <Transactions compact onClose={onClose} />}
      {subTab === 'expense' && <Expenses compact onClose={onClose} />}
      {subTab === 'loan' && <LoansPage compact onClose={onClose} />}
    </div>
  );
}

function AppContent() {
  const [activeTab, setActiveTab] = useState('treasury');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWallet, setSelectedWallet] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [secondaryRoute, setSecondaryRoute] = useState(null);
  const { isUsingMock } = useApp();
  const t = useT();

  const filterOptions = [
    { id: 'all', label: t('ui.filterAll') || 'Toutes les caisses' },
    { id: 'receivables', label: t('ui.filterReceivables') || 'Créances' },
    { id: 'debts', label: t('ui.filterDebts') || 'Dettes' },
  ];

  const handleNavigate = (route) => {
    setSecondaryRoute(route);
  };

  if (secondaryRoute) {
    const routes = {
      employees: <Employees />,
      transfers: <Transfers />,
      subscriptions: <Subscriptions />,
      tickets: <Tickets />,
      'remote-orders': <RemoteOrders />,
      admin: <AgencyAdmin />,
      superadmin: <SuperAdmin />,
      settings: <div className="ofx-card" style={{ margin: '80px 20px' }}></div>,
    };
    return (
      <div className="ofx-app">
        <div style={{ padding: 'calc(60px + var(--safe-top)) 16px 16px' }}>
          <button onClick={() => setSecondaryRoute(null)} className="ofx-btn ofx-btn-secondary" style={{ marginBottom: '12px' }}>
            ← {t('common.back') || 'Retour'}
          </button>
          {routes[secondaryRoute] || <div>Route inconnue</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="ofx-app">
      {isUsingMock && (
        <div style={{
          position: 'absolute',
          top: 'calc(8px + var(--safe-top))',
          right: '16px',
          zIndex: 200,
          background: 'rgba(234, 179, 8, 0.2)',
          color: 'var(--color-yellow)',
          padding: '4px 10px',
          borderRadius: '12px',
          fontSize: '11px',
          fontWeight: 700,
          border: '1px solid rgba(234, 179, 8, 0.3)'
        }}>
          DÉMO
        </div>
      )}

      <FloatingSearchBar
        query={searchQuery}
        onQueryChange={setSearchQuery}
        onAvatarClick={() => setDrawerOpen(true)}
      />

      <FilterPills
        active={activeFilter}
        onChange={setActiveFilter}
        options={filterOptions}
      />

      {activeTab === 'treasury' && (
        <TreasuryView
          searchQuery={searchQuery}
          selectedWallet={selectedWallet}
          onSelectWallet={setSelectedWallet}
        />
      )}

      {activeTab === 'ledger' && <LedgerView selectedWallet={selectedWallet} />}

      {activeTab === 'add' && <AddView onClose={() => setActiveTab('treasury')} />}

      <WhatsAppFab onClick={() => handleNavigate('remote-orders')} />

      <BottomSheet
        onOpenTransaction={() => setActiveTab('add')}
        onOpenExpense={() => { setActiveTab('add'); }}
        onOpenLoan={() => { setActiveTab('add'); }}
        onOpenTransfer={() => handleNavigate('transfers')}
        onOpenSubscription={() => handleNavigate('subscriptions')}
        onOpenTicket={() => handleNavigate('tickets')}
      />

      <MobileNavbar activeTab={activeTab} onChange={setActiveTab} />

      <ProfileDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onNavigate={handleNavigate}
      />
    </div>
  );
}

export default function AppShell() {
  return (
    <Routes>
      <Route path="/" element={<AppContent />} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
