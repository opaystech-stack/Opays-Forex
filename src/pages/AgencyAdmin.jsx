import { useApp } from '../context/AppContext';
import { Building2, Mail, Shield, Calendar } from 'lucide-react';

export default function AgencyAdmin() {
  const { user } = useApp();

  return (
    <div className="ofx-scrollable-page">
      <div className="ofx-screen-header">
        <div className="ofx-screen-icon"><Building2 size={28} /></div>
        <div>
          <h2 className="ofx-screen-title">Admin Agence</h2>
          <p className="ofx-screen-desc">Informations et statut de votre agence.</p>
        </div>
      </div>

      <div className="ofx-card">
        <div className="ofx-admin-row"><Mail size={18} /> <span>{user?.email}</span></div>
        <div className="ofx-admin-row"><Shield size={18} /> <span>Role : <strong>{user?.role || 'user'}</strong></span></div>
        <div className="ofx-admin-row"><Calendar size={18} /> <span>Agence : <strong>{user?.agencyId}</strong></span></div>
        <pre className="ofx-code">{JSON.stringify(user, null, 2)}</pre>
      </div>
    </div>
  );
}
