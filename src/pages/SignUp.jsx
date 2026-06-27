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
  const { signUp, signInWithGoogle } = useApp();
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
      // Supabase may require email confirmation — check if user is immediately logged in
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
    <div className="landing-reset min-h-[100dvh] flex">
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
        className="flex-1 min-w-0 relative flex items-center justify-center p-6 sm:p-10 lg:p-12 bg-white overflow-y-auto"
      >
        {/* Sélecteur de langue */}
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-10">
          <LangToggle variant="light" />
        </div>

        <div className="w-full max-w-[420px] py-4">
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

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            {/* Full Name */}
            <div>
              <label className="block text-sm font-medium text-[#334155] mb-1.5 auth-label">{t('auth.signup.fullname_label')}</label>
              <div className="relative">
                <User size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t('auth.signup.fullname_placeholder')}
                  required
                  autoComplete="name"
                  className="w-full pl-11 pr-4 py-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-[15px] text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#4F46E5] focus:ring-[3px] focus:ring-[rgba(79, 70, 229,0.1)] transition-all"
                />
              </div>
            </div>

            {/* Business Name */}
            <div>
              <label className="block text-sm font-medium text-[#334155] mb-1.5 auth-label">
                {t('auth.signup.business_label')}
              </label>
              <div className="relative">
                <Building2 size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder={t('auth.signup.business_placeholder')}
                  required
                  className="w-full pl-11 pr-4 py-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-[15px] text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#4F46E5] focus:ring-[3px] focus:ring-[rgba(79, 70, 229,0.1)] transition-all"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-[#334155] mb-1.5 auth-label">{t('auth.signup.email_label')}</label>
              <div className="relative">
                <Mail size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('auth.signup.email_placeholder')}
                  required
                  autoComplete="email"
                  className="w-full pl-11 pr-4 py-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-[15px] text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#4F46E5] focus:ring-[3px] focus:ring-[rgba(79, 70, 229,0.1)] transition-all"
                />
              </div>
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-[#334155] mb-1.5 auth-label">
                {t('auth.signup.phone_label')}
              </label>
              <div className="relative">
                <Phone size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t('auth.signup.phone_placeholder')}
                  autoComplete="tel"
                  className="w-full pl-11 pr-4 py-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-[15px] text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#4F46E5] focus:ring-[3px] focus:ring-[rgba(79, 70, 229,0.1)] transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-[#334155] mb-1.5 auth-label">{t('auth.signup.password_label')}</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('auth.signup.password_placeholder')}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="w-full pl-11 pr-20 py-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-[15px] text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#4F46E5] focus:ring-[3px] focus:ring-[rgba(79, 70, 229,0.1)] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] auth-link"
                >
                  {showPassword ? t('auth.hide') : t('auth.show')}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-[#334155] mb-1.5 auth-label">
                {t('auth.signup.confirm_label')}
              </label>
              <div className="relative">
                <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t('auth.signup.confirm_placeholder')}
                  required
                  autoComplete="new-password"
                  className="w-full pl-11 pr-20 py-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-[15px] text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#4F46E5] focus:ring-[3px] focus:ring-[rgba(79, 70, 229,0.1)] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] auth-link"
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
                className="w-4 h-4 mt-0.5 rounded border-slate-300 text-[var(--indigo-strong)] focus:ring-[var(--indigo-strong)]"
              />
              <span className="text-[13px] text-slate-500 leading-relaxed">
                {t('auth.signup.terms_pre')}
                <span className="font-medium text-[var(--indigo-strong)] hover:underline cursor-pointer">{t('auth.signup.terms_terms')}</span>
                {t('auth.signup.terms_and')}
                <span className="font-medium text-[var(--indigo-strong)] hover:underline cursor-pointer">{t('auth.signup.terms_privacy')}</span>
              </span>
            </label>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full py-3.5 text-[15px]"
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
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#E2E8F0]" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-3 text-xs text-[#94A3B8]">{t('auth.or')}</span>
            </div>
          </div>

          {/* Google Login */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading}
            className="btn btn-outline w-full py-3"
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
          <p className="mt-6 text-center text-sm text-slate-500">
            {t('auth.signup.have_account')}{' '}
            <a href="/login" className="font-medium text-[var(--indigo-strong)] hover:underline">
              {t('auth.signup.signin_link')}
            </a>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
