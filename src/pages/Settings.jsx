import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Settings, Save, AlertTriangle, Key, RefreshCw, LogOut } from 'lucide-react';

export default function SettingsPage() {
  const { rates, updateRates, isUsingMock, resetMockData, user, logOut } = useApp();
  
  // Rates inputs
  const [ugxRate, setUgxRate] = useState('3750');
  const [kesRate, setKesRate] = useState('130');
  const [cdfRate, setCdfRate] = useState('2500');

  const [message, setMessage] = useState(null);

  // Sync inputs with rates context
  useEffect(() => {
    const ugx = rates.find(r => r.currency === 'UGX');
    const kes = rates.find(r => r.currency === 'KES');
    const cdf = rates.find(r => r.currency === 'CDF');

    /* eslint-disable react-hooks/set-state-in-effect */
    if (ugx) setUgxRate(ugx.rate_to_usd.toString());
    if (kes) setKesRate(kes.rate_to_usd.toString());
    if (cdf) setCdfRate(cdf.rate_to_usd.toString());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [rates]);

  const handleSaveRates = async (e) => {
    e.preventDefault();
    const payload = [
      { currency: 'UGX', rate_to_usd: parseFloat(ugxRate) },
      { currency: 'KES', rate_to_usd: parseFloat(kesRate) },
      { currency: 'CDF', rate_to_usd: parseFloat(cdfRate) }
    ];

    const res = await updateRates(payload);
    if (res.success) {
      setMessage({ type: 'success', text: 'Taux de change mis à jour pour aujourd\'hui !' });
      setTimeout(() => setMessage(null), 3000);
    } else {
      setMessage({ type: 'error', text: `Erreur : ${res.error}` });
    }
  };

  const handleReset = () => {
    if (window.confirm('Voulez-vous réinitialiser toutes les données de test locales ?')) {
      resetMockData();
      setMessage({ type: 'success', text: 'Données de test locales réinitialisées !' });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  return (
    <div>
      <div className="screen-header">
        <h2 className="screen-title">Paramètres & Configuration</h2>
        <p className="screen-desc">Mettre à jour les taux de change et configurer la base de données.</p>
      </div>

      {message && (
        <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-info'}`}>
          <span>{message.text}</span>
        </div>
      )}

      {/* 1. Daily Exchange Rates Form */}
      <form onSubmit={handleSaveRates} className="card">
        <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Settings size={18} color="var(--color-primary)" />
          <span>Taux de change du jour (Base USD)</span>
        </h3>
        <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
          Combien d'unités de cette devise équivalent à **1 USD** ? Utilisé pour calculer le patrimoine global.
        </p>

        <div className="form-group">
          <label className="form-label">Shilling Ougandais (UGX / 1 USD)</label>
          <input
            type="number"
            className="form-control"
            value={ugxRate}
            onChange={(e) => setUgxRate(e.target.value)}
            required
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Shilling Kenyan (KES / 1 USD)</label>
            <input
              type="number"
              className="form-control"
              value={kesRate}
              onChange={(e) => setKesRate(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Franc Congolais (CDF / 1 USD)</label>
            <input
              type="number"
              className="form-control"
              value={cdfRate}
              onChange={(e) => setCdfRate(e.target.value)}
              required
            />
          </div>
        </div>

        <button type="submit" className="btn btn-primary" style={{ marginTop: '5px' }}>
          <Save size={16} />
          <span>Enregistrer les Taux</span>
        </button>
      </form>

      {/* 2. Supabase Connection details */}
      <div className="card">
        <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Key size={18} color="var(--color-cyan)" />
          <span>Connexion Supabase</span>
        </h3>
        
        {isUsingMock ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span className="mock-badge" style={{ alignSelf: 'flex-start' }}>Mode Démo Locale</span>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              L'application utilise actuellement des données fictives stockées dans votre navigateur. 
              Pour connecter votre base de données réelle Supabase :
            </p>
            <div style={{ backgroundColor: '#0c1017', padding: '10px', borderRadius: '8px', fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-secondary)', marginTop: '5px' }}>
              VITE_SUPABASE_URL=votre_url_supabase<br />
              VITE_SUPABASE_ANON_KEY=votre_cle_anonyme
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Configurez ces variables dans un fichier `.env` à la racine de votre projet puis rechargez la page.
            </p>
          </div>
        ) : (
          <div>
            <span className="mock-badge" style={{ backgroundColor: 'rgba(63, 185, 80, 0.1)', border: '1px solid rgba(63, 185, 80, 0.2)', color: 'var(--color-green)', alignSelf: 'flex-start' }}>Connecté à Supabase</span>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
              Vos transactions et soldes de caisses sont sauvegardés de manière sécurisée en temps réel dans votre base PostgreSQL Supabase.
            </p>
          </div>
        )}
      </div>

      {/* 3. Reset local mock database (only when running mock data) */}
      {isUsingMock && (
        <div className="card" style={{ border: '1px dashed var(--color-red)' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-red)' }}>
            <AlertTriangle size={18} />
            <span>Zone de Danger</span>
          </h3>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            Réinitialiser les données de test locales pour repartir d'un grand livre propre.
          </p>
          <button type="button" className="btn btn-outline" style={{ borderColor: 'var(--color-red)', color: 'var(--color-red)' }} onClick={handleReset}>
            <RefreshCw size={14} />
            <span>Réinitialiser les Données Démo</span>
          </button>
        </div>
      )}

      {/* 4. User Session & Logout */}
      <div className="card">
        <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <LogOut size={18} color="var(--color-red)" />
          <span>Session Utilisateur</span>
        </h3>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
          Connecté en tant que : <strong>{user?.email || 'Utilisateur démo'}</strong>
        </p>
        <button 
          type="button" 
          className="btn btn-outline" 
          style={{ borderColor: 'var(--color-red)', color: 'var(--color-red)' }}
          onClick={async () => {
            const res = await logOut();
            if (!res.success) {
              alert('Erreur lors de la déconnexion : ' + res.error);
            }
          }}
        >
          <LogOut size={14} />
          <span>Se Déconnecter</span>
        </button>
      </div>
    </div>
  );
}
