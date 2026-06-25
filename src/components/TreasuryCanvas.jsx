import { useState, useMemo } from 'react';
import { Landmark, Wallet, Smartphone } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useT } from '../i18n';

function getIcon(type) {
  if (type === 'cash') return <Landmark size={22} />;
  if (type === 'mobile_money') return <Smartphone size={20} />;
  return <Wallet size={20} />;
}

export default function TreasuryCanvas({ searchQuery }) {
  const t = useT();
  const { wallets, transactions, getNetWorthUSD } = useApp();
  const [hoveredNode, setHoveredNode] = useState(null);

  const filteredWallets = useMemo(() => {
    if (!searchQuery) return wallets;
    const q = searchQuery.toLowerCase();
    return wallets.filter(w =>
      w.name.toLowerCase().includes(q) ||
      w.currency.toLowerCase().includes(q)
    );
  }, [wallets, searchQuery]);

  const formatValue = (value, currency) => {
    if (currency === 'USD') return `$${Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 0 })}`;
    return `${Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} ${currency}`;
  };

  const [now] = useState(() => Date.now());

  const profitPoints = useMemo(() => {
    const days = 7;
    const points = [];
    for (let i = 0; i <= days; i++) {
      const d = new Date(now - (days - i) * 86400000).toISOString().split('T')[0];
      const dayProfit = transactions
        .filter(t => t.status === 'completed' && t.timestamp && t.timestamp.startsWith(d))
        .reduce((acc, t) => acc + (parseFloat(t.profit_usd) || 0), 0);
      points.push({ day: d.slice(5), value: Math.max(0, dayProfit) });
    }
    return points;
  }, [transactions, now]);

  const maxProfit = Math.max(...profitPoints.map(p => p.value), 1);
  const pathD = profitPoints
    .map((p, i) => {
      const x = (i / (profitPoints.length - 1)) * 100;
      const y = 100 - (p.value / maxProfit) * 80;
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  return (
    <div className="ofx-canvas">
      <div className="ofx-canvas-header">
        <div className="ofx-canvas-title">{t('dashboard.overview') || 'Vue ensemble'}</div>
        <div className="ofx-canvas-subtitle">{filteredWallets.length} caisse(s)</div>
      </div>

      <div className="ofx-canvas-balance">
        <div className="ofx-canvas-label">{t('dashboard.totalAssets') || 'Patrimoine total'}</div>
        <div className="ofx-canvas-amount">
          ${getNetWorthUSD().toLocaleString('fr-FR', { maximumFractionDigits: 0 })}
        </div>
        <div className="ofx-canvas-hint">USD equivalent</div>
      </div>

      <div className="ofx-profit-curve">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--opays-blue-light)" stopOpacity="0.5" />
              <stop offset="100%" stopColor="var(--opays-blue)" stopOpacity="0.05" />
            </linearGradient>
          </defs>
          <path d={`${pathD} L 100 100 L 0 100 Z`} fill="url(#profitGradient)" />
          <path d={pathD} fill="none" stroke="var(--opays-blue-light)" strokeWidth="0.6" />
        </svg>
        <div className="ofx-curve-label">{t('dashboard.profit7d') || 'Benefice 7 jours'}</div>
      </div>

      <div className="ofx-wallet-grid">
        {filteredWallets.map(wallet => (
          <div
            key={wallet.id}
            className="ofx-wallet-tile"
            onMouseEnter={() => setHoveredNode(wallet.id)}
            onMouseLeave={() => setHoveredNode(null)}
          >
            <div className="ofx-wallet-tile-icon">{getIcon(wallet.type)}</div>
            <div className="ofx-wallet-tile-name">{wallet.name}</div>
            <div className="ofx-wallet-tile-balance">
              {hoveredNode === wallet.id ? formatValue(wallet.balance, wallet.currency) : wallet.currency}
            </div>
          </div>
        ))}
        {filteredWallets.length === 0 && (
          <div className="ofx-empty-canvas">{t('wallets.create_first_wallet')}</div>
        )}
      </div>
    </div>
  );
}
