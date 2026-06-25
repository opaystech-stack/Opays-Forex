import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { TrendingDown, CheckCircle2, AlertCircle } from 'lucide-react';
import { useT } from '../i18n';

export default function Expenses() {
  const { wallets, expenses, addExpense, loading } = useApp();
  const t = useT();

  const BUSINESS_CATEGORIES = t('expenses.categories.business') || [];
  const PERSONAL_CATEGORIES = t('expenses.categories.personal') || [];

  const [walletId, setWalletId] = useState('');
  const [amount, setAmount] = useState('');
  const [isBusiness, setIsBusiness] = useState(true);
  const [category, setCategory] = useState(BUSINESS_CATEGORIES[0]);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState(null);

  const activeWalletId = walletId || (wallets.length > 0 ? wallets[0].id : '');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const finalWalletId = walletId || (wallets.length > 0 ? wallets[0].id : '');
    if (!finalWalletId || !amount || !category) {
      setMessage({ type: 'error', text: t('expenses.required_fields') });
      return;
    }
    const res = await addExpense({
      wallet_id: finalWalletId,
      amount: parseFloat(amount),
      is_business: isBusiness,
      category,
      note: note || '',
    });
    if (res.success) {
      setMessage({ type: 'success', text: t('expenses.created_success') });
      setAmount('');
      setNote('');
    } else {
      setMessage({ type: 'error', text: t('settings.rates_update_error') + res.error });
    }
  };

  const getWalletName = (wId) => wallets.find(w => w.id === wId)?.name || t('expenses.wallet_unknown');
  const getWalletCurrency = (wId) => wallets.find(w => w.id === wId)?.currency || '';
  const formatValue = (val, currency) => new Intl.NumberFormat('fr-FR').format(val) + ' ' + currency;

  if (loading) {
    return (
      <div className="ofx-loading-center">
        <div className="ofx-spinner" />
        <span>{t('loading.data')}</span>
      </div>
    );
  }

  return (
    <div className="ofx-scrollable-page">
      <div className="ofx-screen-header">
        <div>
          <h2 className="ofx-screen-title">{t('expenses.title')}</h2>
          <p className="ofx-screen-desc">{t('expenses.desc')}</p>
        </div>
      </div>

      {message && (
        <div className={`ofx-alert ${message.type === 'success' ? 'ofx-alert-success' : 'ofx-alert-error'}`}>
          {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{message.text}</span>
        </div>
      )}

      <div className="ofx-toggle-group">
        <button
          type="button"
          className={`ofx-toggle ${isBusiness ? 'active' : ''}`}
          onClick={() => { setIsBusiness(true); setCategory(BUSINESS_CATEGORIES[0]); }}
        >
          {t('expenses.pro')}
        </button>
        <button
          type="button"
          className={`ofx-toggle ${!isBusiness ? 'active' : ''}`}
          onClick={() => { setIsBusiness(false); setCategory(PERSONAL_CATEGORIES[0]); }}
        >
          {t('expenses.personal')}
        </button>
      </div>

      {wallets.length === 0 ? (
        <div className="ofx-empty-card">
          <AlertCircle size={40} />
          <h3>{t('expenses.no_wallets')}</h3>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="ofx-card">
          <div className="ofx-form-group">
            <label>{t('expenses.wallet_label')}</label>
            <select className="ofx-input" value={activeWalletId} onChange={(e) => setWalletId(e.target.value)}>
              {wallets.map(w => <option key={w.id} value={w.id}>{w.name} ({w.currency})</option>)}
            </select>
          </div>
          <div className="ofx-form-row">
            <div className="ofx-form-group">
              <label>{t('expenses.amount_label')}</label>
              <input type="number" step="any" className="ofx-input" placeholder={t('expenses.amount_placeholder')} value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div className="ofx-form-group">
              <label>{t('expenses.category_label')}</label>
              <select className="ofx-input" value={category} onChange={(e) => setCategory(e.target.value)}>
                {isBusiness
                  ? BUSINESS_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)
                  : PERSONAL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="ofx-form-group">
            <label>{t('expenses.note_label')}</label>
            <input type="text" className="ofx-input" placeholder={t('expenses.note_placeholder')} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <button type="submit" className={`ofx-btn ${isBusiness ? 'ofx-btn-info' : 'ofx-btn-warn'}`}>
            <TrendingDown size={16} />
            <span>{t('expenses.save')}</span>
          </button>
        </form>
      )}

      <div className="ofx-section">
        <div className="ofx-section-header">
          <span>{t('expenses.recent_title')}</span>
        </div>
        <div className="ofx-list">
          {expenses.length === 0 ? (
            <p className="ofx-empty">{t('expenses.recent_none')}</p>
          ) : (
            expenses.slice(0, 10).map(e => {
              const dateStr = new Date(e.timestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' + new Date(e.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
              return (
                <div key={e.id} className="ofx-list-item">
                  <div className={`ofx-list-icon ${e.is_business ? 'info' : 'warn'}`}><TrendingDown size={18} /></div>
                  <div className="ofx-list-body">
                    <div className="ofx-list-title">{e.category}</div>
                    <div className="ofx-list-sub">{getWalletName(e.wallet_id)} • {dateStr}</div>
                    {e.note && <div className="ofx-list-note">{e.note}</div>}
                  </div>
                  <div className="ofx-list-amounts">
                    <span className="minus">-{formatValue(e.amount, getWalletCurrency(e.wallet_id))}</span>
                    <span className="ofx-list-tag">{e.is_business ? t('expenses.pro_label') : t('expenses.personal_label')}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
