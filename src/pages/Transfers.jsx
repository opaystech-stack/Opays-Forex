import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { ArrowRightLeft, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import { useT } from '../i18n';
import { transferApi } from '../services/api';

export default function Transfers() {
  const { user, wallets, transfers, setTransfers, addTransaction, isUsingMock } = useApp();
  const t = useT();
  const [form, setForm] = useState({ sourceWalletId: '', destWalletId: '', amount: '', note: '' });
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      const source = wallets.find(w => w.id === form.sourceWalletId);
      const dest = wallets.find(w => w.id === form.destWalletId);
      if (!source || !dest) throw new Error(t('transfers.walletsRequired'));
      if (Number(form.amount) <= 0) throw new Error(t('transfers.amountRequired'));
      if (source.id === dest.id) throw new Error(t('transfers.sameWallet'));

      let transfer;
      if (isUsingMock) {
        transfer = {
          id: crypto.randomUUID(),
          sourceWalletId: source.id,
          destWalletId: dest.id,
          sourceCurrency: source.currencyCode,
          destCurrency: dest.currencyCode,
          amount: Number(form.amount),
          note: form.note,
          status: 'completed',
          createdAt: new Date().toISOString()
        };
      } else {
        const res = await transferApi.create({
          sourceWalletId: source.id,
          destAgencyId: user?.agencyId,
          destWalletId: dest.id,
          amount: Number(form.amount),
          currencyCode: source.currencyCode,
          note: form.note
        });
        const completed = await transferApi.complete(res.data.id);
        transfer = completed.data;
      }

      setTransfers([transfer, ...transfers]);
      await addTransaction({
        sourceWalletId: source.id,
        destWalletId: dest.id,
        sourceAmount: Number(form.amount),
        destAmount: Number(form.amount),
        exchangeRate: 1,
        fee: 0,
        type: 'transfer',
        note: form.note || t('transfers.internalTransfer')
      });

      setMessage({ type: 'success', text: t('transfers.created') });
      setForm({ sourceWalletId: '', destWalletId: '', amount: '', note: '' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || t('common.error') });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-card">
      <div className="page-header">
        <ArrowRightLeft className="page-icon" size={28} />
        <div>
          <h2 className="page-title">{t('transfers.title')}</h2>
          <p className="page-subtitle">{t('transfers.subtitle')}</p>
        </div>
      </div>

      {message && (
        <div className={`alert alert-${message.type}`}>
          {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{message.text}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="form-grid" style={{ marginBottom: '24px' }}>
        <select value={form.sourceWalletId} onChange={e => setForm({ ...form, sourceWalletId: e.target.value })} required className="form-input">
          <option value="">{t('transfers.sourceWallet')}</option>
          {wallets.map(w => <option key={w.id} value={w.id}>{w.name} ({w.currencyCode})</option>)}
        </select>
        <select value={form.destWalletId} onChange={e => setForm({ ...form, destWalletId: e.target.value })} required className="form-input">
          <option value="">{t('transfers.destWallet')}</option>
          {wallets.map(w => <option key={w.id} value={w.id}>{w.name} ({w.currencyCode})</option>)}
        </select>
        <input type="number" min="0" step="0.01" placeholder={t('transfers.amount')} value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required className="form-input" />
        <input placeholder={t('transfers.note')} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="form-input" />
        <button type="submit" disabled={loading} className="btn btn-primary">
          <Send size={18} /> {loading ? t('common.sending') : t('transfers.send')}
        </button>
      </form>

      <div className="table-container">
        {transfers.length === 0 ? (
          <p className="empty-state">{t('transfers.empty')}</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>{t('transfers.date')}</th><th>{t('transfers.from')}</th><th>{t('transfers.to')}</th><th>{t('transfers.amount')}</th><th>{t('transfers.status')}</th></tr>
            </thead>
            <tbody>
              {transfers.map(tx => (
                <tr key={tx.id}>
                  <td>{new Date(tx.createdAt || tx.created_at).toLocaleDateString()}</td>
                  <td>{tx.sourceCurrency || tx.source_currency_code || tx.sourceWalletId}</td>
                  <td>{tx.destCurrency || tx.dest_currency_code || tx.destWalletId}</td>
                  <td>{Number(tx.amount).toLocaleString()}</td>
                  <td><span className={`status-badge ${tx.status}`}>{tx.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
