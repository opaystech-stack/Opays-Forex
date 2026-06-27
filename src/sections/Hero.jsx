import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import MeshGradient from '../components/MeshGradient';
import { useT } from '../i18n';

export default function Hero() {
  const t = useT();
  return (
    <section className="relative min-h-[100dvh] flex flex-col items-center justify-center overflow-hidden" style={{ background: '#080E1A' }}>
      <MeshGradient />

      <div className="relative z-10 max-w-[900px] mx-auto px-6 text-center pt-[72px]">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="inline-flex items-center px-4 py-1.5 rounded-full bg-[rgba(79, 70, 229,0.15)] border border-[#1A2642] text-[#3B82F6] text-[13px] font-medium mb-8"
        >
          {t('landing.hero.badge')}
        </motion.div>

        {/* Headline */}
        <div className="overflow-hidden">
          <motion.h1
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="font-display text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-[#F8FAFC] leading-[1.05]"
            style={{ textShadow: '0 2px 40px rgba(0,0,0,0.3)' }}
          >
            {t('landing.hero.title_1')}
          </motion.h1>
        </div>
        <div className="overflow-hidden mt-1">
          <motion.h1
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.62, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="font-display text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold leading-[1.05]"
            style={{
              background: 'linear-gradient(90deg, #60A5FA, #22D3EE)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              textShadow: 'none',
            }}
          >
            {t('landing.hero.title_2')}
          </motion.h1>
        </div>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.9 }}
          className="mt-6 text-base sm:text-lg text-[#94A3B8] max-w-[640px] mx-auto leading-relaxed"
        >
          {t('landing.hero.subtitle')}
        </motion.p>

        {/* CTA Row */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 1.1 }}
          className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <a
            href="/register"
            className="px-8 py-3.5 rounded-xl bg-[#4F46E5] text-white text-[15px] font-semibold hover:bg-[#4338CA] hover:scale-[1.03] transition-all duration-200 shadow-[0_4px_24px_rgba(79, 70, 229,0.3)]"
          >
            {t('landing.hero.cta_start')}
          </a>
          <button
            onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
            className="px-8 py-3.5 rounded-xl bg-transparent border border-[#1A2642] text-[#F8FAFC] text-[15px] font-semibold hover:border-[#4F46E5] hover:bg-[rgba(79, 70, 229,0.08)] transition-all duration-200"
          >
            {t('landing.hero.cta_pricing')}
          </button>
        </motion.div>

        {/* Dashboard Preview */}
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.3, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="mt-16 max-w-[960px] mx-auto"
        >
          <div className="rounded-2xl border border-[#1A2642] overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.4)]">
            <img
              src="/hero-dashboard.jpg"
              alt={t('landing.hero.dashboard_alt')}
              className="w-full h-auto"
            />
          </div>
        </motion.div>
      </div>

      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        transition={{ delay: 2, duration: 0.5 }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10"
      >
        <ChevronDown size={28} className="text-[#F8FAFC] animate-bounce-subtle" />
      </motion.div>
    </section>
  );
}
