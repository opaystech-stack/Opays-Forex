import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Smartphone, Plus, CheckCircle2, AlertCircle, MessageCircle } from 'lucide-react';
import { useT } from '../i18n';
import { remoteOrderApi } from '../services/api';

export default function RemoteOrders() {
  const { wallets, remoteOrders, setRemoteOrders, addTransaction, isUsingMock } = useApp();
  const t = useT();
  const [form, setForm] = useState({ customerName: '', customerPhone: '', sourceCurrency: '', destCurrency: '', sourceAmount: '', destAmount: '', channel: 'whatsapp', note: '' });
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      let order;
      if (isUsingMock) {
        order = { id: crypto.randomUUID(), ...form, sourceAmount: Number(form.sourceAmount), destAmount: Number(form.destAmount), status: 'pending', createdAt: new Date().toISOString() };
      } else {
        const res = await remoteOrderApi.create({
          customerName: form.customerName,
          customerPhone: form.customerPhone,
          sourceCurrencyCode: form.sourceCurrency,
          destCurrencyCode: form.destCurrency,
          sourceAmount: Number(form.sourceAmount),
          destAmount: Number(form.destAmount),
          source: form.channel,
          note: form.note
        });
        order = { ...res.data, channel: res.data.source, status: res.data.status || 'pending' };
      }
      setRemoteOrders([order, ...remoteOrders]);
      setMessage({ type: 'success', text: t('remoteOrders.created') });
      setForm({ customerName: '', customerPhone: '', sourceCurrency: '', destCurrency: '', sourceAmount: '', destAmount: '', channel: 'whatsapp', note: '' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || t('common.error') });
    } finally {
      setLoading(false);
    }
  };

  const execute = async (order) => {
    const source = wallets.find(w => w.currencyCode === (order.sourceCurrency || order.source_currency_code));
    const dest = wallets.find(w => w.currencyCode === (order.destCurrency || order.dest_currency_code));
    if (!source || !dest) {
      setMessage({ type: 'error', text: t('remoteOrders.noWallet') });
      return;
    }
    const rate = (order.destAmount || order.dest_amount) / (order.sourceAmount || order.source_amount);
    const res = await addTransaction({
      sourceWalletId: source.id,
      destWalletId: dest.id,
      sourceAmount: order.sourceAmount || order.source_amount,
      destAmount: order.destAmount || order.dest_amount,
      exchangeRate: rate,
      fee: 0,
      type: 'exchange',
      note: `${t('remoteOrders.from')} ${order.channel || order.source} — ${order.customerName || order.customer_name} — ${order.note || ''}`
    });
    if (res.success) {
      try {
        if (!isUsingMock) await remoteOrderApi.update(order.id, { status: 'completed' });
        setRemoteOrders(remoteOrders.map(o => o.id === order.id ? { ...o, status: 'completed' } : o));
        setMessage({ type: 'success', text: t('remoteOrders.executed') });
      } catch (err) {
        setMessage({ type: 'error', text: err.message || t('common.error') });
      }
    }
  };

  const currencies = [...new Set(wallets.map(w => w.currencyCode).filter(Boolean))];

  return (
    <div className="ofx-scrollable-page">
      <div className="ofx-screen-header">
        <div className="ofx-screen-icon"><Smartphone size={28} /></div>
        <div>
          <h2 className="ofx-screen-title">{t('remoteOrders.title')}</h2>
          <p className="ofx-screen-desc">{t('remoteOrders.subtitle')}</p>
        </div>
      </div>

      {message && (
        <div className={`ofx-alert ${message.type === 'success' ? 'ofx-alert-success' : 'ofx-alert-error'}`}>
          {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{message.text}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="ofx-card">
        <div className="ofx-form-row">
          <div className="ofx-form-group">
            <input type="text" className="ofx-input" placeholder={t('remoteOrders.customerName')} value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} required />
          </div>
          <div className="ofx-form-group">
            <input type="tel" className="ofx-input" placeholder={t('remoteOrders.customerPhone')} value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} required />
          </div>
        </div>
        <div className="ofx-form-row">
          <div className="ofx-form-group">
            <select className="ofx-input" value={form.sourceCurrency} onChange={(e) => setForm({ ...form, sourceCurrency: e.target.value })} required>
              <option value="">{t('remoteOrders.sourceCurrency')}</option>
              {currencies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="ofx-form-group">
            <select className="ofx-input" value={form.destCurrency} onChange={(e) => setForm({ ...form, destCurrency: e.target.value })} required>
              <option value="">{t('remoteOrders.destCurrency')}</option>
              {currencies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="ofx-form-row">
          <div className="ofx-form-group">
            <input type="number" min="0" step="0.01" className="ofx-input" placeholder={t('remoteOrders.sourceAmount')} value={form.sourceAmount} onChange={(e) => setForm({ ...form, sourceAmount: e.target.value })} required />
          </div>
          <div className="ofx-form-group">
            <input type="number" min="0" step="0.01" className="ofx-input" placeholder={t('remoteOrders.destAmount')} value={form.destAmount} onChange={(e) => setForm({ ...form, destAmount: e.target.value })} required />
          </div>
        </div>
        <div className="ofx-form-row">
          <div className="ofx-form-group">
            <select className="ofx-input" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
              <option value="whatsapp">WhatsApp</option>
              <option value="telegram">Telegram</option>
              <option value="sms">SMS</option>
              <option value="app">App</option>
            </select>
          </div>
          <div className="ofx-form-group">
            <input type="text" className="ofx-input" placeholder={t('remoteOrders.note')} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
        </div>
        <button type="submit" className="ofx-btn ofx-btn-primary" disabled={loading}>
          <Plus size={16} /> {loading ? t('common.saving') : t('remoteOrders.add')}
        </button>
      </form>

      <div className="ofx-section">
        <div className="ofx-section-header">{t('remoteOrders.list')} ({remoteOrders.length})</div>
        <div className="ofx-list">
          {remoteOrders.length === 0 ? <p className="ofx-empty">{t('remoteOrders.empty')}</p> : remoteOrders.map(o => (
            <div key={o.id} className="ofx-list-item">
              <div className="ofx-list-icon primary"><MessageCircle size={18} /></div>
              <div className="ofx-list-body">
                <div className="ofx-list-title">{(o.customerName || o.customer_name)} ({o.customerPhone || o.customer_phone})</div>
                <div className="ofx-list-sub">{(o.sourceAmount || o.source_amount)} {(o.sourceCurrency || o.source_currency_code)} → {(o.destAmount || o.dest_amount)} {(o.destCurrency || o.dest_currency_code)} • {o.channel || o.source}</div>
              </div>
              <div className="ofx-list-actions">
                <span className={`ofx-status ${o.status}`}>{o.status}</span>
                {o.status === 'pending' && <button className="ofx-btn ofx-btn-sm ofx-btn-primary" onClick={() => execute(o)}>{t('remoteOrders.execute')}</button>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
