import { motion } from 'framer-motion';
import { Wallet, MessageCircle, Mic, BarChart3 } from 'lucide-react';
import { useT } from '../i18n';

const featureIcons = [Wallet, MessageCircle, Mic, BarChart3];

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.12,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  },
};

export default function Features() {
  const t = useT();
  const items = t('landing.features.items');
  const features = (Array.isArray(items) ? items : []).map((item, i) => ({
    ...item,
    icon: featureIcons[i],
  }));
  return (
    <section
      id="features"
      className="relative py-24 lg:py-32 scroll-mt-[72px]"
      style={{ background: '#080E1A' }}
    >
      {/* Subtle top gradient fade */}
      <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-[#080E1A]/0 to-transparent pointer-events-none" />

      <div className="max-w-[1200px] mx-auto px-6 lg:px-12">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6 }}
        >
          <span className="text-[13px] font-semibold tracking-[0.1em] text-[#4F46E5] uppercase">
            {t('landing.features.eyebrow')}
          </span>
          <h2 className="mt-3 font-display text-3xl sm:text-4xl lg:text-[44px] font-bold text-[#F8FAFC] leading-tight">
            {t('landing.features.title')}
          </h2>
          <p className="mt-4 text-base text-[#94A3B8] max-w-[540px] leading-relaxed">
            {t('landing.features.subtitle')}
          </p>
        </motion.div>

        {/* Feature Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.15 }}
          className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-6"
        >
          {features.map((feature) => (
            <motion.div
              key={feature.title}
              variants={cardVariants}
              whileHover={{
                y: -4,
                borderColor: 'rgba(79, 70, 229, 0.4)',
                boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
              }}
              className="p-9 rounded-2xl bg-[#0D1526] border border-[#1A2642] transition-colors duration-300"
            >
              <div className="w-14 h-14 rounded-full bg-[rgba(79, 70, 229,0.1)] border border-[rgba(79, 70, 229,0.2)] flex items-center justify-center">
                <feature.icon size={24} className="text-[#4F46E5]" />
              </div>
              <h3 className="mt-6 font-display text-xl font-semibold text-[#F8FAFC]">
                {feature.title}
              </h3>
              <p className="mt-3 text-[15px] text-[#94A3B8] leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
