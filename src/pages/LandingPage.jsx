import { Link } from 'react-router-dom';
import { Sparkles, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../context/AppContext';

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { language, setLanguage } = useApp();

  const t = {
    fr: {
      navProduct: 'Produit',
      navPricing: 'Tarifs',
      navLogin: 'Se connecter',
      navSignup: 'Créer un compte',
      badge: 'Nouveau · Agent IA vocal',
      heroTitleBefore: 'Gérez votre trésorerie ',
      heroTitleHighlight: 'Forex',
      heroTitleAfter: ' sans effort.',
      subtitle: 'OpaysFox centralise vos opérations de change, transferts, abonnements et billets d\'avion. Piloté par IA vocale.',
      ctaPrimary: 'Démarrer gratuitement',
      ctaSecondary: 'Voir les offres',
      footer: 'Aperçu du tableau de bord OpaysFox',
    },
    en: {
      navProduct: 'Product',
      navPricing: 'Pricing',
      navLogin: 'Sign in',
      navSignup: 'Create account',
      badge: 'New · Voice AI Agent',
      heroTitleBefore: 'Manage your ',
      heroTitleHighlight: 'Forex',
      heroTitleAfter: ' treasury effortlessly.',
      subtitle: 'OpaysFox centralizes your exchange operations, transfers, subscriptions and flight tickets. Powered by voice AI.',
      ctaPrimary: 'Get started free',
      ctaSecondary: 'View pricing',
      footer: 'Preview of the OpaysFox dashboard',
    },
  }[language || 'fr'];

  return (
    <div className="landing-page">
      {/* Header / Nav */}
      <header className="landing-header">
        <Link to="/" className="landing-logo">
          <div className="landing-logo-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
              <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <span>OpaysFox</span>
        </Link>

        <nav className={`landing-nav ${mobileMenuOpen ? 'open' : ''}`}>
          <a href="#produit" onClick={() => setMobileMenuOpen(false)}>{t.navProduct}</a>
          <a href="#tarifs" onClick={() => setMobileMenuOpen(false)}>{t.navPricing}</a>
          <Link to="/login" onClick={() => setMobileMenuOpen(false)}>{t.navLogin}</Link>
          <Link to="/register" className="landing-nav-cta" onClick={() => setMobileMenuOpen(false)}>{t.navSignup}</Link>
          <div className="landing-lang-toggle">
            <button className={language === 'fr' ? 'active' : ''} onClick={() => setLanguage('fr')}>FR</button>
            <button className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>EN</button>
          </div>
        </nav>

        <button className="landing-menu-btn" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Menu">
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </header>

      {/* Hero Section */}
      <section className="landing-hero">
        <div className="landing-hero-content">
          <div className="landing-badge">
            <Sparkles size={14} />
            <span>{t.badge}</span>
          </div>

          <h1 className="landing-hero-title">
            {t.heroTitleBefore}
            <span className="highlight">{t.heroTitleHighlight}</span>
            {t.heroTitleAfter}
          </h1>

          <p className="landing-hero-subtitle">{t.subtitle}</p>

          <div className="landing-hero-actions">
            <Link to="/register" className="landing-btn landing-btn-primary">{t.ctaPrimary}</Link>
            <Link to="/login" className="landing-btn landing-btn-secondary">{t.ctaSecondary}</Link>
          </div>
        </div>

        {/* Decorative floating spheres / orbs */}
        <div className="landing-hero-orb orb-1" />
        <div className="landing-hero-orb orb-2" />
        <div className="landing-hero-orb orb-3" />
        <div className="landing-hero-orb orb-4" />
      </section>

      {/* Dashboard preview / footer section */}
      <section className="landing-preview">
        <div className="landing-preview-card">
          <p>{t.footer}</p>
        </div>
      </section>
    </div>
  );
}
