import { useApp } from '../context/AppContext';

export default function AgencyAdmin() {
  const { user } = useApp();

  return (
    <div className="admin-page">
      <div className="card glass-card" style={{ maxWidth: '800px', margin: '40px auto' }}>
        <h1 style={{ fontSize: '24px', marginBottom: '16px', color: 'var(--deep-navy)' }}>Admin Agence</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
          Interface de gestion de l'agence. Utilisateur connecté :
        </p>
        <pre style={{ background: 'var(--bg-light)', padding: '16px', borderRadius: '12px', overflow: 'auto' }}>
          {JSON.stringify(user, null, 2)}
        </pre>
      </div>
    </div>
  );
}
