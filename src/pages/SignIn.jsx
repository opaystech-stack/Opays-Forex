import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, AlertCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useT } from '../i18n';
import LangToggle from '../components/LangToggle';

function FloatingShapes() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute -top-24 -left-24 w-[400px] h-[400px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)' }} />
      <div className="absolute bottom-[8%] -right-16 w-[280px] h-[280px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)' }} />
      <div className="absolute top-[30%] right-[10%] w-[140px] h-[140px] rounded-[32px] rotate-12" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }} />
      <div className="absolute bottom-[30%] left-[12%] w-[100px] h-[100px] rounded-[24px] -rotate-6" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }} />
      <div className="absolute top-[60%] right-[30%] w-[60px] h-[60px] rounded-full" style={{ background: 'rgba(99,102,241,0.2)' }} />
    </div>
  );
}

export default function SignIn() {
  const navigate = useNavigate();
  const { signIn, signInWithGoogle, loginAsDemo } = useApp();
  const t = useT();

  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await signIn(email, password);
    setLoading(false);
    if (result.success) {
      navigate('/app');
    } else {
      setError(result.error || t('auth.signin.error_invalid'));
    }
  };

  const handleGoogle = async () => {
    setError('');
    setGoogleLoading(true);
    const result = await signInWithGoogle();
    if (!result.success) {
      setGoogleLoading(false);
      setError(result.error || t('auth.signin.error_google'));
    }
  };

  return (
    <div className="landing-reset min-h-[100dvh] flex overflow-x-hidden">
      {/* Left Panel - Brand */}
      <motion.div
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="hidden lg:flex lg:w-[48%] relative flex-col items-center justify-center p-16 overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #312E81 0%, #4F46E5 50%, #6366F1 100%)' }}
      >
        <FloatingShapes />
        <div className="relative z-10 flex flex-col items-center text-center">
          <img
            src="/logo_fox-icone.png"
            alt={t('auth.logo_alt')}
            style={{ height: '80px', width: 'auto', display: 'block' }}
            onError={(e) => { e.currentTarget.src = '/logo-fox.png'; }}
          />
          <span className="mt-3 font-display text-2xl font-bold text-white tracking-tight">OpaysFox</span>
          <h2 className="mt-10 font-display text-[2.5rem] font-bold text-white leading-tight">{t('auth.signin.brand_title')}</h2>
          <p className="mt-4 text-base text-indigo-100/70 max-w-[340px] leading-relaxed">
            {t('auth.signin.brand_subtitle')}
          </p>
          <div className="mt-10 flex flex-col gap-3.5 text-left">
            {[t('auth.signin.perk_1'), t('auth.signin.perk_2'), t('auth.signin.perk_3')].map((perk, i) => (
              <span key={i} className="text-sm text-indigo-100/80 flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-xs text-white">✓</span>
                {perk}
              </span>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Right Panel - Form */}
      <motion.div
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="flex-1 min-w-0 relative flex flex-col p-6 sm:p-12 lg:p-16 bg-white overflow-y-auto"
      >
        {/* LangToggle */}
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-10">
          <LangToggle variant="light" />
        </div>

        <div className="w-full max-w-[400px] my-auto py-6">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <img
              src="/logo_fox-icone.png"
              alt={t('auth.logo_alt')}
              style={{ height: '36px', width: 'auto', display: 'block' }}
              onError={(e) => { e.currentTarget.src = '/logo-fox.png'; }}
            />
            <span className="font-display text-lg font-bold text-[#0F172A]">OpaysFox</span>
          </div>

          <h1 className="font-display text-2xl sm:text-[26px] font-bold text-[#0F172A]">
            {t('auth.signin.title')}
          </h1>
          <p className="mt-1.5 text-sm text-[#64748B]">
            {t('auth.signin.subtitle')}
          </p>

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 flex items-start gap-2.5 p-3.5 rounded-xl border text-sm"
              style={{ background: '#FEF2F2', borderColor: '#FECACA', color: '#B91C1C' }}
            >
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0 text-red-500" />
              <span className="font-medium">{error}</span>
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
            {/* Email */}
            <div>
              <label className="block text-[13px] font-medium text-slate-600 mb-2">{t('auth.signin.email_label')}</label>
              <div className="relative">
                <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('auth.signin.email_placeholder')}
                  required
                  autoComplete="email"
                  className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-slate-50 border border-slate-200 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#4F46E5] focus:ring-[3px] focus:ring-[#4F46E5]/10 transition-all duration-200"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-[13px] font-medium text-slate-600 mb-2">{t('auth.signin.password_label')}</label>
              <div className="relative">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('auth.signin.password_placeholder')}
                  required
                  autoComplete="current-password"
                  className="w-full pl-12 pr-20 py-3.5 rounded-xl bg-slate-50 border border-slate-200 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#4F46E5] focus:ring-[3px] focus:ring-[#4F46E5]/10 transition-all duration-200"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-slate-500 hover:text-[#4F46E5] transition-colors"
                >
                  {showPassword ? t('auth.hide') : t('auth.show')}
                </button>
              </div>
            </div>

            {/* Remember + Forgot */}
            <div className="flex items-center justify-between mt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-[#4F46E5] focus:ring-[#4F46E5]"
                />
                <span className="text-[13px] text-slate-500 font-medium">{t('auth.signin.remember')}</span>
              </label>
              <button type="button" className="text-[13px] font-semibold text-[#4F46E5] hover:text-[#4338CA] transition-colors">
                {t('auth.signin.forgot')}
              </button>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 mt-4 rounded-xl text-[16px] font-bold text-white flex items-center justify-center gap-2 transition-all duration-150 hover:bg-[#4338CA] active:scale-[0.98] disabled:opacity-60 shadow-sm"
              style={{ background: '#4F46E5' }}
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {t('auth.signin.submitting')}
                </>
              ) : (
                t('auth.signin.submit')
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('auth.or')}</span>
            </div>
          </div>

          {/* Google Login */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading}
            className="w-full py-3.5 rounded-xl border border-slate-200 bg-white text-[15px] font-semibold text-slate-700 flex items-center justify-center gap-3 transition-all duration-200 hover:bg-slate-50 hover:border-slate-300 shadow-sm active:scale-[0.985]"
          >
            {googleLoading ? (
              <svg className="animate-spin h-5 w-5 text-slate-400" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
            )}
            <span>{t('auth.google')}</span>
          </button>

          {/* Demo mode */}
          <button
            type="button"
            onClick={() => { loginAsDemo(); navigate('/app'); }}
            className="w-full py-3.5 mt-4 rounded-xl border border-dashed border-slate-300 bg-transparent text-[15px] font-semibold text-slate-500 hover:border-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-all duration-200 active:scale-[0.985]"
          >
            {t('auth.signin.demo')}
          </button>

          {/* Sign Up Link */}
          <p className="mt-10 mb-6 text-center text-[14px] text-slate-500 font-medium">
            {t('auth.signin.no_account')}{' '}
            <a href="/register" className="font-bold text-[#4F46E5] hover:text-[#4338CA] hover:underline transition-colors">
              {t('auth.signin.create_account')}
            </a>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
