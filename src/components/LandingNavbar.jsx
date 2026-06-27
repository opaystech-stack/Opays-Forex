import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { useT } from '../i18n';
import LangToggle from './LangToggle';

export default function LandingNavbar() {
  const t = useT();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 100);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setMobileOpen(false);
  };

  return (
    <>
      <motion.nav
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className={`fixed top-0 left-0 right-0 z-50 h-[72px] flex items-center transition-all duration-300 ${
          scrolled
            ? 'backdrop-blur-2xl bg-[rgba(8,14,26,0.85)] border-b border-[#1A2642]'
            : 'bg-transparent'
        }`}
      >
        <div className="w-full max-w-[1200px] mx-auto px-6 lg:px-12 flex items-center justify-between">
          {/* Logo — taille forcée en inline (prime sur les couches CSS) */}
          <a href="/" className="flex items-center gap-2 flex-shrink-0">
            <img
              src="/logo_fox-icone.png"
              alt="Opays Forex"
              style={{ height: '36px', width: 'auto', display: 'block' }}
              onError={(e) => { e.currentTarget.src = '/logo-fox.png'; }}
            />
            <span className="font-display text-xl font-bold text-[#F8FAFC]">OpaysFox</span>
          </a>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            <button
              onClick={() => scrollToSection('features')}
              className="text-sm font-medium text-[#94A3B8] hover:text-[#F8FAFC] transition-colors"
            >
              {t('landing.nav.features')}
            </button>
            <button
              onClick={() => scrollToSection('pricing')}
              className="text-sm font-medium text-[#94A3B8] hover:text-[#F8FAFC] transition-colors"
            >
              {t('landing.nav.pricing')}
            </button>
            <button
              onClick={() => scrollToSection('cta')}
              className="text-sm font-medium text-[#94A3B8] hover:text-[#F8FAFC] transition-colors"
            >
              {t('landing.nav.contact')}
            </button>
          </div>

          {/* Lang + CTA + Hamburger */}
          <div className="flex items-center gap-4">
            <LangToggle variant="dark" className="hidden sm:inline-flex" />
            <a
              href="/login"
              className="hidden sm:inline-flex items-center px-4 py-2.5 rounded-xl text-[#F8FAFC] text-[15px] font-medium hover:text-white hover:bg-[rgba(255,255,255,0.06)] transition-all duration-200"
            >
              {t('landing.nav.signin')}
            </a>
            <a
              href="/register"
              className="hidden sm:inline-flex items-center px-5 py-2.5 rounded-xl bg-[#4F46E5] text-white text-[15px] font-semibold hover:bg-[#4338CA] hover:scale-[1.02] transition-all duration-200 shadow-[0_4px_24px_rgba(79, 70, 229,0.3)]"
            >
              {t('landing.nav.start')}
            </a>
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-2 text-[#F8FAFC]"
              aria-label={t('landing.nav.menu_aria')}
            >
              <Menu size={24} />
            </button>
          </div>
        </div>
      </motion.nav>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/50 z-50"
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="fixed top-0 right-0 bottom-0 w-[280px] bg-[#080E1A] border-l border-[#1A2642] z-50 p-6 flex flex-col"
            >
              <div className="flex items-center justify-between mb-8">
                <span className="font-display text-lg font-bold text-[#F8FAFC]">{t('landing.nav.menu')}</span>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="p-2 text-[#F8FAFC]"
                  aria-label={t('landing.nav.close_aria')}
                >
                  <X size={24} />
                </button>
              </div>

              <div className="flex flex-col gap-4">
                <button
                  onClick={() => scrollToSection('features')}
                  className="text-left text-base font-medium text-[#94A3B8] hover:text-[#F8FAFC] transition-colors py-2"
                >
                  {t('landing.nav.features')}
                </button>
                <button
                  onClick={() => scrollToSection('pricing')}
                  className="text-left text-base font-medium text-[#94A3B8] hover:text-[#F8FAFC] transition-colors py-2"
                >
                  {t('landing.nav.pricing')}
                </button>
                <button
                  onClick={() => scrollToSection('cta')}
                  className="text-left text-base font-medium text-[#94A3B8] hover:text-[#F8FAFC] transition-colors py-2"
                >
                  {t('landing.nav.contact')}
                </button>
              </div>

              <div className="mt-auto flex flex-col gap-3">
                <LangToggle variant="dark" className="self-start" />
                <a
                  href="/login"
                  className="w-full text-center py-3 rounded-xl border border-[#1A2642] text-[#F8FAFC] font-medium hover:border-[#4F46E5] transition-colors"
                >
                  {t('landing.nav.signin')}
                </a>
                <a
                  href="/register"
                  className="w-full text-center py-3 rounded-xl bg-[#4F46E5] text-white font-semibold hover:bg-[#4338CA] transition-colors"
                >
                  {t('landing.nav.create_account')}
                </a>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
