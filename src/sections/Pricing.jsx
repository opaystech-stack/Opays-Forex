import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useT } from '../i18n';

// Style/structure config par index (non traduisible)
const planStyles = [
  { highlighted: false, ctaStyle: 'outline' },
  { highlighted: true, ctaStyle: 'primary' },
  { highlighted: false, ctaStyle: 'gradient' },
];

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.15,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 50 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.7,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  },
};

export default function Pricing() {
  const t = useT();
  const rawPlans = t('landing.pricing.plans');
  const plans = (Array.isArray(rawPlans) ? rawPlans : []).map((plan, i) => ({
    ...plan,
    ...(planStyles[i] || { highlighted: false, ctaStyle: 'outline' }),
  }));
  return (
    <section
      id="pricing"
      className="relative py-24 lg:py-32 scroll-mt-[72px]"
      style={{
        background: 'linear-gradient(180deg, #080E1A 0%, #0A1222 100%)',
      }}
    >
      {/* Subtle radial gradient at top */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[400px] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 50% 0%, rgba(79, 70, 229, 0.08) 0%, transparent 60%)',
        }}
      />

      <div className="relative max-w-[1100px] mx-auto px-6 lg:px-12">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          <span className="text-[13px] font-semibold tracking-[0.1em] text-[#4F46E5] uppercase">
            {t('landing.pricing.eyebrow')}
          </span>
          <h2 className="mt-3 font-display text-3xl sm:text-4xl lg:text-[44px] font-bold text-[#F8FAFC] leading-tight">
            {t('landing.pricing.title')}
          </h2>
          <p className="mt-4 text-base text-[#94A3B8] max-w-[480px] mx-auto leading-relaxed">
            {t('landing.pricing.subtitle')}
          </p>
        </motion.div>

        {/* Pricing Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.1 }}
          className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch"
        >
          {plans.map((plan) => (
            <motion.div
              key={plan.name}
              variants={cardVariants}
              className={`relative flex flex-col rounded-2xl p-8 lg:p-10 border h-full ${
                plan.highlighted
                  ? 'bg-gradient-to-b from-[#0D1526] to-[#0F1D35] border-[#4F46E5] shadow-[0_0_40px_rgba(79, 70, 229,0.15)] md:scale-[1.03]'
                  : 'bg-[#0D1526] border-[#1A2642]'
              }`}
            >
              {/* Badge */}
              {plan.badge && (
                <span className="absolute -top-3 right-4 px-3 py-1 rounded-full bg-[#4F46E5] text-white text-[11px] font-semibold">
                  {plan.badge}
                </span>
              )}

              {/* Plan Name */}
              <h3 className="font-display text-lg font-semibold text-[#F8FAFC]">{plan.name}</h3>

              {/* Price */}
              <div className="mt-4 flex items-baseline gap-1">
                <span className="font-display text-5xl font-bold text-[#F8FAFC]">{plan.price}</span>
                {plan.period && (
                  <span className="text-base text-[#94A3B8]">{plan.period}</span>
                )}
              </div>
              {plan.periodNote && (
                <span className="text-sm font-medium text-[#06B6D4] italic mt-1">{plan.periodNote}</span>
              )}

              {/* Description */}
              <p className="mt-2 text-sm text-[#94A3B8]">{plan.description}</p>

              {/* Divider */}
              <div className="my-6 h-px bg-[#1A2642]" />

              {/* Features */}
              <ul className="flex flex-col gap-3 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check size={18} className="text-[#06B6D4] mt-0.5 flex-shrink-0" />
                    <span
                      className={`text-sm leading-relaxed ${
                        feature.includes('🤖') || feature.includes('📲')
                          ? 'text-[#F8FAFC] font-medium'
                          : 'text-[#94A3B8]'
                      }`}
                    >
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <a
                href="/register"
                className={`mt-8 block w-full text-center py-3 rounded-xl text-[15px] font-semibold transition-all duration-200 ${
                  plan.ctaStyle === 'primary'
                    ? 'bg-[#4F46E5] text-white hover:bg-[#4338CA] shadow-[0_4px_20px_rgba(79, 70, 229,0.3)]'
                    : plan.ctaStyle === 'gradient'
                    ? 'bg-gradient-to-r from-[#4F46E5] to-[#06B6D4] text-white hover:opacity-90'
                    : 'bg-transparent border border-[#1A2642] text-[#F8FAFC] hover:border-[#4F46E5]'
                }`}
              >
                {plan.cta}
              </a>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
