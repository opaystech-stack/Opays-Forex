import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { CalendarCheck, Plus, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { useT } from '../i18n';
import { subscriptionApi } from '../services/api';

export default function Subscriptions() {
  const { customers, subscriptions, setSubscriptions, isUsingMock } = useApp();
  const t = useT();
  const [form, setForm] = useState({ customerId: '', serviceName: '', amount: '', frequency: 'monthly', nextDate: '' });
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      let sub;
      const payload = {
        customerId: form.customerId || null,
        planName: form.serviceName,
        amount: Number(form.amount),
        currencyCode: 'USD',
        frequency: form.frequency,
        nextBillingDate: form.nextDate
      };
      if (isUsingMock) {
        sub = {
          id: crypto.randomUUID(),
          customerId: form.customerId,
          serviceName: form.serviceName,
          amount: Number(form.amount),
          frequency: form.frequency,
          nextDate: form.nextDate,
          status: 'active',
          createdAt: new Date().toISOString()
        };
      } else {
        const res = await subscriptionApi.create(payload);
        sub = { ...res.data, serviceName: res.data.planName, nextDate: res.data.nextBillingDate };
      }
      setSubscriptions([sub, ...subscriptions]);
      setMessage({ type: 'success', text: t('subscriptions.created') });
      setForm({ customerId: '', serviceName: '', amount: '', frequency: 'monthly', nextDate: '' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || t('common.error') });
    } finally {
      setLoading(false);
    }
  };

  const renew = async (id) => {
    try {
      const next = new Date();
      next.setDate(next.getDate() + 30);
      const nextStr = next.toISOString().split('T')[0];
      if (!isUsingMock) {
        await subscriptionApi.update(id, { nextBillingDate: nextStr });
      }
      const updated = subscriptions.map(s => s.id === id ? { ...s, nextDate: nextStr, nextBillingDate: nextStr } : s);
      setSubscriptions(updated);
      setMessage({ type: 'success', text: t('subscriptions.renewed') });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || t('common.error') });
    }
  };

  return (
    <div className="page-card">
      <div className="page-header">
        <CalendarCheck className="page-icon" size={28} />
        <div>
          <h2 className="page-title">{t('subscriptions.title')}</h2>
          <p className="page-subtitle">{t('subscriptions.subtitle')}</p>
        </div>
      </div>

      {message && (
        <div className={`alert alert-${message.type}`}>
          {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{message.text}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="form-grid" style={{ marginBottom: '24px' }}>
        <select value={form.customerId} onChange={e => setForm({ ...form, customerId: e.target.value })} className="form-input">
          <option value="">{t('subscriptions.customer')}</option>
          {(customers || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input placeholder={t('subscriptions.serviceName')} value={form.serviceName} onChange={e => setForm({ ...form, serviceName: e.target.value })} required className="form-input" />
        <input type="number" min="0" step="0.01" placeholder={t('subscriptions.amount')} value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required className="form-input" />
        <select value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })} className="form-input">
          <option value="weekly">{t('subscriptions.weekly')}</option>
          <option value="monthly">{t('subscriptions.monthly')}</option>
          <option value="yearly">{t('subscriptions.yearly')}</option>
        </select>
        <input type="date" value={form.nextDate} onChange={e => setForm({ ...form, nextDate: e.target.value })} required className="form-input" />
        <button type="submit" disabled={loading} className="btn btn-primary">
          <Plus size={18} /> {loading ? t('common.saving') : t('subscriptions.add')}
        </button>
      </form>

      <div className="table-container">
        {subscriptions.length === 0 ? (
          <p className="empty-state">{t('subscriptions.empty')}</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>{t('subscriptions.service')}</th><th>{t('subscriptions.customer')}</th><th>{t('subscriptions.amount')}</th><th>{t('subscriptions.frequencyLabel')}</th><th>{t('subscriptions.nextDate')}</th><th></th></tr>
            </thead>
            <tbody>
              {subscriptions.map(s => {
                const customer = (customers || []).find(c => c.id === (s.customerId || s.customer_id));
                return (
                  <tr key={s.id}>
                    <td>{s.serviceName || s.plan_name}</td>
                    <td>{customer?.name || '-'}</td>
                    <td>{Number(s.amount).toLocaleString()} USD</td>
                    <td>{s.frequency}</td>
                    <td>{s.nextDate || s.next_billing_date}</td>
                    <td>
                      <button onClick={() => renew(s.id)} className="btn btn-icon btn-secondary"><RefreshCw size={16} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
