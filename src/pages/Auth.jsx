import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Mail, Lock, LogIn, UserPlus, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '../services/supabase';

export default function Auth() {
  const { signIn, signUp, signInWithGoogle, loginAsDemo } = useApp();

  const translations = {
    fr: {
      subtitle: 'Gestion Forex',
      title: 'OpaysFox',
      demoTitle: 'Mode Démo Actif',
      demoText: 'Supabase n\'est pas configuré. Vous pouvez tester l\'ensemble de l\'application en mode local sécurisé en cliquant sur le bouton ci-dessous.',
      demoButton: 'Accéder en mode Démo',
      connectTab: 'Se connecter',
      signupTab: 'Créer un compte',
      emailLabel: 'Adresse Email',
      passwordLabel: 'Mot de Passe',
      confirmLabel: 'Confirmer le Mot de Passe',
      submitLogin: 'Se connecter',
      submitSignup: 'Créer mon compte',
      googleButton: 'Continuer avec Google',
      demoLink: 'Continuer en mode démo local',
      loading: 'Chargement...'
    },
    en: {
      subtitle: 'Forex Management',
      title: 'OpaysFox',
      demoTitle: 'Demo Mode Active',
      demoText: 'Supabase is not configured. You can test the full application in secure local mode by clicking the button below.',
      demoButton: 'Access Demo Mode',
      connectTab: 'Sign in',
      signupTab: 'Create account',
      emailLabel: 'Email Address',
      passwordLabel: 'Password',
      confirmLabel: 'Confirm Password',
      submitLogin: 'Sign in',
      submitSignup: 'Create account',
      googleButton: 'Continue with Google',
      demoLink: 'Continue in local demo mode',
      loading: 'Loading...'
    }
  };

  const [language, setLanguage] = useState('fr');
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'success' | 'error', text: '' }

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setMessage(null);
    
    if (isSignUp && password !== confirmPassword) {
      setMessage({ type: 'error', text: 'Les mots de passe ne correspondent pas.' });
      return;
    }

    try {
      setLoading(true);
      let res;
      if (isSignUp) {
        res = await signUp(email, password);
        if (res.success) {
          setMessage({ 
            type: 'success', 
            text: 'Compte créé avec succès ! Vérifiez votre boîte mail pour confirmer votre inscription.' 
          });
          // Clear password fields
          setPassword('');
          setConfirmPassword('');
        } else {
          throw new Error(res.error);
        }
      } else {
        res = await signIn(email, password);
        if (!res.success) {
          throw new Error(res.error);
        }
      }
    } catch (error) {
      console.error("Auth Error:", error);
      setMessage({ type: 'error', text: error.message || 'Une erreur est survenue lors de la connexion.' });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setMessage(null);
    try {
      setLoading(true);
      const res = await signInWithGoogle();
      if (!res.success) {
        throw new Error(res.error);
      }
    } catch (error) {
      console.error("Google Auth Error:", error);
      setMessage({ type: 'error', text: error.message || 'Impossible de se connecter avec Google.' });
    } finally {
      setLoading(false);
    }
  };

  const isSupabaseConfigured = supabase !== null;
  const t = translations[language];

  return (
    <div className="auth-overlay">
      {/* 3D spheres background */}
      <div className="floating-spheres">
        <div className="sphere sphere-1"></div>
        <div className="sphere sphere-2"></div>
        <div className="sphere sphere-3"></div>
        <div className="sphere sphere-4"></div>
      </div>

      <div className="auth-card-container">
        <div className="auth-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <span className="auth-subtitle">{t.subtitle}</span>
            <div className="toggle-group" style={{ padding: '2px', borderRadius: '999px' }}>
              <button type="button" className={`toggle-button ${language === 'fr' ? 'active' : ''}`} onClick={() => setLanguage('fr')} style={{ padding: '6px 8px', fontSize: '11px' }}>FR</button>
              <button type="button" className={`toggle-button ${language === 'en' ? 'active' : ''}`} onClick={() => setLanguage('en')} style={{ padding: '6px 8px', fontSize: '11px' }}>EN</button>
            </div>
          </div>
          <h1 className="auth-title">{t.title}</h1>
        </div>

        <div className="card glass-card auth-card">
          {message && (
            <div className={`alert ${message.type === 'success' ? 'alert-success' : message.type === 'error' ? 'alert-danger' : 'alert-info'}`} style={{ marginBottom: '16px' }}>
              {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{message.text}</span>
            </div>
          )}

          {!isSupabaseConfigured ? (
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <Sparkles size={20} color="var(--primary-blue)" style={{ animation: 'pulse 1.5s infinite' }} />
                <span style={{ fontWeight: '600', color: 'var(--deep-navy)', fontSize: '15px' }}>{t.demoTitle}</span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: '1.6' }}>
                {t.demoText}
              </p>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={loginAsDemo}
              >
                <span>{t.demoButton}</span>
              </button>
            </div>
          ) : (
            <div>
              {/* Tabs for Inscription / Connexion */}
              <div className="auth-tabs" style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: '24px', position: 'relative' }}>
                <button 
                  type="button" 
                  className={`auth-tab ${!isSignUp ? 'active' : ''}`}
                  onClick={() => {
                    setIsSignUp(false);
                    setMessage(null);
                  }}
                  style={{ flex: 1, border: 'none', background: 'none', padding: '12px', fontWeight: '700', fontSize: '14px', cursor: 'pointer', color: !isSignUp ? 'var(--primary-blue)' : 'var(--text-secondary)', transition: 'all 0.2s' }}
                >
                  {t.connectTab}
                </button>
                <button 
                  type="button" 
                  className={`auth-tab ${isSignUp ? 'active' : ''}`}
                  onClick={() => {
                    setIsSignUp(true);
                    setMessage(null);
                  }}
                  style={{ flex: 1, border: 'none', background: 'none', padding: '12px', fontWeight: '700', fontSize: '14px', cursor: 'pointer', color: isSignUp ? 'var(--primary-blue)' : 'var(--text-secondary)', transition: 'all 0.2s' }}
                >
                  {t.signupTab}
                </button>
                <div 
                  className="auth-tab-bar" 
                  style={{ 
                    position: 'absolute', 
                    bottom: 0, 
                    left: isSignUp ? '50%' : '0', 
                    width: '50%', 
                    height: '3px', 
                    backgroundColor: 'var(--primary-blue)', 
                    transition: 'left 0.25s cubic-bezier(0.4, 0, 0.2, 1)' 
                  }}
                />
              </div>

              {/* Standard Email Auth Form */}
              <form onSubmit={handleEmailAuth}>
                <div className="form-group">
                  <label className="form-label">{t.emailLabel}</label>
                  <div className="input-icon-wrapper">
                    <Mail className="input-icon" size={16} />
                    <input 
                      type="email" 
                      className="form-control input-with-icon" 
                      placeholder="exemple@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required 
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">{t.passwordLabel}</label>
                  <div className="input-icon-wrapper">
                    <Lock className="input-icon" size={16} />
                    <input 
                      type="password" 
                      className="form-control input-with-icon" 
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={6}
                      required 
                    />
                  </div>
                </div>

                {isSignUp && (
                  <div className="form-group">
                    <label className="form-label">{t.confirmLabel}</label>
                    <div className="input-icon-wrapper">
                      <Lock className="input-icon" size={16} />
                      <input 
                        type="password" 
                        className="form-control input-with-icon" 
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        minLength={6}
                        required 
                      />
                    </div>
                  </div>
                )}

                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  style={{ marginTop: '8px', marginBottom: '20px' }}
                  disabled={loading}
                >
                  {isSignUp ? <UserPlus size={16} /> : <LogIn size={16} />}
                  <span>
                    {loading ? t.loading : isSignUp ? t.submitSignup : t.submitLogin}
                  </span>
                </button>
              </form>

              {/* OR divider */}
              <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', color: 'var(--text-secondary)', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px' }}>
                <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-color)' }} />
                <span style={{ padding: '0 10px' }}>Ou</span>
                <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-color)' }} />
              </div>

              {/* Google OAuth Login Button */}
              <button 
                type="button" 
                className="btn btn-outline" 
                onClick={handleGoogleAuth}
                disabled={loading}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
              >
                <svg width="18" height="18" viewBox="0 0 18 18">
                  <path fill="#4285F4" d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.47h4.84c-.21 1.12-.84 2.07-1.8 2.72v2.24h2.9c1.7-1.57 2.7-3.88 2.7-6.59z"/>
                  <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.2l-2.9-2.24c-.8.54-1.84.87-3.06.87-2.35 0-4.34-1.59-5.05-3.73H.89v2.32C2.37 15.96 5.43 18 9 18z"/>
                  <path fill="#FBBC05" d="M3.95 10.7a5.4 5.4 0 0 1 0-3.4V4.98H.89a9 9 0 0 0 0 8.04l3.06-2.32z"/>
                  <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35L15 2.02C13.46.59 11.43 0 9 0 5.43 0 2.37 2.04.89 5.02l3.06 2.32c.71-2.14 2.7-3.73 5.05-3.73z"/>
                </svg>
                <span>{t.googleButton}</span>
              </button>

              {/* Demo bypass button even if Supabase is connected (useful for quick testing) */}
              <div style={{ textAlign: 'center', marginTop: '24px' }}>
                <button 
                  type="button" 
                  onClick={loginAsDemo}
                  style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '600', textDecoration: 'underline', cursor: 'pointer' }}
                >
                  {t.demoLink}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
