import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Settings, Save, AlertTriangle, Key, RefreshCw, LogOut } from 'lucide-react';

export default function SettingsPage() {
  const { rates, updateRates, isUsingMock, resetMockData, user, logOut, wallets, adjustWalletBalance, language, setLanguage } = useApp();
  
  // Rates inputs
  const [ugxRate, setUgxRate] = useState('3750');
  const [kesRate, setKesRate] = useState('130');
  const [cdfRate, setCdfRate] = useState('2500');
  const [tzsRate, setTzsRate] = useState('2600');
  const [bifRate, setBifRate] = useState('2850');
  const [eurRate, setEurRate] = useState('0.92');
  const [fcfaRate, setFcfaRate] = useState('600');

  const [message, setMessage] = useState(null);

  // Sync inputs with rates context
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const ugx = rates.find(r => r.currency === 'UGX');
    const kes = rates.find(r => r.currency === 'KES');
    const cdf = rates.find(r => r.currency === 'CDF');
    const tzs = rates.find(r => r.currency === 'TZS');
    const bif = rates.find(r => r.currency === 'BIF');
    const eur = rates.find(r => r.currency === 'EUR');
    const fcfa = rates.find(r => r.currency === 'FCFA');

    if (ugx) setUgxRate(ugx.rate_to_usd.toString());
    if (kes) setKesRate(kes.rate_to_usd.toString());
    if (cdf) setCdfRate(cdf.rate_to_usd.toString());
    if (tzs) setTzsRate(tzs.rate_to_usd.toString());
    if (bif) setBifRate(bif.rate_to_usd.toString());
    if (eur) setEurRate(eur.rate_to_usd.toString());
    if (fcfa) setFcfaRate(fcfa.rate_to_usd.toString());
  }, [rates]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSaveRates = async (e) => {
    e.preventDefault();
    const payload = [
      { currency: 'UGX', rate_to_usd: parseFloat(ugxRate) },
      { currency: 'KES', rate_to_usd: parseFloat(kesRate) },
      { currency: 'CDF', rate_to_usd: parseFloat(cdfRate) },
      { currency: 'TZS', rate_to_usd: parseFloat(tzsRate) },
      { currency: 'BIF', rate_to_usd: parseFloat(bifRate) },
      { currency: 'EUR', rate_to_usd: parseFloat(eurRate) },
      { currency: 'FCFA', rate_to_usd: parseFloat(fcfaRate) }
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
            step="any"
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
              step="any"
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
              step="any"
              className="form-control"
              value={cdfRate}
              onChange={(e) => setCdfRate(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Shilling Tanzanien (TZS / 1 USD)</label>
            <input
              type="number"
              step="any"
              className="form-control"
              value={tzsRate}
              onChange={(e) => setTzsRate(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Franc Burundais (BIF / 1 USD)</label>
            <input
              type="number"
              step="any"
              className="form-control"
              value={bifRate}
              onChange={(e) => setBifRate(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Euro (EUR / 1 USD)</label>
            <input
              type="number"
              step="any"
              className="form-control"
              value={eurRate}
              onChange={(e) => setEurRate(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Franc CFA (FCFA / 1 USD)</label>
            <input
              type="number"
              step="any"
              className="form-control"
              value={fcfaRate}
              onChange={(e) => setFcfaRate(e.target.value)}
              required
            />
          </div>
        </div>

        <button type="submit" className="btn btn-primary" style={{ marginTop: '5px' }}>
          <Save size={16} />
          <span>Enregistrer les Taux</span>
        </button>
      </form>

      {/* 1.5 Admin Panel - Stock Adjustments */}
      <div className="card">
        <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Settings size={18} color="var(--color-orange)" />
          <span>Administration des Stocks & Caisses</span>
        </h3>
        <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
          Ajuster directement et manuellement le solde de vos portefeuilles (utilisé pour corriger une erreur de stock physique).
        </p>

        {wallets.length === 0 ? (
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '10px 0' }}>Aucune caisse à administrer.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {wallets.map(w => (
              <WalletStockAdjuster key={w.id} wallet={w} onAdjust={adjustWalletBalance} />
            ))}
          </div>
        )}
      </div>

      {/* 2. Language selector (global) */}
      <div className="card">
        <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Settings size={18} color="var(--primary-blue)" />
          <span>Préférences d'affichage</span>
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '700' }}>Langue de l'application</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className={`toggle-button ${language === 'fr' ? 'active' : ''}`} onClick={() => setLanguage('fr')} style={{ padding: '8px 10px' }}>FR</button>
            <button type="button" className={`toggle-button ${language === 'en' ? 'active' : ''}`} onClick={() => setLanguage('en')} style={{ padding: '8px 10px' }}>EN</button>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>La langue choisie sera appliquée à l'ensemble de l'application.</p>
        </div>
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

// Sub-component for wallet stock/balance adjustment form
function WalletStockAdjuster({ wallet, onAdjust }) {
  const [balance, setBalance] = useState(wallet.balance.toString());
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Sync state if wallet balance changes externally
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setBalance(wallet.balance.toString());
  }, [wallet.balance]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setSuccess(false);
    const res = await onAdjust(wallet.id, balance);
    setLoading(false);
    if (res.success) {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } else {
      alert("Erreur d'ajustement : " + res.error);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
      <div style={{ flex: 1 }}>
        <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--deep-navy)' }}>{wallet.name}</span>
        <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-secondary)' }}>Devise: {wallet.currency} • Type: {wallet.type === 'cash' ? 'Cash' : 'M-Money'}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input
          type="number"
          step="any"
          className="form-control"
          style={{ width: '100px', padding: '6px 10px', borderRadius: '8px', fontSize: '13px', margin: 0 }}
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          required
        />
        <button
          type="submit"
          className="btn btn-outline"
          style={{ width: 'auto', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', borderColor: success ? 'var(--color-green)' : 'var(--border-color)', color: success ? 'var(--color-green)' : 'var(--primary-blue)', margin: 0 }}
          disabled={loading}
        >
          {loading ? '...' : success ? 'Fait !' : 'Ajuster'}
        </button>
      </div>
    </form>
  );
}
