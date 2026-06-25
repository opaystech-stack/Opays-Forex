import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Mail, Lock, LogIn, UserPlus, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import { useT } from '../i18n';

export default function Auth() {
  const { signIn, signUp, loginAsDemo, language, setLanguage } = useApp();
  const t = useT();

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setMessage(null);
    if (isSignUp && password !== confirmPassword) {
      setMessage({ type: 'error', text: 'Les mots de passe ne correspondent pas.' });
      return;
    }
    setLoading(true);
    try {
      let res;
      if (isSignUp) res = await signUp(email, password);
      else res = await signIn(email, password);
      if (!res.success) setMessage({ type: 'error', text: res.error || 'Erreur' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Erreur' });
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = async () => {
    setLoading(true);
    try {
      const res = await loginAsDemo();
      if (!res.success) setMessage({ type: 'error', text: res.error || 'Erreur demo' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Erreur demo' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo"><Sparkles size={28} /></div>
        <h1 className="auth-title">OpaysFox</h1>
        <p className="auth-subtitle">{t('auth.subtitle') || 'Gestion Forex'}</p>

        {message && (
          <div className={`ofx-alert ${message.type === 'success' ? 'ofx-alert-success' : 'ofx-alert-error'}`}>
            {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{message.text}</span>
          </div>
        )}

        <div className="auth-tabs">
          <button className={!isSignUp ? 'active' : ''} onClick={() => setIsSignUp(false)}>{t('auth.connectTab')}</button>
          <button className={isSignUp ? 'active' : ''} onClick={() => setIsSignUp(true)}>{t('auth.signupTab')}</button>
        </div>

        <form onSubmit={handleEmailAuth} className="auth-form">
          <div className="ofx-form-group">
            <label><Mail size={14} /> {t('auth.emailLabel')}</label>
            <input type="email" className="ofx-input" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="ofx-form-group">
            <label><Lock size={14} /> {t('auth.passwordLabel')}</label>
            <input type="password" className="ofx-input" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {isSignUp && (
            <div className="ofx-form-group">
              <label><Lock size={14} /> {t('auth.confirmLabel')}</label>
              <input type="password" className="ofx-input" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            </div>
          )}
          <button type="submit" className="ofx-btn ofx-btn-primary" disabled={loading}>
            {isSignUp ? <UserPlus size={16} /> : <LogIn size={16} />}
            <span>{loading ? t('auth.loading') : (isSignUp ? t('auth.submitSignup') : t('auth.submitLogin'))}</span>
          </button>
        </form>

        <button className="ofx-btn ofx-btn-outline ofx-btn-block" onClick={handleDemo} disabled={loading}>
          <Sparkles size={16} /> {t('auth.demoButton')}
        </button>

        <div className="auth-lang">
          <button className={language === 'fr' ? 'active' : ''} onClick={() => setLanguage('fr')}>FR</button>
          <button className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>EN</button>
        </div>
      </div>
    </div>
  );
}
