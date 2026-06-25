import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { CreditCard, CheckCircle2, AlertCircle, Calendar, Clock } from 'lucide-react';
import { useT } from '../i18n';

export default function Subscriptions() {
  const { subscription, createSubscription } = useApp();
  const t = useT();
  const [plan, setPlan] = useState('monthly');
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await createSubscription({ plan });
      if (res.success) setMessage({ type: 'success', text: t('subscriptions.success') });
      else setMessage({ type: 'error', text: res.error || t('common.error') });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const plans = [
    { id: 'monthly', name: t('subscriptions.monthly'), price: '29 USD/mois', desc: t('subscriptions.monthly_desc'), icon: Calendar },
    { id: 'yearly', name: t('subscriptions.yearly'), price: '290 USD/an', desc: t('subscriptions.yearly_desc'), icon: Clock },
  ];

  return (
    <div className="ofx-scrollable-page">
      <div className="ofx-screen-header">
        <div className="ofx-screen-icon"><CreditCard size={28} /></div>
        <div>
          <h2 className="ofx-screen-title">{t('subscriptions.title')}</h2>
          <p className="ofx-screen-desc">{t('subscriptions.subtitle')}</p>
        </div>
      </div>

      {subscription && (
        <div className="ofx-alert ofx-alert-success">
          <CheckCircle2 size={16} /> <span>Abonnement actif : {subscription.plan} &bull; expire le {new Date(subscription.expiresAt).toLocaleDateString('fr-FR')}</span>
        </div>
      )}

      {message && (
        <div className={`ofx-alert ${message.type === 'success' ? 'ofx-alert-success' : 'ofx-alert-error'}`}>
          {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{message.text}</span>
        </div>
      )}

      <div className="ofx-plan-list">
        {plans.map(p => (
          <div key={p.id} className={`ofx-plan-card ${plan === p.id ? 'active' : ''}`} onClick={() => setPlan(p.id)}>
            <div className="ofx-plan-icon">{plan === 'monthly' ? <Calendar size={24} /> : <Clock size={24} />}</div>
            <div className="ofx-plan-body">
              <div className="ofx-plan-name">{p.name}</div>
              <div className="ofx-plan-desc">{p.desc}</div>
            </div>
            <div className="ofx-plan-price">{p.price}</div>
          </div>
        ))}
      </div>

      <button className="ofx-btn ofx-btn-primary" onClick={handleSubscribe} disabled={loading || !!subscription}>
        <CreditCard size={16} /> {loading ? 'Traitement...' : (subscription ? 'Deja actif' : t('subscriptions.subscribe'))}
      </button>
    </div>
  );
}
