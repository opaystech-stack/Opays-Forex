import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { CalendarCheck, Plus, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { useT } from '../i18n';

export default function Subscriptions() {
  const { customers, setSubscriptions } = useApp();
  const t = useT();
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ customerId: '', serviceName: '', amount: '', frequency: 'monthly', nextDate: '' });
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);


  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      const sub = {
        id: crypto.randomUUID(),
        customerId: form.customerId,
        serviceName: form.serviceName,
        amount: Number(form.amount),
        frequency: form.frequency,
        nextDate: form.nextDate,
        status: 'active',
        createdAt: new Date().toISOString()
      };
      const updated = [sub, ...list];
      setList(updated);
      if (setSubscriptions) setSubscriptions(updated);
      setMessage({ type: 'success', text: t('subscriptions.created') });
      setForm({ customerId: '', serviceName: '', amount: '', frequency: 'monthly', nextDate: '' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || t('common.error') });
    } finally {
      setLoading(false);
    }
  };

  const renew = (id) => {
    const updated = list.map(s => s.id === id ? { ...s, nextDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0] } : s);
    setList(updated);
    if (setSubscriptions) setSubscriptions(updated);
    setMessage({ type: 'success', text: t('subscriptions.renewed') });
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
        <select value={form.customerId} onChange={e => setForm({ ...form, customerId: e.target.value })} required className="form-input">
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
        {list.length === 0 ? (
          <p className="empty-state">{t('subscriptions.empty')}</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>{t('subscriptions.service')}</th><th>{t('subscriptions.customer')}</th><th>{t('subscriptions.amount')}</th><th>{t('subscriptions.frequencyLabel')}</th><th>{t('subscriptions.nextDate')}</th><th></th></tr>
            </thead>
            <tbody>
              {list.map(s => {
                const customer = (customers || []).find(c => c.id === s.customerId);
                return (
                  <tr key={s.id}>
                    <td>{s.serviceName}</td>
                    <td>{customer?.name || '-'}</td>
                    <td>{s.amount.toLocaleString()} USD</td>
                    <td>{s.frequency}</td>
                    <td>{s.nextDate}</td>
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
