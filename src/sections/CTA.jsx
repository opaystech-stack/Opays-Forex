import { motion } from 'framer-motion';
import { useT } from '../i18n';

export default function CTA() {
  const t = useT();
  return (
    <section
      id="cta"
      className="relative py-20 lg:py-24 scroll-mt-[72px]"
      style={{
        background: 'linear-gradient(135deg, #0F1D35 0%, #1A103C 50%, #0F1D35 100%)',
      }}
    >
      {/* Grain texture overlay */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="relative max-w-[800px] mx-auto px-6 lg:px-12 text-center">
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6 }}
          className="font-display text-3xl sm:text-4xl lg:text-[40px] font-bold text-[#F8FAFC] leading-tight"
        >
          {t('landing.cta.title')}
        </motion.h2>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mt-4 text-base sm:text-[17px] text-[#94A3B8] max-w-[560px] mx-auto leading-relaxed"
        >
          {t('landing.cta.subtitle')}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <a
            href="/register"
            className="px-9 py-4 rounded-xl bg-[#4F46E5] text-white text-base font-semibold hover:bg-[#4338CA] hover:scale-[1.02] transition-all duration-200 shadow-[0_8px_32px_rgba(79, 70, 229,0.35)]"
          >
            {t('landing.cta.create_account')}
          </a>
          <a
            href="mailto:support@opaysforex.com"
            className="px-9 py-4 rounded-xl bg-transparent border border-[#1A2642] text-[#F8FAFC] text-base font-semibold hover:border-[#4F46E5] hover:bg-[rgba(79, 70, 229,0.08)] transition-all duration-200"
          >
            {t('landing.cta.contact_us')}
          </a>
        </motion.div>
      </div>
    </section>
  );
}
