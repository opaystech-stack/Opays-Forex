import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Landmark, Wallet, ArrowLeftRight, Search, FileCheck, Trash2, Clock, Edit } from 'lucide-react';

export default function Dashboard({ onSelectDraft }) {
  const { wallets, transactions, expenses, getNetWorthUSD, convertToUSD, getDrafts, confirmDraft, deleteDraft, loading, loans, getOutstandingLoansUSD } = useApp();
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWalletId, setSelectedWalletId] = useState(null);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60%' }}>
        <div className="recording-dot" style={{ width: '20px', height: '20px', backgroundColor: 'var(--primary-blue)' }}></div>
        <span style={{ marginLeft: '12px', color: 'var(--text-secondary)' }}>Chargement des données...</span>
      </div>
    );
  }

  const drafts = getDrafts();
  const completedTxns = transactions.filter(t => t.status === 'completed');

  // Calculate daily stats (today) - only from completed transactions
  const getTodayStats = () => {
    const today = new Date().toISOString().split('T')[0];
    
    const todayTxns = completedTxns.filter(t => t.timestamp.startsWith(today));
    const volumeUSD = todayTxns.reduce((acc, t) => acc + convertToUSD(t.source_amount, wallets.find(w => w.id === t.source_wallet_id)?.currency || 'USD'), 0);
    const profitUSD = todayTxns.reduce((acc, t) => acc + parseFloat(t.profit_usd), 0);

    const todayExp = expenses.filter(e => e.timestamp.startsWith(today));
    const bizExpenseUSD = todayExp.filter(e => e.is_business).reduce((acc, e) => acc + convertToUSD(e.amount, wallets.find(w => w.id === e.wallet_id)?.currency || 'USD'), 0);
    const persExpenseUSD = todayExp.filter(e => !e.is_business).reduce((acc, e) => acc + convertToUSD(e.amount, wallets.find(w => w.id === e.wallet_id)?.currency || 'USD'), 0);

    return {
      volumeUSD,
      profitUSD,
      bizExpenseUSD,
      persExpenseUSD,
      netProfitUSD: profitUSD - bizExpenseUSD
    };
  };

  const stats = getTodayStats();

  // Helper for currency styling
  const formatValue = (value, currency) => {
    if (currency === 'USD') {
      return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD' }).format(value);
    }
    return new Intl.NumberFormat('fr-FR').format(value) + ' ' + currency;
  };

  // Filter transactions for search (useful to find transaction ID disputes) & selected wallet
  const filteredTransactions = completedTxns.filter(t => {
    // 1. Filter by selected wallet
    if (selectedWalletId && t.source_wallet_id !== selectedWalletId && t.dest_wallet_id !== selectedWalletId) {
      return false;
    }
    // 2. Filter by search query
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const sourceWallet = wallets.find(w => w.id === t.source_wallet_id)?.name || '';
    const destWallet = wallets.find(w => w.id === t.dest_wallet_id)?.name || '';
    return (
      (t.transaction_id && t.transaction_id.toLowerCase().includes(query)) ||
      (t.note && t.note.toLowerCase().includes(query)) ||
      sourceWallet.toLowerCase().includes(query) ||
      destWallet.toLowerCase().includes(query)
    );
  }).slice(0, 10); // top 10 matches on desktop

  // Handle draft confirmation
  const handleConfirmDraft = async (draft) => {
    const res = await confirmDraft(draft.id);
    if (!res.success) {
      alert('Erreur lors de la validation : ' + (res.error || 'Inconnue'));
    }
  };

  // Handle draft rejection
  const handleDeleteDraft = async (draftId) => {
    if (window.confirm('Supprimer ce brouillon ? Cette action est irréversible.')) {
      await deleteDraft(draftId);
    }
  };

  return (
    <div className="dashboard-layout">
      {/* Left Column: Metrics & Wallets */}
      <div className="dashboard-col-left">
        {/* 1. Net Worth Card */}
        <div className="card glass-card" style={{ marginBottom: '20px' }}>
          <span className="net-worth-label">Patrimoine Global</span>
          <div className="net-worth-amount">
            {new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(getNetWorthUSD())}
            <span className="net-worth-currency">USD</span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Consolidation automatique en temps réel de toutes vos caisses et wallets.
          </p>
        </div>

        {/* 2. Daily Summary */}
        <div className="screen-header" style={{ marginBottom: '10px' }}>
          <h3 style={{ fontSize: '14px', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>Résumé d'aujourd'hui</h3>
        </div>
        <div className="stats-strip">
          <div className="stat-box">
            <span className="stat-label">Bénéfice de Change</span>
            <div className="stat-value income" style={{ color: 'var(--color-green)' }}>
              +{formatValue(stats.profitUSD, 'USD')}
            </div>
          </div>
          <div className="stat-box">
            <span className="stat-label">Dépenses Agence</span>
            <div className="stat-value expense" style={{ color: 'var(--color-red)' }}>
              -{formatValue(stats.bizExpenseUSD, 'USD')}
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', marginTop: '-10px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Bénéfice Net Kiosque :</span>
            <span style={{ fontWeight: '600', color: stats.netProfitUSD >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
              {formatValue(stats.netProfitUSD, 'USD')}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', borderTop: '1px solid var(--border-color)', paddingTop: '6px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Prélèvements Personnels :</span>
            <span style={{ fontWeight: '600', color: 'var(--color-orange)' }}>
              {formatValue(stats.persExpenseUSD, 'USD')}
            </span>
          </div>
        </div>

        {/* Loans Metric Card */}
        {loans.length > 0 && (
          <div className="card glass-card" style={{ padding: '14px 18px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span className="net-worth-label" style={{ fontSize: '12px', margin: 0 }}>Dette active (Prêts)</span>
              <div className="net-worth-amount" style={{ fontSize: '20px', marginTop: '4px', marginBottom: 0 }}>
                {new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(getOutstandingLoansUSD())}
                <span className="net-worth-currency" style={{ fontSize: '12px', marginLeft: '4px' }}>USD</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{
                display: 'inline-block',
                fontSize: '11px',
                fontWeight: '700',
                backgroundColor: 'rgba(255, 140, 0, 0.15)',
                color: 'var(--color-orange)',
                padding: '3px 8px',
                borderRadius: '12px'
              }}>
                {loans.filter(l => l.status === 'pending').length} actifs
              </span>
            </div>
          </div>
        )}

        {/* 3. Wallets Grid */}
        <div className="screen-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '14px', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>Vos Caisses & Wallets</h3>
        </div>
        {wallets.length === 0 ? (
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '10px 0' }}>
            Aucun portefeuille créé. Rendez-vous dans l'onglet « Portefeuilles » pour configurer vos caisses.
          </p>
        ) : (
          <div className="wallet-grid">
            {wallets.map(w => {
              const isCash = w.type === 'cash';
              const isActive = selectedWalletId === w.id;
              return (
                <div 
                  key={w.id} 
                  className={`wallet-card ${isActive ? 'active' : ''}`}
                  onClick={() => setSelectedWalletId(isActive ? null : w.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div className="wallet-info">
                      <span className="wallet-name" title={w.name}>{w.name}</span>
                      <span className="wallet-type-badge">{isCash ? 'Espèces' : 'Mobile Money'}</span>
                    </div>
                    {isCash ? (
                      <Landmark size={14} color="var(--text-secondary)" />
                    ) : (
                      <Wallet size={14} color="var(--primary-blue)" />
                    )}
                  </div>
                  <div className="wallet-balance">
                    {formatValue(w.balance, w.currency)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Right Column: Drafts & Search/Ledger */}
      <div className="dashboard-col-right">
        {/* 0. Draft Notifications Panel */}
        {drafts.length > 0 && (
          <div className="drafts-panel">
            <div className="drafts-header">
              <Clock size={14} />
              <span>{drafts.length} brouillon{drafts.length > 1 ? 's' : ''} en attente</span>
            </div>
            {drafts.map(d => {
              const sWallet = wallets.find(w => w.id === d.source_wallet_id);
              const dWallet = wallets.find(w => w.id === d.dest_wallet_id);
              return (
                <div key={d.id} className="draft-card">
                  <div className="draft-info" onClick={() => onSelectDraft?.(d)} title="Cliquer pour modifier/valider">
                    <span className="draft-route">
                      {sWallet ? sWallet.name.split(' ')[0] : 'Capital'} ➡️ {dWallet ? dWallet.name.split(' ')[0] : 'Capital'}
                    </span>
                    <span className="draft-amounts">
                      {sWallet ? formatValue(d.source_amount, sWallet.currency) : 'N/A'} ➡️ {dWallet ? formatValue(d.dest_amount, dWallet.currency) : 'N/A'}
                    </span>
                    {d.note && <span className="draft-note">{d.note}</span>}
                  </div>
                  <div className="draft-actions">
                    <button 
                      className="draft-btn edit" 
                      onClick={() => onSelectDraft?.(d)}
                      title="Modifier et valider ce brouillon"
                      style={{ backgroundColor: 'var(--primary-blue-glow)', color: 'var(--primary-blue)' }}
                    >
                      <Edit size={14} />
                    </button>
                    <button 
                      className="draft-btn confirm" 
                      onClick={() => handleConfirmDraft(d)}
                      title="Valider immédiatement ce brouillon"
                    >
                      <FileCheck size={16} />
                    </button>
                    <button 
                      className="draft-btn reject" 
                      onClick={() => handleDeleteDraft(d.id)}
                      title="Supprimer ce brouillon"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 4. Quick Search / Recent transactions */}
        <div className="screen-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '14px', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>Recherche & Litiges</h3>
        </div>
        
        {/* Active Filter Badge */}
        {selectedWalletId && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Filtre actif :</span>
            <span className="mock-badge" style={{ backgroundColor: 'var(--primary-blue-glow)', border: '1px solid var(--primary-blue)', color: 'var(--primary-blue)', display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '600' }} onClick={() => setSelectedWalletId(null)}>
              {wallets.find(w => w.id === selectedWalletId)?.name}
              <span style={{ fontWeight: 'bold', fontSize: '12px' }}>×</span>
            </span>
          </div>
        )}

        <div className="form-group" style={{ marginBottom: '12px' }}>
          <div className="input-icon-wrapper">
            <Search className="input-icon" size={16} />
            <input
              type="text"
              className="form-control input-with-icon"
              placeholder="Rechercher par ID Transaction, Note..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="ledger-list">
          {filteredTransactions.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', padding: '15px' }}>
              Aucune transaction trouvée.
            </p>
          ) : (
            filteredTransactions.map(t => {
              const sWallet = wallets.find(w => w.id === t.source_wallet_id);
              const dWallet = wallets.find(w => w.id === t.dest_wallet_id);
              const dateStr = new Date(t.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
              return (
                <div 
                  key={t.id} 
                  className="ledger-item" 
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedTxn(t)}
                >
                  <div className="ledger-left">
                    <div className="ledger-icon-box exchange">
                      <ArrowLeftRight size={18} />
                    </div>
                    <div className="ledger-details">
                      <span className="ledger-title">
                        {sWallet ? sWallet.name : 'Apport Capital'} ➡️ {dWallet ? dWallet.name : 'Retrait Capital'}
                      </span>
                      <span className="ledger-subtitle">
                        {dateStr} • {t.note || 'Pas de note'}
                      </span>
                    </div>
                  </div>
                  <div className="ledger-right">
                    {sWallet && (
                      <span className="ledger-value negative">
                        -{formatValue(t.source_amount, sWallet.currency)}
                      </span>
                    )}
                    {dWallet && (
                      <span className="ledger-value positive" style={{ fontSize: '12px', marginTop: '2px', color: 'var(--color-green)' }}>
                        +{formatValue(t.dest_amount, dWallet.currency)}
                      </span>
                    )}
                    {t.transaction_id && (
                      <span className="ledger-txn-id">ID: {t.transaction_id}</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Transaction Detail Modal Drawer */}
      {selectedTxn && (
        <div className="modal-overlay" onClick={() => setSelectedTxn(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4 className="modal-title">Détails de la Transaction</h4>
              <button className="modal-close" onClick={() => setSelectedTxn(null)}>Fermer</button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Portefeuille Source</span>
                  {selectedTxn.source_wallet_id ? (
                    <>
                      <p style={{ fontWeight: '600' }}>{wallets.find(w => w.id === selectedTxn.source_wallet_id)?.name}</p>
                      <p style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--color-red)', marginTop: '2px' }}>
                        -{formatValue(selectedTxn.source_amount, wallets.find(w => w.id === selectedTxn.source_wallet_id)?.currency)}
                      </p>
                    </>
                  ) : (
                    <p style={{ fontWeight: '500', color: 'var(--text-secondary)', marginTop: '2px' }}>Aucun (Dépôt Capital)</p>
                  )}
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Portefeuille Dest.</span>
                  {selectedTxn.dest_wallet_id ? (
                    <>
                      <p style={{ fontWeight: '600' }}>{wallets.find(w => w.id === selectedTxn.dest_wallet_id)?.name}</p>
                      <p style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--color-green)', marginTop: '2px' }}>
                        +{formatValue(selectedTxn.dest_amount, wallets.find(w => w.id === selectedTxn.dest_wallet_id)?.currency)}
                      </p>
                    </>
                  ) : (
                    <p style={{ fontWeight: '500', color: 'var(--text-secondary)', marginTop: '2px' }}>Aucun (Retrait Capital)</p>
                  )}
                </div>
              </div>

              {selectedTxn.type === 'exchange' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Taux Pratiqué</span>
                    <p style={{ fontWeight: '600', fontSize: '14px' }}>{selectedTxn.exchange_rate}</p>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Bénéfice Réalisé</span>
                    <p style={{ fontWeight: '600', fontSize: '14px', color: 'var(--color-green)' }}>
                      +{formatValue(selectedTxn.profit_usd, 'USD')}
                    </p>
                  </div>
                </div>
              )}

              {selectedTxn.transaction_id && (
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>ID Unique de Réseau (Preuve Litige)</span>
                  <p style={{ fontFamily: 'monospace', fontWeight: '600', fontSize: '14px', color: 'var(--text-primary)', marginTop: '2px' }}>
                    {selectedTxn.transaction_id}
                  </p>
                </div>
              )}

              {selectedTxn.note && (
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Note de Transaction</span>
                  <p style={{ fontSize: '13px' }}>{selectedTxn.note}</p>
                </div>
              )}

              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Date & Heure</span>
                <p style={{ fontSize: '13px' }}>{new Date(selectedTxn.timestamp).toLocaleString('fr-FR')}</p>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
