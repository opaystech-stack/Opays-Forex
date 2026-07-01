import { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  Landmark, Wallet, Search, FileCheck, Trash2, Clock, Edit,
  ChevronDown, ChevronLeft, ChevronRight, Sparkles, X, Download,
  TrendingUp, TrendingDown, DollarSign, Layers, BarChart3, AlertTriangle,
} from 'lucide-react';
import { useT } from '../i18n';
import { sumDailyProfit, sumMonthlyProfit } from '../utils/finance';
import { paginate } from '../utils/pagination';

// Renvoie la date ISO (YYYY-MM-DD) décalée de `offset` jours par rapport à aujourd'hui.
const dateOffsetISO = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return d.toISOString().split('T')[0];
};

// Variation en pourcentage entre une valeur courante et une valeur précédente.
// Retourne null quand la base est nulle (delta non significatif — pas inventé).
const pctDelta = (current, previous) => {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
};

// Petit graphique en courbe (SVG, sans dépendance) pour les revenus journaliers.
function RevenueChart({ points }) {
  const width = 360;
  const height = 200;
  const padX = 18;
  const padY = 20;
  const values = points.map((p) => p.value);
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const range = max - min || 1;
  const stepX = points.length > 1 ? (width - padX * 2) / (points.length - 1) : 0;

  const coords = points.map((p, i) => {
    const x = padX + i * stepX;
    const y = height - padY - ((p.value - min) / range) * (height - padY * 2);
    return { x, y, ...p };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
  const areaPath = coords.length
    ? `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${height - padY} L ${coords[0].x.toFixed(1)} ${height - padY} Z`
    : '';

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(99,102,241,0.28)" />
          <stop offset="50%" stopColor="rgba(79,70,229,0.12)" />
          <stop offset="100%" stopColor="rgba(67,56,202,0.0)" />
        </linearGradient>
        <linearGradient id="revStroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#4338CA" />
        </linearGradient>
      </defs>
      {[0.33, 0.66].map((g) => (
        <line key={g} x1={padX} x2={width - padX} y1={padY + g * (height - padY * 2)} y2={padY + g * (height - padY * 2)} stroke="var(--border-color)" strokeWidth="1" />
      ))}
      {areaPath && <path d={areaPath} fill="url(#revFill)" />}
      {linePath && <path d={linePath} fill="none" stroke="url(#revStroke)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
      {coords.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r="3" fill="#FFFFFF" stroke="#6366f1" strokeWidth="2" />
      ))}
    </svg>
  );
}

// Graphique en barres (volume par jour) — barre indigo sur piste grise.
function BarChart({ points }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  return (
    <div className="barchart">
      {points.map((p, i) => {
        const h = Math.max(2, (p.value / max) * 100);
        return (
          <div key={i} className="barchart__col">
            <div className="barchart__track">
              <div className="barchart__fill" style={{ height: `${h}%` }} />
            </div>
            <span className="barchart__label">{p.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// Avatar circulaire dégradé pour une carte devise (initiale du code devise).
const CARD_GRADIENTS = [
  'linear-gradient(135deg, #4F46E5, #8B8BF2)',
  'linear-gradient(135deg, #7C3AED, #4F46E5)',
  'linear-gradient(135deg, #0E7490, #22D3EE)',
  'linear-gradient(135deg, #C2410C, #F59E0B)',
  'linear-gradient(135deg, #15803D, #22D3EE)',
];

// Delta réutilisable pour une carte KPI
const KpiDelta = ({ value, note }) => {
  if (value == null) return null;
  const up = value >= 0;
  return (
    <div className={`kpi-delta ${up ? 'up' : 'down'}`}>
      {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
      {`${up ? '+' : ''}${value.toFixed(0)}%`}
      <span className="kpi-delta__note">{note}</span>
    </div>
  );
};

export default function Dashboard({
  view = 'full', // 'full', 'canvas', 'sheet'
  onSelectDraft,
  selectedWalletId: propSelectedWalletId,
  setSelectedWalletId: propSetSelectedWalletId,
  searchQuery: propSearchQuery,
  setSearchQuery: propSetSearchQuery,
}) {
  const { wallets, transactions, expenses, getNetWorthUSD, convertToUSD, getDrafts, confirmDraft, deleteDraft, loading, loans, getOutstandingLoansUSD, currentAgency } = useApp();
  const t = useT();

  const [localSelectedWalletId, localSetSelectedWalletId] = useState(null);
  const [localSearchQuery, localSetSearchQuery] = useState('');
  const [periodDays, setPeriodDays] = useState(7);
  const [txPage, setTxPage] = useState(1);
  const [bannerOpen, setBannerOpen] = useState(true);
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const renderTxnDetailsModal = () => {
    if (!selectedTxn) return null;
    return (
      <div 
        className="modal-overlay" 
        onClick={() => setSelectedTxn(null)}
        style={isMobile ? { alignItems: 'flex-end', padding: 0 } : undefined}
      >
        <div 
          className="modal-content" 
          onClick={(e) => e.stopPropagation()}
          style={isMobile ? {
            width: '100%',
            maxWidth: '100%',
            borderRadius: '24px 24px 0 0',
            margin: 0,
            maxHeight: '85vh',
            animation: 'slideUpVoice 0.3s cubic-bezier(0.32, 0.94, 0.6, 1)'
          } : undefined}
        >
          <div className="modal-header">
            <h4 className="modal-title">{t('modal.txn_details')}</h4>
            <button className="modal-close" onClick={() => setSelectedTxn(null)}>{t('modal.close')}</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Reçu Monospace MM Ticket */}
            <div style={{
              fontFamily: 'monospace',
              backgroundColor: '#F8FAFC',
              border: '1px dashed #CBD5E1',
              padding: '16px',
              borderRadius: '8px',
              color: '#0F172A',
              fontSize: '12px',
              lineHeight: '1.6',
              whiteSpace: 'pre-wrap'
            }}>
              <div style={{ textAlign: 'center', fontWeight: 'bold', marginBottom: '8px', fontSize: '13px' }}>
                === RECEPISSE TRANSACTION ===
              </div>
              <div>DATE: {new Date(selectedTxn.timestamp).toLocaleString('fr-FR')}</div>
              <div>TICKET ID: {selectedTxn.transaction_id || selectedTxn.id}</div>
              <div>TYPE: {txTypeLabel(selectedTxn).toUpperCase()}</div>
              <div style={{ borderBottom: '1px dashed #CBD5E1', margin: '8px 0' }} />
              {selectedTxn.source_wallet_id && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>SOURCE ({wallets.find((w) => w.id === selectedTxn.source_wallet_id)?.name}):</span>
                  <span>-{formatValue(selectedTxn.source_amount, wallets.find((w) => w.id === selectedTxn.source_wallet_id)?.currency)}</span>
                </div>
              )}
              {selectedTxn.dest_wallet_id && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>DEST ({wallets.find((w) => w.id === selectedTxn.dest_wallet_id)?.name}):</span>
                  <span>+{formatValue(selectedTxn.dest_amount, wallets.find((w) => w.id === selectedTxn.dest_wallet_id)?.currency)}</span>
                </div>
              )}
              {selectedTxn.type === 'exchange' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>TAUX DE CHANGE:</span>
                    <span>{selectedTxn.exchange_rate}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>BENEFICE (USD):</span>
                    <span>+{formatValue(selectedTxn.profit_usd, 'USD')}</span>
                  </div>
                </>
              )}
              {selectedTxn.note && (
                <>
                  <div style={{ borderBottom: '1px dashed #CBD5E1', margin: '8px 0' }} />
                  <div>NOTE: {selectedTxn.note}</div>
                </>
              )}
              <div style={{ borderBottom: '1px dashed #CBD5E1', margin: '8px 0' }} />
              <div style={{ textAlign: 'center', fontWeight: 'bold', marginTop: '8px' }}>
                *** MERCI DE VOTRE CONFIANCE ***
              </div>
            </div>

            {/* Lightbox Trigger if image_url exists */}
            {selectedTxn.image_url && (
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Justificatif</span>
                <div 
                  onClick={() => setLightboxUrl(selectedTxn.image_url)}
                  style={{ cursor: 'pointer', position: 'relative', width: '100px', height: '100px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #E2E8F0' }}
                >
                  <img 
                    src={selectedTxn.image_url} 
                    alt="Reçu" 
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                    <Sparkles size={16} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Utilisation des propriétés si passées en argument, sinon repli sur le state local
  const selectedWalletId = propSelectedWalletId !== undefined ? propSelectedWalletId : localSelectedWalletId;
  const setSelectedWalletId = propSetSelectedWalletId || localSetSelectedWalletId;
  const searchQuery = propSearchQuery !== undefined ? propSearchQuery : localSearchQuery;
  const setSearchQuery = propSetSearchQuery || localSetSearchQuery;

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60%' }}>
        <div className="recording-dot" style={{ width: '20px', height: '20px', backgroundColor: 'var(--indigo-strong)' }}></div>
        <span style={{ marginLeft: '12px', color: 'var(--text-secondary)' }}>{t('loading.data')}</span>
      </div>
    );
  }

  const drafts = getDrafts();
  const completedTxns = transactions.filter((tx) => tx.status === 'completed');

  // Volume USD des transactions complétées un jour donné.
  const dailyVolumeUSD = (iso) =>
    completedTxns
      .filter((tx) => typeof tx.timestamp === 'string' && tx.timestamp.startsWith(iso))
      .reduce((acc, tx) => acc + convertToUSD(tx.source_amount, wallets.find((w) => w.id === tx.source_wallet_id)?.currency || 'USD'), 0);

  const getTodayStats = () => {
    const today = dateOffsetISO(0);
    const todayExp = expenses.filter((e) => e.timestamp.startsWith(today));
    const bizExpenseUSD = todayExp.filter((e) => e.is_business).reduce((acc, e) => acc + convertToUSD(e.amount, wallets.find((w) => w.id === e.wallet_id)?.currency || 'USD'), 0);
    const persExpenseUSD = todayExp.filter((e) => !e.is_business).reduce((acc, e) => acc + convertToUSD(e.amount, wallets.find((w) => w.id === e.wallet_id)?.currency || 'USD'), 0);
    const profitUSD = sumDailyProfit(completedTxns);
    return { volumeUSD: dailyVolumeUSD(today), profitUSD, bizExpenseUSD, persExpenseUSD, netProfitUSD: profitUSD - bizExpenseUSD };
  };

  const stats = getTodayStats();

  const yesterdayISO = dateOffsetISO(1);
  const now = new Date();
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthISO = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

  const monthlyGain = sumMonthlyProfit(completedTxns);
  const monthlyGainPrev = sumMonthlyProfit(completedTxns, prevMonthISO);
  const profitTodayPrev = sumDailyProfit(completedTxns, yesterdayISO);
  const volumeTodayPrev = dailyVolumeUSD(yesterdayISO);

  const deltaProfitMonth = pctDelta(monthlyGain, monthlyGainPrev);
  const deltaProfitToday = pctDelta(stats.profitUSD, profitTodayPrev);
  const deltaVolumeToday = pctDelta(stats.volumeUSD, volumeTodayPrev);

  const barPoints = Array.from({ length: periodDays }).map((_, i) => {
    const offset = periodDays - 1 - i;
    const iso = dateOffsetISO(offset);
    const d = new Date(iso);
    const label = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { label, value: dailyVolumeUSD(iso) };
  });
  const linePoints = Array.from({ length: periodDays }).map((_, i) => {
    const offset = periodDays - 1 - i;
    const iso = dateOffsetISO(offset);
    const d = new Date(iso);
    const label = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { label, value: sumDailyProfit(completedTxns, iso) };
  });
  const periodVolume = barPoints.reduce((a, p) => a + p.value, 0);
  const periodRevenue = linePoints.reduce((a, p) => a + p.value, 0);

  const formatValue = (value, currency) => {
    if (currency === 'USD') {
      return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD' }).format(value);
    }
    return new Intl.NumberFormat('fr-FR').format(value) + ' ' + currency;
  };
  const formatUSD = (value) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD' }).format(value);

  const filteredTransactions = completedTxns.filter((tx) => {
    if (selectedWalletId && tx.source_wallet_id !== selectedWalletId && tx.dest_wallet_id !== selectedWalletId) return false;
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const sourceWallet = wallets.find((w) => w.id === tx.source_wallet_id)?.name || '';
    const destWallet = wallets.find((w) => w.id === tx.dest_wallet_id)?.name || '';
    return (
      (tx.transaction_id && tx.transaction_id.toLowerCase().includes(query)) ||
      (tx.note && tx.note.toLowerCase().includes(query)) ||
      sourceWallet.toLowerCase().includes(query) ||
      destWallet.toLowerCase().includes(query)
    );
  });

  const txPaginated = paginate(filteredTransactions, txPage);
  const pagedTransactions = txPaginated.items;

  const handleConfirmDraft = async (draft) => {
    const res = await confirmDraft(draft.id);
    if (!res.success) alert(t('dashboard.drafts_confirm_error') + (res.error || 'Unknown'));
  };
  const handleDeleteDraft = async (draftId) => {
    if (window.confirm(t('common.confirm_delete'))) await deleteDraft(draftId);
  };

  const txTypeLabel = (tx) => {
    if (tx.type === 'deposit') return t('transactions.deposit_label');
    if (tx.type === 'withdrawal') return t('transactions.withdrawal_label');
    return t('transactions.exchange_label');
  };

  const statusMeta = (status) => {
    switch (status) {
      case 'pending': return { cls: 'pending', label: t('dashboard.status_pending') };
      case 'draft': return { cls: 'draft', label: t('dashboard.status_draft') };
      case 'cancelled':
      case 'rejected': return { cls: 'cancelled', label: t('dashboard.status_cancelled') };
      default: return { cls: 'completed', label: t('dashboard.status_completed') };
    }
  };

  const txLabel = (tx) => {
    if (tx.note) return tx.note;
    const s = wallets.find((w) => w.id === tx.source_wallet_id)?.name;
    const d = wallets.find((w) => w.id === tx.dest_wallet_id)?.name;
    return [s, d].filter(Boolean).join(' → ') || tx.transaction_id || '—';
  };

  // =========================================================================
  // VIEW: CANVAS (Background canvas with net worth and rectangular caisses grid)
  // =========================================================================
  if (view === 'canvas') {
    return (
      <div className="treasury-canvas">
        <div className="treasury-canvas-header">
          <span className="net-worth-label">{t('dashboard.patrimoine') || 'Patrimoine Total'}</span>
          <h2 className="net-worth-amount" style={{ fontSize: '38px' }}>{formatUSD(getNetWorthUSD())}</h2>
        </div>

        <div className="canvas-wallets-section">
          <h3 className="canvas-section-title">{t('dashboard.wallets') || 'Mes Caisses'}</h3>
          {wallets.length === 0 ? (
            <p className="no-wallets-text">{t('dashboard.wallets_none')}</p>
          ) : (
            <div className="canvas-wallets-grid">
              {wallets.map((w, i) => {
                const isActive = selectedWalletId === w.id;
                return (
                  <button
                    type="button"
                    key={w.id}
                    className={`canvas-wallet-card ${isActive ? 'active' : ''}`}
                    onClick={() => { setSelectedWalletId(isActive ? null : w.id); setTxPage(1); }}
                  >
                    <div className="wallet-card-left">
                      <span className="wallet-avatar" style={{ background: CARD_GRADIENTS[i % CARD_GRADIENTS.length] }}>
                        {(w.currency || '?').slice(0, 1)}
                      </span>
                      <div className="wallet-details">
                        <span className="wallet-currency">{w.currency}</span>
                        <span className="wallet-name" title={w.name}>{w.name}</span>
                      </div>
                    </div>
                    <div className="wallet-card-right">
                      <span className="wallet-balance">{formatValue(w.balance, w.currency)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW: SHEET (KPIs, Charts, Drafts, Transactions inside sliding bottom sheet)
  // =========================================================================
  const renderSheetContent = () => (
    <div className="dashboard-sheet-view">
      {/* Grille KPI (3 cartes, Patrimoine étant exclu car sur le canvas) */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-card__head">
            <span className="kpi-icon"><Layers size={17} /></span>
            <span className="kpi-label">{t('dashboard.kpi_volume')}</span>
          </div>
          <div className="kpi-value">{formatUSD(stats.volumeUSD)}</div>
          <KpiDelta value={deltaVolumeToday} note={t('dashboard.vs_yesterday')} />
        </div>
        <div className="kpi-card">
          <div className="kpi-card__head">
            <span className="kpi-icon"><DollarSign size={17} /></span>
            <span className="kpi-label">{t('dashboard.kpi_profit_today')}</span>
          </div>
          <div className="kpi-value" style={{ color: stats.profitUSD >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>{formatUSD(stats.profitUSD)}</div>
          <KpiDelta value={deltaProfitToday} note={t('dashboard.vs_yesterday')} />
        </div>
        <div className="kpi-card">
          <div className="kpi-card__head">
            <span className="kpi-icon"><BarChart3 size={17} /></span>
            <span className="kpi-label">{t('dashboard.kpi_profit_month')}</span>
          </div>
          <div className="kpi-value" style={{ color: monthlyGain >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>{formatUSD(monthlyGain)}</div>
          <KpiDelta value={deltaProfitMonth} note={t('dashboard.vs_last_month')} />
        </div>
      </div>

      {/* Rangée graphiques : volume (barres) + revenu (courbe) */}
      <div className="dash-charts-row">
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="dash-section-head">
            <div>
              <h3 className="dash-section-title">{t('dashboard.total_volume')}</h3>
              <span className="chart-card-value">{formatUSD(periodVolume)}</span>
            </div>
          </div>
          <BarChart points={barPoints} />
        </div>
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="dash-section-head">
            <div>
              <h3 className="dash-section-title">{t('dashboard.total_revenue')}</h3>
              <span className="chart-card-value" style={{ color: periodRevenue >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>{formatUSD(periodRevenue)}</span>
            </div>
          </div>
          <RevenueChart points={linePoints} />
        </div>
      </div>

      {/* Indicateurs secondaires */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
          <span style={{ color: 'var(--text-secondary)' }}>{t('dashboard.net_kiosk')}</span>
          <span style={{ fontWeight: '600', color: stats.netProfitUSD >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
            {formatUSD(stats.netProfitUSD)}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', borderTop: '1px solid var(--border-color)', paddingTop: '6px' }}>
          <span style={{ color: 'var(--text-secondary)' }}>{t('dashboard.personal_withdrawals')}</span>
          <span style={{ fontWeight: '600', color: 'var(--color-orange)' }}>{formatUSD(stats.persExpenseUSD)}</span>
        </div>
      </div>

      {/* Brouillons (WhatsApp) */}
      {drafts.length > 0 && (
        <div className="drafts-panel" style={{ marginBottom: '16px' }}>
          <div className="drafts-header">
            <AlertTriangle size={14} />
            <span>{drafts.length} {t('dashboard.drafts_pending')}</span>
            <span className="drafts-badge-blink" />
          </div>
          {drafts.map((d) => {
            const sWallet = wallets.find((w) => w.id === d.source_wallet_id);
            const dWallet = wallets.find((w) => w.id === d.dest_wallet_id);
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
                  <button className="draft-btn edit" onClick={() => onSelectDraft?.(d)} title="Modifier">
                    <Edit size={14} />
                  </button>
                  <button className="draft-btn confirm" onClick={() => handleConfirmDraft(d)} title="Valider">
                    <FileCheck size={16} />
                  </button>
                  <button className="draft-btn reject" onClick={() => handleDeleteDraft(d.id)} title="Supprimer">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Transactions récentes */}
      <div className="card" style={{ marginBottom: 0 }}>
        <div className="dash-section-head" style={{ marginBottom: '12px' }}>
          <h3 className="dash-section-title">{t('dashboard.recent_transactions')}</h3>
        </div>

        {selectedWalletId && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{t('dashboard.filter_active')}</span>
            <span onClick={() => { setSelectedWalletId(null); setTxPage(1); }} style={{ cursor: 'pointer', backgroundColor: 'var(--indigo-soft)', border: '1px solid var(--indigo-border)', color: 'var(--indigo-strong)', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '600' }}>
              {wallets.find((w) => w.id === selectedWalletId)?.name}
              <span style={{ fontWeight: 'bold' }}>×</span>
            </span>
          </div>
        )}

        {filteredTransactions.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', padding: '15px' }}>{t('dashboard.no_txns')}</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="dash-table">
              <thead>
                <tr>
                  <th>{t('dashboard.col_client')}</th>
                  <th>{t('dashboard.col_date')}</th>
                  <th>{t('dashboard.col_type')}</th>
                  <th style={{ textAlign: 'right' }}>{t('dashboard.col_amount')}</th>
                  <th style={{ textAlign: 'right' }}>{t('dashboard.col_status')}</th>
                </tr>
              </thead>
              <tbody>
                {pagedTransactions.map((tx) => {
                  const sWallet = wallets.find((w) => w.id === tx.source_wallet_id);
                  const dWallet = wallets.find((w) => w.id === tx.dest_wallet_id);
                  const mainWallet = sWallet || dWallet;
                  const mainAmount = sWallet ? tx.source_amount : tx.dest_amount;
                  const dateStr = new Date(tx.timestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
                  const label = txLabel(tx);
                  const meta = statusMeta(tx.status);
                  return (
                    <tr key={tx.id} onClick={() => setSelectedTxn(tx)} style={{ cursor: 'pointer' }}>
                      <td>
                        <span className="dash-client">
                          <span className="dash-client__avatar">{label.replace(/[^A-Za-z0-9]/g, '').slice(0, 1).toUpperCase() || '#'}</span>
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px', display: 'inline-block' }} title={label}>{label}</span>
                        </span>
                      </td>
                      <td>{dateStr}</td>
                      <td>{txTypeLabel(tx)}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {mainWallet ? formatValue(mainAmount, mainWallet.currency) : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className={`status-pill ${meta.cls}`}>{meta.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {txPaginated.totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ width: 'auto', padding: '8px 14px', borderRadius: '8px', margin: 0, minHeight: '44px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => setTxPage((p) => p - 1)}
                  disabled={!txPaginated.hasPrevious}
                  aria-label="Page précédente"
                >
                  <ChevronLeft size={16} />
                  <span>{t('pagination.previous') || 'Précédent'}</span>
                </button>
                <span>
                  {txPaginated.page} / {txPaginated.totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ width: 'auto', padding: '8px 14px', borderRadius: '8px', margin: 0, minHeight: '44px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => setTxPage((p) => p + 1)}
                  disabled={!txPaginated.hasNext}
                  aria-label="Page suivante"
                >
                  <span>{t('pagination.next') || 'Suivant'}</span>
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {renderTxnDetailsModal()}
    </div>
  );

  if (view === 'sheet') {
    return renderSheetContent();
  }

  // =========================================================================
  // VIEW: FULL (Standard view, used on desktop/fallback)
  // =========================================================================
  return (
    <div className="dashboard-v2">
      {/* Bannière premium */}
      {bannerOpen && (
        <div className="promo-banner">
          <div className="promo-banner__text">
            <span className="promo-banner__title"><Sparkles size={14} /> {t('dashboard.banner_title')}</span>
            <span className="promo-banner__desc">{t('dashboard.banner_text')}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button type="button" className="promo-banner__cta">{t('dashboard.banner_cta')}</button>
            <button type="button" className="promo-banner__close" aria-label="Fermer" onClick={() => setBannerOpen(false)}>
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* En-tête « Aperçu » + période + export */}
      <div className="dash-overview-head">
        <h2 className="dash-overview-title">{t('dashboard.overview')}</h2>
        <div className="dash-overview-actions">
          <div className="dash-period">
            <select value={periodDays} onChange={(e) => setPeriodDays(Number(e.target.value))} className="form-control" aria-label={t('dashboard.period_label')}>
              <option value={7}>{t('dashboard.period_7')}</option>
              <option value={30}>{t('dashboard.period_30')}</option>
            </select>
            <ChevronDown size={16} className="dash-period-icon" />
          </div>
          <button type="button" className="dash-chip dash-chip--btn"><Download size={14} /> {t('dashboard.export')}</button>
        </div>
      </div>

      {/* Grille KPI (4 cartes) */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-card__head">
            <span className="kpi-icon"><Landmark size={17} /></span>
            <span className="kpi-label">{t('dashboard.patrimoine')}</span>
          </div>
          <div className="kpi-value">{formatUSD(getNetWorthUSD())}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card__head">
            <span className="kpi-icon"><Layers size={17} /></span>
            <span className="kpi-label">{t('dashboard.kpi_volume')}</span>
          </div>
          <div className="kpi-value">{formatUSD(stats.volumeUSD)}</div>
          <KpiDelta value={deltaVolumeToday} note={t('dashboard.vs_yesterday')} />
        </div>
        <div className="kpi-card">
          <div className="kpi-card__head">
            <span className="kpi-icon"><DollarSign size={17} /></span>
            <span className="kpi-label">{t('dashboard.kpi_profit_today')}</span>
          </div>
          <div className="kpi-value" style={{ color: stats.profitUSD >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>{formatUSD(stats.profitUSD)}</div>
          <KpiDelta value={deltaProfitToday} note={t('dashboard.vs_yesterday')} />
        </div>
        <div className="kpi-card">
          <div className="kpi-card__head">
            <span className="kpi-icon"><BarChart3 size={17} /></span>
            <span className="kpi-label">{t('dashboard.kpi_profit_month')}</span>
          </div>
          <div className="kpi-value" style={{ color: monthlyGain >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>{formatUSD(monthlyGain)}</div>
          <KpiDelta value={deltaProfitMonth} note={t('dashboard.vs_last_month')} />
        </div>
      </div>

      {/* Rangée graphiques : volume (barres) + revenu (courbe) */}
      <div className="dash-charts-row">
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="dash-section-head">
            <div>
              <h3 className="dash-section-title">{t('dashboard.total_volume')}</h3>
              <span className="chart-card-value">{formatUSD(periodVolume)}</span>
            </div>
          </div>
          <BarChart points={barPoints} />
        </div>
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="dash-section-head">
            <div>
              <h3 className="dash-section-title">{t('dashboard.total_revenue')}</h3>
              <span className="chart-card-value" style={{ color: periodRevenue >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>{formatUSD(periodRevenue)}</span>
            </div>
          </div>
          <RevenueChart points={linePoints} />
        </div>
      </div>

      {/* Indicateurs secondaires */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
          <span style={{ color: 'var(--text-secondary)' }}>{t('dashboard.net_kiosk')}</span>
          <span style={{ fontWeight: '600', color: stats.netProfitUSD >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
            {formatUSD(stats.netProfitUSD)}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', borderTop: '1px solid var(--border-color)', paddingTop: '6px' }}>
          <span style={{ color: 'var(--text-secondary)' }}>{t('dashboard.personal_withdrawals')}</span>
          <span style={{ fontWeight: '600', color: 'var(--color-orange)' }}>{formatUSD(stats.persExpenseUSD)}</span>
        </div>
      </div>

      {/* Cartes devises / caisses */}
      <div className="card" style={{ marginBottom: '18px' }}>
        <div className="dash-section-head" style={{ marginBottom: '12px' }}>
          <h3 className="dash-section-title">{t('dashboard.wallets') || 'Mes Caisses'}</h3>
        </div>
        {wallets.length === 0 ? (
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '6px 0' }}>
            {t('dashboard.wallets_none')}
          </p>
        ) : (
          <div className="fx-cards-row">
            {wallets.map((w, i) => {
              const isActive = selectedWalletId === w.id;
              return (
                <button
                  type="button"
                  key={w.id}
                  className={`fx-card ${isActive ? 'active' : ''}`}
                  onClick={() => { setSelectedWalletId(isActive ? null : w.id); setTxPage(1); }}
                >
                  <span className="fx-card-avatar" style={{ background: CARD_GRADIENTS[i % CARD_GRADIENTS.length] }}>
                    {(w.currency || '?').slice(0, 1)}
                  </span>
                  <span className="fx-card-body">
                    <span className="fx-card-currency">{w.currency}</span>
                    <span className="fx-card-balance">{formatValue(w.balance, w.currency)}</span>
                    <span className="fx-card-name" title={w.name}>{w.name}</span>
                  </span>
                  {w.type === 'cash'
                    ? <Landmark size={14} className="fx-card-icon" />
                    : <Wallet size={14} className="fx-card-icon" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Carte Prêts */}
      {loans.length > 0 && (
        <div className="card glass-card" style={{ padding: '14px 18px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span className="net-worth-label" style={{ fontSize: '12px', margin: 0 }}>Dette active (Prêts)</span>
            <div className="net-worth-amount" style={{ fontSize: '20px', marginTop: '4px', marginBottom: 0 }}>
              {new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(getOutstandingLoansUSD())}
              <span className="net-worth-currency" style={{ fontSize: '12px', marginLeft: '4px' }}>USD</span>
            </div>
          </div>
          <span style={{ fontSize: '11px', fontWeight: '700', backgroundColor: 'rgba(255, 140, 0, 0.15)', color: 'var(--color-orange)', padding: '3px 8px', borderRadius: '12px' }}>
            {loans.filter((l) => l.status === 'pending').length} actifs
          </span>
        </div>
      )}

      {/* Brouillons */}
      {drafts.length > 0 && (
        <div className="drafts-panel" style={{ marginBottom: '16px' }}>
          <div className="drafts-header">
            <AlertTriangle size={14} />
            <span>{drafts.length} {t('dashboard.drafts_pending')}</span>
            <span className="drafts-badge-blink" />
          </div>
          {drafts.map((d) => {
            const sWallet = wallets.find((w) => w.id === d.source_wallet_id);
            const dWallet = wallets.find((w) => w.id === d.dest_wallet_id);
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
                  <button className="draft-btn edit" onClick={() => onSelectDraft?.(d)} title="Modifier">
                    <Edit size={14} />
                  </button>
                  <button className="draft-btn confirm" onClick={() => handleConfirmDraft(d)} title="Valider">
                    <FileCheck size={16} />
                  </button>
                  <button className="draft-btn reject" onClick={() => handleDeleteDraft(d.id)} title="Supprimer">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Transactions récentes */}
      <div className="card">
        <div className="dash-section-head" style={{ marginBottom: '12px' }}>
          <h3 className="dash-section-title">{t('dashboard.recent_transactions')}</h3>
        </div>

        {selectedWalletId && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{t('dashboard.filter_active')}</span>
            <span onClick={() => { setSelectedWalletId(null); setTxPage(1); }} style={{ cursor: 'pointer', backgroundColor: 'var(--indigo-soft)', border: '1px solid var(--indigo-border)', color: 'var(--indigo-strong)', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '600' }}>
              {wallets.find((w) => w.id === selectedWalletId)?.name}
              <span style={{ fontWeight: 'bold' }}>×</span>
            </span>
          </div>
        )}

        <div className="form-group" style={{ marginBottom: '12px' }}>
          <div className="input-icon-wrapper">
            <Search className="input-icon" size={16} />
            <input type="text" className="form-control input-with-icon" placeholder={t('dashboard.search_placeholder')} value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setTxPage(1); }} />
          </div>
        </div>

        {filteredTransactions.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', padding: '15px' }}>{t('dashboard.no_txns')}</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="dash-table">
              <thead>
                <tr>
                  <th>{t('dashboard.col_client')}</th>
                  <th>{t('dashboard.col_date')}</th>
                  <th>{t('dashboard.col_type')}</th>
                  <th style={{ textAlign: 'right' }}>{t('dashboard.col_amount')}</th>
                  <th style={{ textAlign: 'right' }}>{t('dashboard.col_status')}</th>
                </tr>
              </thead>
              <tbody>
                {pagedTransactions.map((tx) => {
                  const sWallet = wallets.find((w) => w.id === tx.source_wallet_id);
                  const dWallet = wallets.find((w) => w.id === tx.dest_wallet_id);
                  const mainWallet = sWallet || dWallet;
                  const mainAmount = sWallet ? tx.source_amount : tx.dest_amount;
                  const dateStr = new Date(tx.timestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
                  const label = txLabel(tx);
                  const meta = statusMeta(tx.status);
                  return (
                    <tr key={tx.id} onClick={() => setSelectedTxn(tx)} style={{ cursor: 'pointer' }}>
                      <td>
                        <span className="dash-client">
                          <span className="dash-client__avatar">{label.replace(/[^A-Za-z0-9]/g, '').slice(0, 1).toUpperCase() || '#'}</span>
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px', display: 'inline-block' }} title={label}>{label}</span>
                        </span>
                      </td>
                      <td>{dateStr}</td>
                      <td>{txTypeLabel(tx)}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {mainWallet ? formatValue(mainAmount, mainWallet.currency) : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className={`status-pill ${meta.cls}`}>{meta.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {txPaginated.totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ width: 'auto', padding: '8px 14px', borderRadius: '8px', margin: 0, minHeight: '44px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => setTxPage((p) => p - 1)}
                  disabled={!txPaginated.hasPrevious}
                  aria-label="Page précédente"
                >
                  <ChevronLeft size={16} />
                  <span>{t('pagination.previous') || 'Précédent'}</span>
                </button>
                <span>
                  {txPaginated.page} / {txPaginated.totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ width: 'auto', padding: '8px 14px', borderRadius: '8px', margin: 0, minHeight: '44px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => setTxPage((p) => p + 1)}
                  disabled={!txPaginated.hasNext}
                  aria-label="Page suivante"
                >
                  <span>{t('pagination.next') || 'Suivant'}</span>
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {renderTxnDetailsModal()}

      {/* Lightbox full-screen */}
      {lightboxUrl && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'zoom-out'
          }}
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              cursor: 'pointer'
            }}
          >
            <X size={24} />
          </button>
          <img
            src={lightboxUrl}
            alt="Justificatif plein écran"
            style={{
              maxWidth: '95vw',
              maxHeight: '95vh',
              objectFit: 'contain'
            }}
          />
        </div>
      )}
    </div>
  );
}
