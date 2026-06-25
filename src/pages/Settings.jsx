import { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Save, AlertTriangle, RefreshCw, LogOut, Globe } from 'lucide-react';
import { useT } from '../i18n';

export default function SettingsPage() {
  const { rates, updateRates, isUsingMock, resetMockData, user, logOut, language, setLanguage } = useApp();
  const t = useT();
  const [message, setMessage] = useState(null);
  const [overrides, setOverrides] = useState({});

  const rateMap = useMemo(() => {
    const map = {};
    rates.forEach(r => { map[r.currency] = r.rate_to_usd; });
    return { UGX: 3750, KES: 130, CDF: 2500, TZS: 2600, BIF: 2850, RWF: 1380, EUR: 0.92, FCFA: 600, ...map };
  }, [rates]);

  const fields = [
    ['USD &rarr; UGX', 'UGX'],
    ['USD &rarr; KES', 'KES'],
    ['USD &rarr; CDF', 'CDF'],
    ['USD &rarr; TZS', 'TZS'],
    ['USD &rarr; BIF', 'BIF'],
    ['USD &rarr; RWF', 'RWF'],
    ['USD &rarr; EUR', 'EUR'],
    ['USD &rarr; FCFA', 'FCFA']
  ];

  const handleSaveRates = async (e) => {
    e.preventDefault();
    const payload = fields.map(([_, code]) => ({ currency: code, rate_to_usd: parseFloat(overrides[code] ?? rateMap[code]) }));
    const res = await updateRates(payload);
    if (res.success) setMessage({ type: 'success', text: t('settings.rates_update_success') });
    else setMessage({ type: 'error', text: t('settings.rates_update_error') + res.error });
  };

  return (
    <div className="ofx-scrollable-page">
      <div className="ofx-screen-header">
        <div className="ofx-screen-icon"><Globe size={28} /></div>
        <div>
          <h2 className="ofx-screen-title">{t('settings.title')}</h2>
          <p className="ofx-screen-desc">{t('settings.subtitle')}</p>
        </div>
      </div>

      {message && (
        <div className={`ofx-alert ${message.type === 'success' ? 'ofx-alert-success' : 'ofx-alert-error'}`}>
          {message.type === 'success' ? <Save size={16} /> : <AlertTriangle size={16} />}
          <span>{message.text}</span>
        </div>
      )}

      <form onSubmit={handleSaveRates} className="ofx-card">
        <h3 className="ofx-card-title">Taux de change</h3>
        <div className="ofx-form-grid">
          {fields.map(([label, code]) => (
            <div key={code} className="ofx-form-group">
              <label>{label}</label>
              <input
                type="number"
                step="any"
                className="ofx-input"
                value={overrides[code] ?? rateMap[code]}
                onChange={(e) => setOverrides({ ...overrides, [code]: e.target.value })}
                required
              />
            </div>
          ))}
        </div>
        <button type="submit" className="ofx-btn ofx-btn-primary"><Save size={16} /> {t('settings.save')}</button>
      </form>

      {isUsingMock && (
        <div className="ofx-card ofx-card-warn">
          <div className="ofx-card-title"><AlertTriangle size={16} /> Mode Demo actif</div>
          <p className="ofx-card-desc">Les donnees sont locales. Cliquez ci-dessous pour reinitialiser les donnees de demonstration.</p>
          <button className="ofx-btn ofx-btn-warn" onClick={() => { resetMockData(); setMessage({ type: 'success', text: 'Donnees reinitialisees' }); }}>
            <RefreshCw size={16} /> Reinitialiser demo
          </button>
        </div>
      )}

      <div className="ofx-card">
        <div className="ofx-card-title"><Globe size={16} /> Langue</div>
        <div className="ofx-toggle-group">
          <button className={`ofx-toggle ${language === 'fr' ? 'active' : ''}`} onClick={() => setLanguage('fr')}>Francais</button>
          <button className={`ofx-toggle ${language === 'en' ? 'active' : ''}`} onClick={() => setLanguage('en')}>English</button>
        </div>
      </div>

      <button className="ofx-btn ofx-btn-outline danger" onClick={logOut}><LogOut size={16} /> {t('auth.logout')}</button>

      <div className="ofx-card">
        <div className="ofx-card-title">Utilisateur connecte</div>
        <pre className="ofx-code">{JSON.stringify(user, null, 2)}</pre>
      </div>
    </div>
  );
}
