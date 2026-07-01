import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ArrowLeftRight, TrendingDown, Landmark, Coins,
  SendHorizonal, Tv, Plane, ClipboardList, MoreHorizontal, Shield, Sliders,
  Building2, ArrowLeft, Plus, Menu,
} from 'lucide-react';
import { useT } from '../i18n';
import { useApp } from '../context/AppContext';

export default function Navbar({
  activeTab,
  setActiveTab,
  isUsingMock,
  hasPermission,
  isModuleEnabled,
  mode = 'agency',
  onOpenProfile,
}) {
  const t = useT();
  const navigate = useNavigate();
  const { isAdmin, profilAcces, user } = useApp();
  const isPlatformEditor = Boolean(profilAcces?.is_platform_editor) || Boolean(user?.isDemo);

  // Détection du mode mobile pour adapter la liste des onglets (R8)
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 900 : false
  );

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 900);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 5 onglets de base toujours visibles.
  const coreTabs = [
    { id: 'dashboard',    label: t('nav.dashboard'),    icon: LayoutDashboard },
    { id: 'transactions', label: t('nav.transactions'), icon: ArrowLeftRight },
    { id: 'wallets',      label: t('nav.wallets'),      icon: Landmark },
    { id: 'expenses',     label: t('nav.expenses'),     icon: TrendingDown },
    { id: 'loans',        label: t('nav.loans'),        icon: Coins },
  ];

  // Onglets de super-administration plateforme
  const platformTabs = [
    { id: 'stats', label: t('platform_admin.nav_stats') || 'Statistiques', icon: LayoutDashboard },
    { id: 'agencies', label: t('platform_admin.nav_agencies') || 'Gestion Agences', icon: Building2 },
    { id: 'catalogs', label: t('platform_admin.nav_catalogs') || 'Catalogues de Référence', icon: Sliders },
    { id: 'back-to-app', label: t('nav.dashboard') || 'Retour App', icon: ArrowLeft },
  ];

  // Onglets conditionnels (SaaS / Modules additionnels).
  // NB (Bug B) : l'onglet "Employés" est volontairement absent du menu latéral
  // PC : la gestion des employés s'effectue depuis l'Espace_Administration_Agence
  // (Console_Admin), pas depuis la navigation courante de l'agence.
  const conditionalTabs = [
    isModuleEnabled && isModuleEnabled('transfert_argent')
      ? { id: 'transferts', label: t('nav.transferts') || 'Transferts', icon: SendHorizonal }
      : null,
    isModuleEnabled && isModuleEnabled('abonnements')
      ? { id: 'abonnements', label: t('nav.abonnements') || 'Abonnements', icon: Tv }
      : null,
    isModuleEnabled && isModuleEnabled('billets_avion')
      ? { id: 'billets', label: t('nav.billets') || 'Billets', icon: Plane }
      : null,
    isModuleEnabled && isModuleEnabled('commande_distance')
      ? { id: 'remote_orders', label: t('nav.remote_orders') || 'Commandes', icon: ClipboardList }
      : null,
    user
      ? { id: 'admin', label: 'Admin', icon: Shield }
      : null,
    isPlatformEditor
      ? { id: 'admin-plateforme', label: 'Admin Plateforme', icon: Sliders }
      : null,
  ].filter(Boolean);

  // Construction de la liste des onglets selon le viewport
  let tabs;
  if (mode === 'platform') {
    tabs = platformTabs;
  } else if (isMobile) {
    // Sur mobile, on affiche exactement 4 onglets de base + un bouton central Plus (Total = 5 items)
    tabs = [
      { id: 'dashboard',    label: t('nav.dashboard') || 'Trésorerie',    icon: LayoutDashboard },
      { id: 'wallets',      label: t('nav.wallets') || 'Caisse',          icon: Landmark },
      { id: 'transactions', label: t('nav.transactions') || 'Ajouter',     icon: Plus, isSpecial: true },
      { id: 'expenses',     label: t('nav.expenses') || 'Dépense',        icon: TrendingDown },
      { id: 'more',         label: t('nav.more') || 'Menu',               icon: Menu },
    ];
  } else {
    // Sur bureau (sidebar), on affiche tout verticalement de façon complète
    tabs = [...coreTabs, ...conditionalTabs];
  }

  const handleTabClick = (tabId) => {
    if (mode === 'platform') {
      if (tabId === 'back-to-app') {
        navigate('/app');
      } else {
        setActiveTab(tabId);
      }
      return;
    }
    if (tabId === 'admin-plateforme') {
      navigate('/admin-plateforme');
      return;
    }
    const isAppPath = window.location.pathname.startsWith('/app');
    if (!isAppPath) {
      // Si on est sur une autre page (admin), on redirige vers /app avec l'onglet désiré
      navigate(`/app?tab=${tabId}`);
    } else {
      setActiveTab(tabId);
    }
  };

  return (
    <nav className={`mobile-navbar${mode === 'platform' ? ' platform-mode' : ''}`}>
      {/* En-tête de la sidebar — visible uniquement sur desktop via CSS */}
      <div className="sidebar-logo">
        <img
          src="/logo_fox-icone.png"
          alt="Opays Forex"
          style={{ height: '40px', width: 'auto', marginBottom: '8px' }}
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
        <h2 className="logo-title">{mode === 'platform' ? 'Plateforme Admin' : t('app.title')}</h2>
        {isUsingMock && (
          <span className="mock-badge" style={{ marginTop: '8px', display: 'inline-block' }}>
            {t('app.demo')}
          </span>
        )}
        <button
          type="button"
          className="sidebar-user-btn"
          onClick={onOpenProfile}
          aria-label="Mon Profil"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', marginTop: '8px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'transparent', cursor: 'pointer', width: '100%', color: 'var(--text-primary)', fontSize: '13px' }}
        >
          <User size={16} />
          <span>Mon Profil</span>
        </button>
      </div>

      <div className="navbar-tabs-container">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={`navbar-tab${isActive ? ' active' : ''}${tab.isSpecial ? ' special-btn' : ''}`}
              aria-label={tab.label}
            >
              <div className="navbar-tab-icon-container">
                <Icon className="navbar-icon" size={tab.isSpecial ? 24 : 20} />
              </div>
              <span className="navbar-label">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

