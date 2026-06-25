import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Smartphone, Plus, CheckCircle2, AlertCircle, MessageCircle } from 'lucide-react';
import { useT } from '../i18n';

export default function RemoteOrders() {
  const { wallets, setRemoteOrders, addTransaction } = useApp();
  const t = useT();
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ customerName: '', customerPhone: '', sourceCurrency: '', destCurrency: '', sourceAmount: '', destAmount: '', channel: 'whatsapp', note: '' });
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);


  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      const order = {
        id: crypto.randomUUID(),
        ...form,
        sourceAmount: Number(form.sourceAmount),
        destAmount: Number(form.destAmount),
        status: 'pending',
        createdAt: new Date().toISOString()
      };
      const updated = [order, ...list];
      setList(updated);
      if (setRemoteOrders) setRemoteOrders(updated);
      setMessage({ type: 'success', text: t('remoteOrders.created') });
      setForm({ customerName: '', customerPhone: '', sourceCurrency: '', destCurrency: '', sourceAmount: '', destAmount: '', channel: 'whatsapp', note: '' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || t('common.error') });
    } finally {
      setLoading(false);
    }
  };

  const execute = async (order) => {
    const source = wallets.find(w => w.currencyCode === order.sourceCurrency);
    const dest = wallets.find(w => w.currencyCode === order.destCurrency);
    if (!source || !dest) {
      setMessage({ type: 'error', text: t('remoteOrders.noWallet') });
      return;
    }
    const rate = order.destAmount / order.sourceAmount;
    const res = await addTransaction({
      sourceWalletId: source.id,
      destWalletId: dest.id,
      sourceAmount: order.sourceAmount,
      destAmount: order.destAmount,
      exchangeRate: rate,
      fee: 0,
      type: 'exchange',
      note: `${t('remoteOrders.from')} ${order.channel} — ${order.customerName} — ${order.note || ''}`
    });
    if (res.success) {
      const updated = list.map(o => o.id === order.id ? { ...o, status: 'executed' } : o);
      setList(updated);
      if (setRemoteOrders) setRemoteOrders(updated);
      setMessage({ type: 'success', text: t('remoteOrders.executed') });
    }
  };

  const currencies = [...new Set(wallets.map(w => w.currencyCode))];

  return (
    <div className="page-card">
      <div className="page-header">
        <Smartphone className="page-icon" size={28} />
        <div>
          <h2 className="page-title">{t('remoteOrders.title')}</h2>
          <p className="page-subtitle">{t('remoteOrders.subtitle')}</p>
        </div>
      </div>

      {message && (
        <div className={`alert alert-${message.type}`}>
          {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{message.text}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="form-grid" style={{ marginBottom: '24px' }}>
        <input placeholder={t('remoteOrders.customerName')} value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} required className="form-input" />
        <input placeholder={t('remoteOrders.customerPhone')} value={form.customerPhone} onChange={e => setForm({ ...form, customerPhone: e.target.value })} required className="form-input" />
        <select value={form.sourceCurrency} onChange={e => setForm({ ...form, sourceCurrency: e.target.value })} required className="form-input">
          <option value="">{t('remoteOrders.sourceCurrency')}</option>
          {currencies.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={form.destCurrency} onChange={e => setForm({ ...form, destCurrency: e.target.value })} required className="form-input">
          <option value="">{t('remoteOrders.destCurrency')}</option>
          {currencies.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="number" min="0" step="0.01" placeholder={t('remoteOrders.sourceAmount')} value={form.sourceAmount} onChange={e => setForm({ ...form, sourceAmount: e.target.value })} required className="form-input" />
        <input type="number" min="0" step="0.01" placeholder={t('remoteOrders.destAmount')} value={form.destAmount} onChange={e => setForm({ ...form, destAmount: e.target.value })} required className="form-input" />
        <select value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })} className="form-input">
          <option value="whatsapp">WhatsApp</option>
          <option value="telegram">Telegram</option>
          <option value="sms">SMS</option>
          <option value="app">App</option>
        </select>
        <input placeholder={t('remoteOrders.note')} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="form-input" />
        <button type="submit" disabled={loading} className="btn btn-primary">
          <Plus size={18} /> {loading ? t('common.saving') : t('remoteOrders.add')}
        </button>
      </form>

      <div className="list-container">
        {list.length === 0 ? (
          <p className="empty-state">{t('remoteOrders.empty')}</p>
        ) : (
          list.map(o => (
            <div key={o.id} className="order-card">
              <div className="order-header">
                <span><MessageCircle size={16} /> {o.channel}</span>
                <span className={`status-badge ${o.status}`}>{o.status}</span>
              </div>
              <p>{o.customerName} ({o.customerPhone})</p>
              <p>{o.sourceAmount} {o.sourceCurrency} → {o.destAmount} {o.destCurrency}</p>
              {o.status === 'pending' && (
                <button onClick={() => execute(o)} className="btn btn-primary btn-sm">{t('remoteOrders.execute')}</button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
