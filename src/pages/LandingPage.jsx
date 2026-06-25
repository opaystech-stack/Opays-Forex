import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Globe, MessageCircle, Mic, BarChart3, Check, Rocket, Menu, X } from 'lucide-react';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } }
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } }
};

const features = [
  {
    icon: Globe,
    title: 'Multi-Devises en Temps Reel',
    text: 'Gerez USD, UGX, EUR et toutes les devises africaines avec des taux de change mis a jour en temps reel. Conversion instantanee et suivi de tresorerie precis.'
  },
  {
    icon: MessageCircle,
    title: 'Integration WhatsApp',
    text: 'Capturez automatiquement les transactions via WhatsApp. OCR intelligent par IA lit les recus et messages vocaux pour alimenter votre comptabilite sans saisie manuelle.'
  },
  {
    icon: Mic,
    title: 'Notes Vocales Intelligentes',
    text: 'Dictez vos transactions en francais ou en anglais. Notre IA Gemini transcrit, categorise et enregistre automatiquement chaque operation dans votre livre de comptes.'
  },
  {
    icon: BarChart3,
    title: 'Rapports \u0026 Analytiques',
    text: 'Tableaux de bord visuels avec graphiques de tresorerie, rapports de performance journaliers, et export PDF pour votre comptable. Toute votre activite en un coup d\u0153il.'
  }
];

const plans = [
  {
    name: 'Starter',
    price: '$5',
    period: '/mois',
    description: 'Parfait pour demarrer avec une seule agence.',
    features: [
      '1 agence / utilisateur',
      'Jusqu\u0027a 500 transactions/mois',
      'Devises de base (USD, UGX, EUR)',
      'Rapports journaliers PDF',
      'Support par email'
    ],
    recommended: false
  },
  {
    name: 'Pro',
    price: '$10',
    period: '/mois',
    description: 'Pour les agences actives qui veulent automatiser.',
    features: [
      'Tout du plan Starter',
      'Agences illimitees',
      'Transactions illimitees',
      'Agents IA Vocaux 🤖',
      'Relances WhatsApp automatiques 📲',
      'Rapports avances \u0026 analytiques',
      'Support prioritaire 24/7'
    ],
    recommended: true
  },
  {
    name: 'Lifetime',
    price: '$50',
    period: ' - Paiement Unique',
    description: 'Acces a vie, aucun frais recurrent.',
    features: [
      'Tout du plan Pro'
    ],
    recommended: false
  }
];

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="landing-root">
      <div className="landing-mesh" />

      <nav className="landing-nav">
        <Link to="/" className="landing-logo">
          <div className="landing-logo-icon"><img src="/favicon.svg" alt="" style={{ width: '22px', height: '22px' }} /></div>
          OpaysFox
        </Link>

        <div className="landing-nav-links">
          <a href="#features">Fonctionnalites</a>
          <a href="#pricing">Tarifs</a>
          <a href="#contact">Contact</a>
        </div>

        <div className="landing-nav-actions">
          <Link to="/login" className="landing-btn landing-btn-ghost">Se Connecter</Link>
          <Link to="/app" className="landing-btn landing-btn-primary">Acceder a l\u0027app</Link>

          <button
            className="landing-btn landing-btn-ghost mobile-menu-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </nav>

      {mobileMenuOpen && (
        <div className="landing-mobile-menu">
          <a href="#features" onClick={() => setMobileMenuOpen(false)}>Fonctionnalites</a>
          <a href="#pricing" onClick={() => setMobileMenuOpen(false)}>Tarifs</a>
          <a href="#contact" onClick={() => setMobileMenuOpen(false)}>Contact</a>
          <Link to="/login" onClick={() => setMobileMenuOpen(false)}>Se Connecter</Link>
          <Link to="/app" onClick={() => setMobileMenuOpen(false)} className="landing-btn landing-btn-primary">Acceder a l\u0027app</Link>
        </div>
      )}

      <section className="landing-hero">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={stagger}
        >
          <motion.div variants={fadeUp} className="landing-badge">
            <Rocket size={14} />
            Lancement Officiel 🚀
          </motion.div>

          <motion.h1 variants={fadeUp}>
            Gerez Votre Forex et Mobile Money
          </motion.h1>

          <motion.p variants={fadeUp}>
            La plateforme tout-en-un pour les agences multi-devises. Suivi de tresorerie, comptabilite automatisee, IA vocale et relances WhatsApp — le tout dans une application web et mobile.
          </motion.p>

          <motion.div variants={fadeUp} className="landing-hero-actions">
            <Link to="/app" className="landing-btn landing-btn-primary">Demarrer Gratuitement</Link>
            <a href="#pricing" className="landing-btn landing-btn-outline">Voir les Tarifs</a>
          </motion.div>
        </motion.div>
      </section>

      <div className="landing-mockup">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.7 }}
          className="landing-mockup-frame"
        >
          <div className="landing-mockup-screen">
            <img
              src="/mockup-dashboard.svg"
              alt="Dashboard OpaysFox"
              style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: 0.9 }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <div style={{ position: 'absolute', color: 'var(--text-muted)', fontSize: '14px' }}>
              Application OpaysFox
            </div>
          </div>
        </motion.div>
      </div>

      <section id="features" className="landing-section">
        <div className="landing-section-title">
          <h2>Tout ce qu\u0027il faut pour gerer votre tresorerie</h2>
          <p>Des outils concus pour les agents Mobile Money et les bureaux de change africains.</p>
        </div>

        <motion.div
          className="landing-features-grid"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          variants={stagger}
        >
          {features.map((f) => (
            <motion.div key={f.title} variants={fadeUp} className="landing-feature-card">
              <div className="landing-feature-icon">
                <f.icon size={24} />
              </div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      <section id="pricing" className="landing-section">
        <div className="landing-section-title">
          <h2>Des Prix Simples, Pas de Surprises</h2>
          <p>Choisissez le plan qui correspond a vos besoins. Changez ou annulez a tout moment.</p>
        </div>

        <motion.div
          className="landing-pricing-grid"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          variants={stagger}
        >
          {plans.map((plan) => (
            <motion.div
              key={plan.name}
              variants={fadeUp}
              className={`landing-pricing-card ${plan.recommended ? 'recommended' : ''}`}
            >
              {plan.recommended && <div className="landing-pricing-badge">RECOMMANDE</div>}
              <h3>{plan.name}</h3>
              <div className="price">
                {plan.price}<span>{plan.period}</span>
              </div>
              <p className="description">{plan.description}</p>

              <ul>
                {plan.features.map((feat) => (
                  <li key={feat}>
                    <Check size={16} />
                    {feat}
                  </li>
                ))}
              </ul>

              <Link to="/app" className="landing-btn landing-btn-primary">
                {plan.name === 'Lifetime' ? 'Acheter a Vie' : 'Commencer'}
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </section>

      <section id="contact" className="landing-cta">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2>Pret a automatiser votre tresorerie ?</h2>
          <p>Rejoignez les agences qui gerent leur Mobile Money et Forex avec OpaysFox.</p>
          <Link to="/app" className="landing-btn landing-btn-primary" style={{ fontSize: '16px', padding: '14px 28px' }}>
            Demarrer Gratuitement
          </Link>
        </motion.div>
      </section>

      <footer className="landing-footer">
        <p>© {new Date().getFullYear()} OpaysFox. Tous droits reserves.</p>
      </footer>
    </div>
  );
}
