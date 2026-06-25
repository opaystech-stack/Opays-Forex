import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Shield, Users, Building2, Activity, DollarSign, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { useT } from '../i18n';

export default function SuperAdmin() {
  const { user, agencies } = useApp();
  const t = useT();
  const [agenciesList] = useState(agencies || []);

  if (user?.role !== 'superadmin') {
    return (
      <div className="page-card" style={{ textAlign: 'center', padding: '48px' }}>
        <Shield size={48} style={{ marginBottom: '16px', color: 'var(--error)' }} />
        <h2 className="page-title">{t('superAdmin.accessDenied')}</h2>
        <p className="page-subtitle">{t('superAdmin.accessDeniedDesc')}</p>
      </div>
    );
  }

  const stats = [
    { label: t('superAdmin.totalAgencies'), value: agenciesList.length, icon: Building2, trend: 'neutral' },
    { label: t('superAdmin.totalUsers'), value: agenciesList.reduce((a, b) => a + (b.userCount || 0), 0), icon: Users, trend: 'up' },
    { label: t('superAdmin.totalRevenue'), value: '$12,450', icon: DollarSign, trend: 'up' },
    { label: t('superAdmin.activeToday'), value: '89%', icon: Activity, trend: 'up' }
  ];

  return (
    <div className="page-card">
      <div className="page-header">
        <Shield className="page-icon" size={28} />
        <div>
          <h2 className="page-title">{t('superAdmin.title')}</h2>
          <p className="page-subtitle">{t('superAdmin.subtitle')}</p>
        </div>
      </div>

      <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="stat-card" style={{ padding: '16px', borderRadius: '12px', background: 'var(--surface)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{stat.label}</span>
                <Icon size={18} style={{ color: 'var(--primary-blue)' }} />
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>{stat.value}</div>
              {stat.trend === 'up' && <ArrowUpRight size={14} style={{ color: 'var(--success)' }} />}
              {stat.trend === 'down' && <ArrowDownRight size={14} style={{ color: 'var(--error)' }} />}
            </div>
          );
        })}
      </div>

      <div className="table-container">
        <h3 style={{ marginBottom: '12px' }}>{t('superAdmin.agencies')}</h3>
        {agenciesList.length === 0 ? (
          <p className="empty-state">{t('superAdmin.noAgencies')}</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('superAdmin.name')}</th>
                <th>{t('superAdmin.owner')}</th>
                <th>{t('superAdmin.status')}</th>
                <th>{t('superAdmin.created')}</th>
              </tr>
            </thead>
            <tbody>
              {agenciesList.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>{a.ownerEmail || '-'}</td>
                  <td><span className={`status-badge ${a.isActive ? 'active' : 'inactive'}`}>{a.isActive ? t('superAdmin.active') : t('superAdmin.inactive')}</span></td>
                  <td>{new Date(a.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
