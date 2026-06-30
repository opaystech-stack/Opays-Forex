import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, User, Building2, Phone, AlertCircle, CheckCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useT } from '../i18n';
import LangToggle from '../components/LangToggle';

function AuthCircles() {
  return (
    <>
      <div
        className="absolute -top-20 -left-20 w-[360px] h-[360px] rounded-full pointer-events-none"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
      />
      <div
        className="absolute bottom-[10%] -right-[60px] w-[240px] h-[240px] rounded-full pointer-events-none"
        style={{ background: 'rgba(255,255,255,0.03)' }}
      />
      <div
        className="absolute top-[40%] right-[15%] w-[120px] h-[120px] rounded-full pointer-events-none"
        style={{ background: 'rgba(6, 182, 212, 0.1)' }}
      />
    </>
  );
}

export default function SignUp() {
  const navigate = useNavigate();
  const { signUp, signInWithGoogle, isApiBackend } = useApp();
  const t = useT();

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password !== confirmPassword) {
      setError(t('auth.signup.error_mismatch'));
      return;
    }
    if (password.length < 8) {
      setError(t('auth.signup.error_short'));
      return;
    }

    setLoading(true);
    const result = await signUp(email, password, {
      full_name: fullName,
      business_name: businessName,
      phone,
    });
    setLoading(false);

    if (result.success) {
      // Mode API Fastify : la session est portée par le cookie httpOnly posé
      // par `POST /api/auth/register`. On connecte directement le nouvel
      // inscrit et on redirige vers /app, même si la réponse n'échoie pas
      // d'objet `user` (la session est cookie-based). On NE montre PAS d'écran
      // de confirmation d'e-mail bloquant sur ce chemin.
      if (isApiBackend) {
        navigate('/app');
        return;
      }
      // Chemin Supabase uniquement : redirige si une session existe déjà,
      // sinon affiche l'écran de confirmation d'e-mail.
      if (result.data?.user?.confirmed_at || result.data?.session) {
        navigate('/app');
      } else {
        setSuccess(t('auth.signup.success'));
      }
    } else {
      setError(result.error || t('auth.signup.error_generic'));
    }
  };

  const handleGoogle = async () => {
    setError('');
    setGoogleLoading(true);
    const result = await signInWithGoogle();
    if (!result.success) {
      setGoogleLoading(false);
      setError(result.error || t('auth.signup.error_google'));
    }
  };

  return (
    <div className="landing-reset min-h-[100svh] flex">
      {/* Left Panel - Brand */}
      <motion.div
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="hidden lg:flex lg:w-1/2 relative flex-col items-center justify-center p-16 overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #0A1628 0%, #1E3A5F 40%, #4F46E5 100%)' }}
      >
        <AuthCircles />
        <div className="relative z-10 flex flex-col items-center text-center">
          <img
            src="/logo_fox-icone.png"
            alt={t('auth.logo_alt')}
            style={{ height: '96px', width: 'auto', display: 'block' }}
            onError={(e) => { e.currentTarget.src = '/logo-fox.png'; }}
          />
          <span className="mt-3 font-display text-2xl font-bold text-white">OpaysFox</span>
          <h2 className="mt-12 font-display text-4xl font-bold text-white">{t('auth.signup.brand_title')}</h2>
          <p className="mt-4 text-base text-[rgba(255,255,255,0.7)] max-w-[360px] leading-relaxed">
            {t('auth.signup.brand_subtitle')}
          </p>
          <div className="mt-10 flex flex-col gap-4 text-left">
            <span className="text-sm text-[rgba(255,255,255,0.8)] flex items-center gap-2">
              <span className="text-[#06B6D4]">✓</span> {t('auth.signup.perk_1')}
            </span>
            <span className="text-sm text-[rgba(255,255,255,0.8)] flex items-center gap-2">
              <span className="text-[#06B6D4]">✓</span> {t('auth.signup.perk_2')}
            </span>
            <span className="text-sm text-[rgba(255,255,255,0.8)] flex items-center gap-2">
              <span className="text-[#06B6D4]">✓</span> {t('auth.signup.perk_3')}
            </span>
          </div>
        </div>
      </motion.div>

      {/* Right Panel - Form */}
      <motion.div
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="flex-1 min-w-0 relative flex flex-col p-6 sm:p-10 lg:p-12 bg-white overflow-y-auto [padding-bottom:calc(1.5rem+env(safe-area-inset-bottom,0px))]"
      >
        {/* Sélecteur de langue */}
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-10">
          <LangToggle variant="light" />
        </div>

        <div className="w-full max-w-[420px] my-auto py-6">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-2 mb-6">
            <img
              src="/logo_fox-icone.png"
              alt={t('auth.logo_alt')}
              style={{ height: '40px', width: 'auto', display: 'block' }}
              onError={(e) => { e.currentTarget.src = '/logo-fox.png'; }}
            />
            <span className="font-display text-xl font-bold text-[#0F172A]">OpaysFox</span>
          </div>

          <h1 className="font-display text-2xl sm:text-[28px] font-bold text-[#0F172A]">
            {t('auth.signup.title')}
          </h1>
          <p className="mt-2 text-sm text-[#64748B]">
            {t('auth.signup.subtitle')}
          </p>

          {/* Error Message */}
          {error && (
            <div className="mt-4 flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="mt-4 flex items-start gap-2.5 p-3.5 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm">
              <CheckCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
            {/* Full Name */}
            <div>
              <label className="block text-[13px] font-medium text-slate-600 mb-2">{t('auth.signup.fullname_label')}</label>
              <div className="relative">
                <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t('auth.signup.fullname_placeholder')}
                  required
                  autoComplete="name"
                  className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-slate-50 border border-slate-200 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#4F46E5] focus:ring-[3px] focus:ring-[#4F46E5]/10 transition-all duration-200"
                />
              </div>
            </div>

            {/* Business Name */}
            <div>
              <label className="block text-[13px] font-medium text-slate-600 mb-2">
                {t('auth.signup.business_label')}
              </label>
              <div className="relative">
                <Building2 size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder={t('auth.signup.business_placeholder')}
                  required
                  className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-slate-50 border border-slate-200 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#4F46E5] focus:ring-[3px] focus:ring-[#4F46E5]/10 transition-all duration-200"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-[13px] font-medium text-slate-600 mb-2">{t('auth.signup.email_label')}</label>
              <div className="relative">
                <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('auth.signup.email_placeholder')}
                  required
                  autoComplete="email"
                  className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-slate-50 border border-slate-200 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#4F46E5] focus:ring-[3px] focus:ring-[#4F46E5]/10 transition-all duration-200"
                />
              </div>
            </div>

            {/* Phone */}
            <div>
              <label className="block text-[13px] font-medium text-slate-600 mb-2">
                {t('auth.signup.phone_label')}
              </label>
              <div className="relative">
                <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t('auth.signup.phone_placeholder')}
                  autoComplete="tel"
                  className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-slate-50 border border-slate-200 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#4F46E5] focus:ring-[3px] focus:ring-[#4F46E5]/10 transition-all duration-200"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-[13px] font-medium text-slate-600 mb-2">{t('auth.signup.password_label')}</label>
              <div className="relative">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('auth.signup.password_placeholder')}
                  required
                  minLength={8}
                  autoComplete="new-password"
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

            {/* Confirm Password */}
            <div>
              <label className="block text-[13px] font-medium text-slate-600 mb-2">
                {t('auth.signup.confirm_label')}
              </label>
              <div className="relative">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onFocus={(e) => {
                    const el = e.target;
                    setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250);
                  }}
                  placeholder={t('auth.signup.confirm_placeholder')}
                  required
                  autoComplete="new-password"
                  className="w-full pl-12 pr-20 py-3.5 rounded-xl bg-slate-50 border border-slate-200 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#4F46E5] focus:ring-[3px] focus:ring-[#4F46E5]/10 transition-all duration-200"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-slate-500 hover:text-[#4F46E5] transition-colors"
                >
                  {showConfirm ? t('auth.hide') : t('auth.show')}
                </button>
              </div>
            </div>

            {/* Terms */}
            <label className="flex items-start gap-2 cursor-pointer mt-1">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                required
                className="w-4 h-4 mt-0.5 rounded border-slate-300 text-[#4F46E5] focus:ring-[#4F46E5]"
              />
              <span className="text-[13px] text-slate-500 leading-relaxed font-medium">
                {t('auth.signup.terms_pre')}{' '}
                <span className="font-bold text-[#4F46E5] hover:underline cursor-pointer">{t('auth.signup.terms_terms')}</span>
                {t('auth.signup.terms_and')}{' '}
                <span className="font-bold text-[#4F46E5] hover:underline cursor-pointer">{t('auth.signup.terms_privacy')}</span>
              </span>
            </label>

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
                  {t('auth.signup.submitting')}
                </>
              ) : (
                t('auth.signup.submit')
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

          {/* Sign In Link */}
          <p className="mt-10 mb-6 text-center text-[14px] text-slate-500 font-medium">
            {t('auth.signup.have_account')}{' '}
            <a href="/login" className="font-bold text-[#4F46E5] hover:text-[#4338CA] hover:underline transition-colors">
              {t('auth.signup.signin_link')}
            </a>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
