import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Send, CheckCircle2, AlertCircle, Landmark, ArrowRight, Wallet } from 'lucide-react';
import { useT } from '../i18n';

export default function Transfers() {
  const { wallets, addTransaction } = useApp();
  const t = useT();
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  const fromWallet = wallets.find(w => w.id === fromId);
  const toWallet = wallets.find(w => w.id === toId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!fromId || !toId || !amount) {
      setMessage({ type: 'error', text: 'Veuillez remplir tous les champs.' });
      return;
    }
    setLoading(true);
    try {
      const res = await addTransaction({
        type: 'internal',
        sourceWalletId: fromId,
        destWalletId: toId,
        sourceAmount: parseFloat(amount),
        destAmount: parseFloat(amount),
        exchangeRate: 1,
        fee: 0,
        transactionId: `TRF-${Date.now().toString().slice(-6)}`,
        note: note || 'Transfert interne',
      });
      if (res.success) {
        setMessage({ type: 'success', text: t('transfers.success') });
        setAmount('');
        setNote('');
      } else {
        setMessage({ type: 'error', text: res.error || 'Erreur' });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ofx-scrollable-page">
      <div className="ofx-screen-header">
        <div className="ofx-screen-icon"><Send size={28} /></div>
        <div>
          <h2 className="ofx-screen-title">{t('transfers.title')}</h2>
          <p className="ofx-screen-desc">{t('transfers.desc')}</p>
        </div>
      </div>

      {message && (
        <div className={`ofx-alert ${message.type === 'success' ? 'ofx-alert-success' : 'ofx-alert-error'}`}>
          {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{message.text}</span>
        </div>
      )}

      {wallets.length < 2 ? (
        <div className="ofx-empty-card"><Landmark size={40} /><h3>{t('transfers.two_wallets_required')}</h3></div>
      ) : (
        <form onSubmit={handleSubmit} className="ofx-card">
          <div className="ofx-form-group">
            <label><Wallet size={14} /> {t('transfers.from')}</label>
            <select className="ofx-input" value={fromId} onChange={(e) => setFromId(e.target.value)} required>
              <option value="">— Selectionner —</option>
              {wallets.map(w => <option key={w.id} value={w.id}>{w.name} ({w.currency}: {w.balance})</option>)}
            </select>
          </div>
          <div className="ofx-arrow-center"><ArrowRight size={20} /></div>
          <div className="ofx-form-group">
            <label><Landmark size={14} /> {t('transfers.to')}</label>
            <select className="ofx-input" value={toId} onChange={(e) => setToId(e.target.value)} required>
              <option value="">— Selectionner —</option>
              {wallets.map(w => <option key={w.id} value={w.id}>{w.name} ({w.currency}: {w.balance})</option>)}
            </select>
          </div>
          <div className="ofx-form-group">
            <label>Montant</label>
            <input type="number" step="any" className="ofx-input" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div className="ofx-form-group">
            <label>Note</label>
            <input type="text" className="ofx-input" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {fromWallet && toWallet && (
            <div className="ofx-rate-bar">
              <div><span>De :</span> <strong>{fromWallet.name}</strong></div>
              <div><span>Vers :</span> <strong>{toWallet.name}</strong></div>
            </div>
          )}
          <button type="submit" className="ofx-btn ofx-btn-primary" disabled={loading}>
            <Send size={16} /> {loading ? 'Envoi...' : t('transfers.submit')}
          </button>
        </form>
      )}
    </div>
  );
}
