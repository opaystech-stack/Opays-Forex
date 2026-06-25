import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Shield, Users, Building2, Activity, DollarSign, CheckCircle2, AlertCircle } from 'lucide-react';
import { useT } from '../i18n';
import { agencyApi } from '../services/api';

export default function SuperAdmin() {
  const { user, wallets, transactions, customers } = useApp();
  const t = useT();
  const [agencies, setAgencies] = useState([]);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await agencyApi.list();
        setAgencies(res.data || []);
      } catch (err) {
        setMessage({ type: 'error', text: err.message || t('superAdmin.loadError') });
      }
    }
    if (user?.role === 'superadmin') {
      const id = setTimeout(() => load(), 0);
      return () => clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (user?.role !== 'superadmin') {
    return (
      <div className="ofx-scrollable-page">
        <div className="ofx-screen-header">
          <div className="ofx-screen-icon"><Shield size={28} /></div>
          <div>
            <h2 className="ofx-screen-title">{t('superAdmin.title')}</h2>
            <p className="ofx-screen-desc">{t('superAdmin.subtitle')}</p>
          </div>
        </div>
        <div className="ofx-alert ofx-alert-error"><AlertCircle size={16} /> <span>{t('superAdmin.accessDenied')}</span></div>
        <p className="ofx-empty">{t('superAdmin.accessDeniedDesc')}</p>
      </div>
    );
  }

  return (
    <div className="ofx-scrollable-page">
      <div className="ofx-screen-header">
        <div className="ofx-screen-icon"><Shield size={28} /></div>
        <div>
          <h2 className="ofx-screen-title">{t('superAdmin.title')}</h2>
          <p className="ofx-screen-desc">{t('superAdmin.subtitle')}</p>
        </div>
      </div>

      {message && (
        <div className={`ofx-alert ${message.type === 'success' ? 'ofx-alert-success' : 'ofx-alert-error'}`}>
          {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{message.text}</span>
        </div>
      )}

      <div className="ofx-stats-row">
        <div className="ofx-stat-card"><Building2 size={20} /><div className="ofx-stat-label">Agences</div><div className="ofx-stat-value">{agencies.length}</div></div>
        <div className="ofx-stat-card"><DollarSign size={20} /><div className="ofx-stat-label">Caisse</div><div className="ofx-stat-value">{wallets.length}</div></div>
        <div className="ofx-stat-card"><Activity size={20} /><div className="ofx-stat-label">Transactions</div><div className="ofx-stat-value">{transactions.length}</div></div>
        <div className="ofx-stat-card"><Users size={20} /><div className="ofx-stat-label">Clients</div><div className="ofx-stat-value">{customers.length}</div></div>
      </div>

      <div className="ofx-section">
        <div className="ofx-section-header"><Building2 size={16} /> Agences ({agencies.length})</div>
        <div className="ofx-list">
          {agencies.length === 0 ? <p className="ofx-empty">Aucune agence.</p> : agencies.map(a => (
            <div key={a.id} className="ofx-list-item">
              <div className="ofx-list-icon primary"><Building2 size={18} /></div>
              <div className="ofx-list-body">
                <div className="ofx-list-title">{a.name}</div>
                <div className="ofx-list-sub">{a.id} &bull; {a.createdAt ? new Date(a.createdAt).toLocaleDateString('fr-FR') : ''}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
