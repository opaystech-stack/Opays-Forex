import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Landmark, Wallet, ArrowLeftRight, Search, FileCheck, Trash2, Clock, Edit, ChevronRight, X } from 'lucide-react';
import { useT } from '../i18n';
import { useNavigate } from 'react-router-dom';

export default function Dashboard({ onSelectDraft }) {
  const navigate = useNavigate();
  const { wallets, transactions, expenses, getNetWorthUSD, convertToUSD, getDrafts, confirmDraft, deleteDraft, loading, loans, getOutstandingLoansUSD } = useApp();
  const t = useT();
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWalletId, setSelectedWalletId] = useState(null);

  if (loading) {
    return (
      <div className="ofx-loading-center">
        <div className="ofx-spinner" />
        <span>{t('loading.data')}</span>
      </div>
    );
  }

  const drafts = getDrafts();
  const completedTxns = transactions.filter(t => t.status === 'completed');

  const getTodayStats = () => {
    const today = new Date().toISOString().split('T')[0];
    const todayTxns = completedTxns.filter(t => t.timestamp.startsWith(today));
    const volumeUSD = todayTxns.reduce((acc, t) => acc + convertToUSD(t.source_amount, wallets.find(w => w.id === t.source_wallet_id)?.currency || 'USD'), 0);
    const profitUSD = todayTxns.reduce((acc, t) => acc + parseFloat(t.profit_usd), 0);
    const todayExp = expenses.filter(e => e.timestamp.startsWith(today));
    const bizExpenseUSD = todayExp.filter(e => e.is_business).reduce((acc, e) => acc + convertToUSD(e.amount, wallets.find(w => w.id === e.wallet_id)?.currency || 'USD'), 0);
    const persExpenseUSD = todayExp.filter(e => !e.is_business).reduce((acc, e) => acc + convertToUSD(e.amount, wallets.find(w => w.id === e.wallet_id)?.currency || 'USD'), 0);
    return { volumeUSD, profitUSD, bizExpenseUSD, persExpenseUSD, netProfitUSD: profitUSD - bizExpenseUSD };
  };

  const stats = getTodayStats();

  const formatValue = (value, currency) => {
    if (currency === 'USD') return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD' }).format(value);
    return new Intl.NumberFormat('fr-FR').format(value) + ' ' + currency;
  };

  const filteredTransactions = completedTxns.filter(t => {
    if (selectedWalletId && t.source_wallet_id !== selectedWalletId && t.dest_wallet_id !== selectedWalletId) return false;
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
  }).slice(0, 20);

  const handleConfirmDraft = async (draft) => {
    const res = await confirmDraft(draft.id);
    if (!res.success) alert(t('dashboard.drafts_confirm_error') + (res.error || 'Unknown'));
  };

  const handleDeleteDraft = async (draftId) => {
    if (window.confirm(t('common.confirm_delete'))) await deleteDraft(draftId);
  };

  return (
    <div className="ofx-scrollable-page">
      <div className="ofx-balance-card">
        <div className="ofx-balance-label">{t('dashboard.patrimoine')}</div>
        <div className="ofx-balance-amount">
          {getNetWorthUSD().toLocaleString('fr-FR', { maximumFractionDigits: 2 })} <span>USD</span>
        </div>
        <div className="ofx-balance-hint">{t('dashboard.consolidation')}</div>
      </div>

      <div className="ofx-stats-row">
        <div className="ofx-stat-card">
          <div className="ofx-stat-label">{t('dashboard.profit')}</div>
          <div className="ofx-stat-value plus">+{formatValue(stats.profitUSD, 'USD')}</div>
        </div>
        <div className="ofx-stat-card">
          <div className="ofx-stat-label">{t('dashboard.biz_expense')}</div>
          <div className="ofx-stat-value minus">-{formatValue(stats.bizExpenseUSD, 'USD')}</div>
        </div>
        <div className="ofx-stat-card">
          <div className="ofx-stat-label">{t('dashboard.personal_withdrawals')}</div>
          <div className="ofx-stat-value warn">{formatValue(stats.persExpenseUSD, 'USD')}</div>
        </div>
      </div>

      {loans.length > 0 && (
        <div className="ofx-alert-card" onClick={() => navigate('/app/loans')}>
          <div>
            <div className="ofx-alert-label">Dettes actives (prets)</div>
            <div className="ofx-alert-value">{getOutstandingLoansUSD().toLocaleString('fr-FR', { maximumFractionDigits: 2 })} USD</div>
          </div>
          <span className="ofx-alert-badge">{loans.filter(l => l.status === 'pending').length} actifs</span>
          <ChevronRight size={18} />
        </div>
      )}

      {drafts.length > 0 && (
        <div className="ofx-section">
          <div className="ofx-section-header">
            <Clock size={16} />
            <span>{drafts.length} {t('dashboard.drafts_pending')}</span>
          </div>
          <div className="ofx-list">
            {drafts.map(d => {
              const sWallet = wallets.find(w => w.id === d.source_wallet_id);
              const dWallet = wallets.find(w => w.id === d.dest_wallet_id);
              return (
                <div key={d.id} className="ofx-list-item">
                  <div className="ofx-list-body" onClick={() => onSelectDraft?.(d)}>
                    <div className="ofx-list-title">{sWallet?.name || 'Capital'} &rarr; {dWallet?.name || 'Capital'}</div>
                    <div className="ofx-list-sub">{formatValue(d.source_amount, sWallet?.currency || 'USD')} &rarr; {formatValue(d.dest_amount, dWallet?.currency || 'USD')}</div>
                  </div>
                  <div className="ofx-list-actions">
                    <button onClick={() => onSelectDraft?.(d)} title="Modifier"><Edit size={14} /></button>
                    <button onClick={() => handleConfirmDraft(d)} title="Valider" className="ok"><FileCheck size={14} /></button>
                    <button onClick={() => handleDeleteDraft(d.id)} title="Supprimer" className="danger"><Trash2 size={14} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="ofx-section">
        <div className="ofx-section-header">
          <span>{t('dashboard.wallets_title')}</span>
          <button className="ofx-text-btn" onClick={() => navigate('/app/wallets')}>Voir tout</button>
        </div>
        {wallets.length === 0 ? (
          <p className="ofx-empty">{t('dashboard.wallets_none')}</p>
        ) : (
          <div className="ofx-wallet-row">
            {wallets.map(w => {
              const isCash = w.type === 'cash';
              const isActive = selectedWalletId === w.id;
              return (
                <button
                  key={w.id}
                  className={`ofx-wallet-chip ${isActive ? 'active' : ''}`}
                  onClick={() => setSelectedWalletId(isActive ? null : w.id)}
                >
                  <div className="ofx-wallet-chip-icon">{isCash ? <Landmark size={16} /> : <Wallet size={16} />}</div>
                  <div className="ofx-wallet-chip-name">{w.name}</div>
                  <div className="ofx-wallet-chip-balance">{formatValue(w.balance, w.currency)}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="ofx-section">
        <div className="ofx-section-header">
          <span>{t('dashboard.search_title')}</span>
          {selectedWalletId && (
            <button className="ofx-filter-pill" onClick={() => setSelectedWalletId(null)}>
              {wallets.find(w => w.id === selectedWalletId)?.name}
              <X size={12} />
            </button>
          )}
        </div>
        <div className="ofx-input-wrapper">
          <Search size={16} />
          <input
            type="text"
            className="ofx-input"
            placeholder={t('dashboard.search_placeholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="ofx-list">
          {filteredTransactions.length === 0 ? (
            <p className="ofx-empty">{t('dashboard.no_txns')}</p>
          ) : (
            filteredTransactions.map(t => {
              const sWallet = wallets.find(w => w.id === t.source_wallet_id);
              const dWallet = wallets.find(w => w.id === t.dest_wallet_id);
              const dateStr = new Date(t.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
              return (
                <div key={t.id} className="ofx-list-item" onClick={() => setSelectedTxn(t)}>
                  <div className="ofx-list-icon"><ArrowLeftRight size={18} /></div>
                  <div className="ofx-list-body">
                    <div className="ofx-list-title">{sWallet?.name || 'Capital'} &rarr; {dWallet?.name || 'Capital'}</div>
                    <div className="ofx-list-sub">{dateStr} &bull; {t.note || 'Pas de note'}</div>
                  </div>
                  <div className="ofx-list-amounts">
                    {sWallet && <span className="minus">-{formatValue(t.source_amount, sWallet.currency)}</span>}
                    {dWallet && <span className="plus">+{formatValue(t.dest_amount, dWallet.currency)}</span>}
                    {t.transaction_id && <span className="ofx-list-id">ID {t.transaction_id}</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {selectedTxn && (
        <div className="ofx-modal" onClick={() => setSelectedTxn(null)}>
          <div className="ofx-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="ofx-modal-header">
              <h4>{t('modal.txn_details')}</h4>
              <button onClick={() => setSelectedTxn(null)}><X size={18} /></button>
            </div>
            <div className="ofx-modal-body">
              <div className="ofx-modal-row">
                <div>
                  <span>{t('modal.source_wallet')}</span>
                  <strong>{wallets.find(w => w.id === selectedTxn.source_wallet_id)?.name || '-'}</strong>
                  <div className="ofx-modal-amount minus">-{formatValue(selectedTxn.source_amount, wallets.find(w => w.id === selectedTxn.source_wallet_id)?.currency || 'USD')}</div>
                </div>
                <div>
                  <span>{t('modal.dest_wallet')}</span>
                  <strong>{wallets.find(w => w.id === selectedTxn.dest_wallet_id)?.name || '-'}</strong>
                  <div className="ofx-modal-amount plus">+{formatValue(selectedTxn.dest_amount, wallets.find(w => w.id === selectedTxn.dest_wallet_id)?.currency || 'USD')}</div>
                </div>
              </div>
              {selectedTxn.type === 'exchange' && (
                <div className="ofx-modal-row">
                  <div><span>{t('modal.rate')}</span><strong>{selectedTxn.exchange_rate}</strong></div>
                  <div><span>{t('modal.profit')}</span><strong className="plus">+{formatValue(selectedTxn.profit_usd, 'USD')}</strong></div>
                </div>
              )}
              {selectedTxn.transaction_id && (
                <div className="ofx-modal-field"><span>{t('modal.txn_id_label')}</span><strong className="mono">{selectedTxn.transaction_id}</strong></div>
              )}
              {selectedTxn.note && (
                <div className="ofx-modal-field"><span>Note</span><p>{selectedTxn.note}</p></div>
              )}
              <div className="ofx-modal-field"><span>{t('modal.date_time')}</span><strong>{new Date(selectedTxn.timestamp).toLocaleString('fr-FR')}</strong></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
