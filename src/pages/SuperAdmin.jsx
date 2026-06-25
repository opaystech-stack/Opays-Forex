import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Shield, Users, Building2, Activity, DollarSign } from 'lucide-react';
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
        const agenciesRes = await agencyApi.list();
        setAgencies(agenciesRes.data || []);
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
      <div className="page-card">
        <div className="page-header">
          <Shield className="page-icon" size={28} />
          <div>
            <h2 className="page-title">{t('superAdmin.title')}</h2>
            <p className="page-subtitle">{t('superAdmin.subtitle')}</p>
          </div>
        </div>
        <div className="alert alert-error">{t('superAdmin.accessDenied')}</div>
        <p className="empty-state">{t('superAdmin.accessDeniedDesc')}</p>
      </div>
    );
  }

  const totalWallets = wallets.length;
  const totalTransactions = transactions.length;
  const totalCustomers = customers.length;

  return (
    <div className="page-card">
      <div className="page-header">
        <Shield className="page-icon" size={28} />
        <div>
          <h2 className="page-title">{t('superAdmin.title')}</h2>
          <p className="page-subtitle">{t('superAdmin.subtitle')}</p>
        </div>
      </div>

      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="stat-card">
          <Building2 size={24} />
          <div className="stat-value">{agencies.length}</div>
          <div className="stat-label">{t('superAdmin.agencies')}</div>
        </div>
        <div className="stat-card">
          <DollarSign size={24} />
          <div className="stat-value">{totalWallets}</div>
          <div className="stat-label">{t('superAdmin.wallets')}</div>
        </div>
        <div className="stat-card">
          <Activity size={24} />
          <div className="stat-value">{totalTransactions}</div>
          <div className="stat-label">{t('superAdmin.transactions')}</div>
        </div>
        <div className="stat-card">
          <Users size={24} />
          <div className="stat-value">{totalCustomers}</div>
          <div className="stat-label">{t('superAdmin.customers')}</div>
        </div>
      </div>

      <h3 className="section-title">{t('superAdmin.agenciesList')}</h3>
      <div className="table-container">
        {agencies.length === 0 ? (
          <p className="empty-state">{t('superAdmin.noAgencies')}</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('superAdmin.name')}</th>
                <th>{t('superAdmin.slug')}</th>
                <th>{t('superAdmin.email')}</th>
                <th>{t('superAdmin.phone')}</th>
                <th>{t('superAdmin.status')}</th>
              </tr>
            </thead>
            <tbody>
              {agencies.map(a => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>{a.slug}</td>
                  <td>{a.email || '-'}</td>
                  <td>{a.phone || '-'}</td>
                  <td>
                    <span className={`status-badge ${a.isActive ? 'active' : 'inactive'}`}>
                      {a.isActive ? t('superAdmin.active') : t('superAdmin.inactive')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
