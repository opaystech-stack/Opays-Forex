import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Settings, Save, AlertTriangle, Key, RefreshCw, LogOut } from 'lucide-react';
import { useT } from '../i18n';

export default function SettingsPage() {
  const { rates, updateRates, isUsingMock, resetMockData, user, logOut, wallets, adjustWalletBalance, language, setLanguage } = useApp();
  const t = useT();
  
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
      setMessage({ type: 'success', text: t('settings.rates_update_success') });
      setTimeout(() => setMessage(null), 3000);
    } else {
      setMessage({ type: 'error', text: t('settings.rates_update_error') + res.error });
    }
  };

  const handleReset = () => {
    if (window.confirm(t('settings.reset_mock_confirm'))) {
      resetMockData();
      setMessage({ type: 'success', text: t('settings.mock_reset_success') });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  return (
    <div>
      <div className="screen-header">
        <h2 className="screen-title">{t('settings.preferences')}</h2>
        <p className="screen-desc">{t('settings.rates_desc')}</p>
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
          <span>{t('settings.rates_title')}</span>
        </h3>
        <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
          {t('settings.rates_desc')}
        </p>

        <div className="form-group">
          <label className="form-label">{t('currency.UGX')}</label>
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
            <label className="form-label">{t('currency.KES')}</label>
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
            <label className="form-label">{t('currency.CDF')}</label>
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
            <label className="form-label">{t('currency.TZS')}</label>
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
            <label className="form-label">{t('currency.BIF')}</label>
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
            <label className="form-label">{t('currency.EUR')}</label>
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
            <label className="form-label">{t('currency.FCFA')}</label>
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
          <span>{t('settings.save_rates')}</span>
        </button>
      </form>

      {/* 1.5 Admin Panel - Stock Adjustments */}
      <div className="card">
        <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Settings size={18} color="var(--color-orange)" />
          <span>{t('settings.admin_title')}</span>
        </h3>
        <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
          {t('settings.admin_desc')}
        </p>

        {wallets.length === 0 ? (
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '10px 0' }}>{t('settings.admin_none')}</p>
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
          <span>{t('settings.preferences')}</span>
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '700' }}>{t('settings.language_label')}</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className={`toggle-button ${language === 'fr' ? 'active' : ''}`} onClick={() => setLanguage('fr')} style={{ padding: '8px 10px' }}>FR</button>
            <button type="button" className={`toggle-button ${language === 'en' ? 'active' : ''}`} onClick={() => setLanguage('en')} style={{ padding: '8px 10px' }}>EN</button>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t('settings.lang_note')}</p>
        </div>
      </div>

      {/* 3. Reset local mock database (only when running mock data) */}
      {isUsingMock && (
        <div className="card" style={{ border: '1px dashed var(--color-red)' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-red)' }}>
            <AlertTriangle size={18} />
            <span>{t('settings.danger_title')}</span>
          </h3>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            {t('settings.danger_desc')}
          </p>
          <button type="button" className="btn btn-outline" style={{ borderColor: 'var(--color-red)', color: 'var(--color-red)' }} onClick={handleReset}>
            <RefreshCw size={14} />
            <span>{t('settings.reset_mock_button')}</span>
          </button>
        </div>
      )}

      {/* 4. User Session & Logout */}
      <div className="card">
        <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <LogOut size={18} color="var(--color-red)" />
          <span>{t('settings.user_session')}</span>
        </h3>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            {t('settings.connected_as')} <strong>{user?.email || t('app.demo')}</strong>
          </p>
        <button 
          type="button" 
          className="btn btn-outline" 
          style={{ borderColor: 'var(--color-red)', color: 'var(--color-red)' }}
          onClick={async () => {
            const res = await logOut();
            if (!res.success) {
              alert(t('settings.logout_error_prefix') + res.error);
            }
          }}
        >
          <LogOut size={14} />
          <span>{t('settings.logout_button')}</span>
        </button>
      </div>
    </div>
  );
}

// Sub-component for wallet stock/balance adjustment form
function WalletStockAdjuster({ wallet, onAdjust }) {
  const [balance, setBalance] = useState(wallet.balance.toString());
  const t = useT();
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
      alert(t('settings.adjust_error_prefix') + res.error);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
      <div style={{ flex: 1 }}>
        <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--deep-navy)' }}>{wallet.name}</span>
        <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-secondary)' }}>{t('settings.currency_label')}: {wallet.currency} • {t('settings.type_label')}: {t(`wallet.type.${wallet.type === 'cash' ? 'cash' : 'mmoney'}`)}</span>
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
          {loading ? '...' : success ? t('settings.adjust_done') : t('settings.adjust_button')}
        </button>
      </div>
    </form>
  );
}
