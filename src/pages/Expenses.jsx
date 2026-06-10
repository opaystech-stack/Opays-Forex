import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { TrendingDown, CheckCircle2, AlertCircle } from 'lucide-react';
import { useT } from '../i18n';

const BUSINESS_CATEGORIES = ['Loyer Kiosque', 'Transport de fonds', 'Frais Retrait', 'Airtel Commission', 'MTN Commission', 'Internet/Forfait', 'Salaire Agent', 'Autre Business'];
const PERSONAL_CATEGORIES = ['Famille', 'Nourriture', 'Transport Perso', 'Loyer Maison', 'Santé', 'Scolarité', 'Divertissement', 'Autre Perso'];

export default function Expenses() {
  const { wallets, expenses, addExpense, loading } = useApp();
  const t = useT();

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
      setMessage({ type: 'error', text: 'Veuillez remplir tous les champs obligatoires.' });
      return;
    }

    const payload = {
      wallet_id: finalWalletId,
      amount: parseFloat(amount),
      is_business: isBusiness,
      category,
      note: note || '',
    };

    const res = await addExpense(payload);
    if (res.success) {
      setMessage({ type: 'success', text: 'Dépense enregistrée et solde déduit !' });
      setAmount('');
      setNote('');
    } else {
      setMessage({ type: 'error', text: `Erreur : ${res.error}` });
    }
  };

  const getWalletName = (wId) => {
    return wallets.find(w => w.id === wId)?.name || 'Portefeuille inconnu';
  };

  const getWalletCurrency = (wId) => {
    return wallets.find(w => w.id === wId)?.currency || '';
  };

  const formatValue = (val, currency) => {
    return new Intl.NumberFormat('fr-FR').format(val) + ' ' + currency;
  };

  if (loading) {
    return <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '20px' }}>Chargement...</p>;
  }

  return (
    <div>
      <div className="screen-header">
        <h2 className="screen-title">{t('expenses.title')}</h2>
        <p className="screen-desc">{t('expenses.desc')}</p>
      </div>

      {message && (
        <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-info'}`}>
          {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* 1. Toggle Button Group */}
      <div className="toggle-group">
        <button
          type="button"
          className={`toggle-button ${isBusiness ? 'active business' : ''}`}
          onClick={() => {
            setIsBusiness(true);
            setCategory(BUSINESS_CATEGORIES[0]);
          }}
        >
          {t('expenses.pro')}
        </button>
        <button
          type="button"
          className={`toggle-button ${!isBusiness ? 'active personal' : ''}`}
          onClick={() => {
            setIsBusiness(false);
            setCategory(PERSONAL_CATEGORIES[0]);
          }}
        >
          {t('expenses.personal')}
        </button>
      </div>

      {/* 2. Expense Input Form */}
      {wallets.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '30px 20px' }}>
          <AlertCircle size={40} color="var(--color-orange)" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '8px' }}>{t('expenses.no_wallets')}</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.6' }}>
            Veuillez d'abord créer vos caisses (ex: Caisse USD, MTN UGX) dans le menu dédié « Portefeuilles » pour pouvoir enregistrer des dépenses.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="card">
          {/* Wallet debited */}
          <div className="form-group">
            <label className="form-label">{t('expenses.wallet_label')}</label>
            <select
              className="form-control"
              value={activeWalletId}
              onChange={(e) => setWalletId(e.target.value)}
            >
              {wallets.map(w => (
                <option key={w.id} value={w.id}>{w.name} ({w.currency})</option>
              ))}
            </select>
          </div>

          {/* Amount & Category */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('expenses.amount_label')}</label>
              <input
                type="number"
                step="any"
                className="form-control"
                placeholder="Ex: 5000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t('expenses.category_label')}</label>
              <select
                className="form-control"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {isBusiness 
                  ? BUSINESS_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)
                  : PERSONAL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)
                }
              </select>
            </div>
          </div>

          {/* Note */}
          <div className="form-group">
            <label className="form-label">{t('expenses.note_label')}</label>
            <input
              type="text"
              className="form-control"
              placeholder="Ex: Transport Kampala centre, Achat pain..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ backgroundColor: isBusiness ? 'var(--color-cyan)' : 'var(--color-orange)', color: '#090c10', boxShadow: isBusiness ? '0 4px 14px var(--color-cyan-glow)' : '0 4px 14px var(--color-orange-glow)' }}>
            <TrendingDown size={16} />
            <span>{t('expenses.save')}</span>
          </button>
        </form>
      )}

      {/* 3. Recent Expenses List */}
      <div className="screen-header" style={{ marginTop: '25px' }}>
        <h3 style={{ fontSize: '14px', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>Dépenses Récentes</h3>
      </div>

      <div className="ledger-list" style={{ marginBottom: '15px' }}>
        {expenses.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', padding: '15px' }}>
            {t('expenses.recent_none') }
          </p>
        ) : (
          expenses.slice(0, 5).map(e => {
            const dateStr = new Date(e.timestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' + new Date(e.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            return (
              <div key={e.id} className="ledger-item">
                <div className="ledger-left">
                  <div className={`ledger-icon-box ${e.is_business ? 'expense-bus' : 'expense-perso'}`}>
                    <TrendingDown size={18} />
                  </div>
                  <div className="ledger-details">
                    <span className="ledger-title">{e.category}</span>
                    <span className="ledger-subtitle">{getWalletName(e.wallet_id)} • {dateStr}</span>
                    {e.note && <span className="ledger-subtitle" style={{ color: 'var(--text-primary)', marginTop: '2px' }}>{e.note}</span>}
                  </div>
                </div>
                <div className="ledger-right">
                  <span className="ledger-value negative">
                    -{formatValue(e.amount, getWalletCurrency(e.wallet_id))}
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {e.is_business ? 'PRO' : 'PERSO'}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
