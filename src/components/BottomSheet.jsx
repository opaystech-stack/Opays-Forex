import { useState, useRef, useEffect } from 'react';
import { ArrowRightLeft, Wallet, Receipt, Landmark, CalendarCheck, MessageSquare } from 'lucide-react';
import { useT } from '../i18n';
import { useApp } from '../context/AppContext';

export default function BottomSheet({ onOpenTransaction, onOpenExpense, onOpenLoan, onOpenTransfer, onOpenSubscription, onOpenTicket }) {
  const t = useT();
  const { wallets, transactions, getTodayStats } = useApp();
  const [expanded, setExpanded] = useState(false);
  const sheetRef = useRef(null);
  const startY = useRef(0);
  const currentY = useRef(0);

  const stats = getTodayStats ? getTodayStats() : { profitUSD: 0, bizExpenseUSD: 0, netProfitUSD: 0, volumeUSD: 0 };

  const recentTransactions = transactions
    .filter(t => t.status === 'completed')
    .slice(0, 5);

  useEffect(() => {
    if (sheetRef.current) {
      sheetRef.current.style.transform = expanded ? 'translateY(0)' : 'translateY(calc(100% - 180px))';
    }
  }, [expanded]);

  const handleTouchStart = (e) => {
    startY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e) => {
    currentY.current = e.touches[0].clientY;
    const delta = currentY.current - startY.current;
    if (sheetRef.current) {
      const base = expanded ? 0 : window.innerHeight - 180;
      sheetRef.current.style.transform = `translateY(${Math.max(0, base + delta)}px)`;
    }
  };

  const handleTouchEnd = () => {
    const delta = currentY.current - startY.current;
    setExpanded(delta < -50 ? true : delta > 50 ? false : expanded);
    if (sheetRef.current) {
      sheetRef.current.style.transform = '';
    }
  };

  return (
    <div
      ref={sheetRef}
      className="ofx-bottom-sheet"
      style={{ transform: 'translateY(calc(100% - 180px))' }}
    >
      <div
        className="ofx-sheet-handle"
        onClick={() => setExpanded(!expanded)}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />

      <div className="ofx-sheet-content">
        <div className="ofx-kpi-grid">
          <div className="ofx-kpi-card">
            <div className="ofx-kpi-label">{t('dashboard.profit')}</div>
            <div className={`ofx-kpi-value ${stats.profitUSD >= 0 ? 'positive' : 'negative'}`}>+${stats.profitUSD.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</div>
          </div>
          <div className="ofx-kpi-card">
            <div className="ofx-kpi-label">{t('dashboard.net_kiosk')}</div>
            <div className={`ofx-kpi-value ${stats.netProfitUSD >= 0 ? 'positive' : 'negative'}`}>${stats.netProfitUSD.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</div>
          </div>
        </div>

        <div className="ofx-section-title">{t('ui.quickActions') || 'Actions rapides'}</div>
        <div className="ofx-quick-actions">
          <button className="ofx-quick-btn" onClick={onOpenTransaction}>
            <ArrowRightLeft size={22} />
            <span>{t('nav.transactions')}</span>
          </button>
          <button className="ofx-quick-btn" onClick={onOpenExpense}>
            <Receipt size={22} />
            <span>{t('nav.expenses')}</span>
          </button>
          <button className="ofx-quick-btn" onClick={onOpenLoan}>
            <Landmark size={22} />
            <span>{t('nav.loans')}</span>
          </button>
          <button className="ofx-quick-btn" onClick={onOpenTransfer}>
            <Wallet size={22} />
            <span>{t('nav.transfers')}</span>
          </button>
          <button className="ofx-quick-btn" onClick={onOpenSubscription}>
            <CalendarCheck size={22} />
            <span>{t('nav.subscriptions')}</span>
          </button>
          <button className="ofx-quick-btn" onClick={onOpenTicket}>
            <MessageSquare size={22} />
            <span>{t('nav.tickets')}</span>
          </button>
        </div>

        <div className="ofx-section-title">{t('dashboard.search_title')}</div>
        {recentTransactions.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>{t('dashboard.no_txns')}</p>
        ) : (
          recentTransactions.map(t => {
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
    </div>
  );
}
