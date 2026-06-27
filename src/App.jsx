import { lazy, Suspense, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import Navbar from './components/Navbar';
import VoiceAgentModal from './components/VoiceAgentModal';
import StandalonePage from './components/StandalonePage';
import StandaloneAdminHeader from './components/StandaloneAdminHeader';
import { hasDebugDemo, hasDebugRestricted } from './utils/debugDemo';
import FloatingSearchBar from './components/FloatingSearchBar';
import SlidingBottomSheet from './components/SlidingBottomSheet';
import ProfileDrawer from './components/ProfileDrawer';
import WhatsAppFab from './components/WhatsAppFab';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Transactions = lazy(() => import('./pages/Transactions'));
const WalletsPage = lazy(() => import('./pages/Wallets'));
const Expenses = lazy(() => import('./pages/Expenses'));
const LoansPage = lazy(() => import('./pages/Loans'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const SignIn = lazy(() => import('./pages/SignIn'));
const SignUp = lazy(() => import('./pages/SignUp'));
const Home = lazy(() => import('./pages/Home'));
const Debts = lazy(() => import('./pages/Debts'));
// Pages du contrôle d'accès payant (spec paid-access-control)
const AccesRestreint = lazy(() => import('./pages/AccesRestreint'));
const Paiement = lazy(() => import('./pages/Paiement'));
const ConsoleAdmin = lazy(() => import('./pages/ConsoleAdmin'));
// Formulaire_Commande — page publique de commande à distance (agency-operations-expansion, Req 14.3)
const FormulaireCommande = lazy(() => import('./pages/FormulaireCommande'));
// Nouvelles pages — agency-operations-expansion (tâche 22.1)
const Employes = lazy(() => import('./pages/Employes'));
const EspaceAdminPlateforme = lazy(() => import('./pages/EspaceAdminPlateforme'));
const Transferts = lazy(() => import('./pages/Transferts'));
const Abonnements = lazy(() => import('./pages/Abonnements'));
const Billets = lazy(() => import('./pages/Billets'));
const CommandesDistantes = lazy(() => import('./pages/CommandesDistantes'));

import { Loader2, Settings, Users, Mic, ShieldAlert, Shield, ChevronRight, Tv, Plane, ClipboardList, SendHorizonal, Sliders } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useT } from './i18n';

// Full-screen loading spinner
function LoadingScreen() {
  const t = useT();
  return (
    <div className="auth-overlay" style={{ display: 'flex', flexDirection: 'column', gap: '20px', justifyContent: 'center', alignItems: 'center' }}>
      <div className="auth-header" style={{ marginBottom: '0' }}>
        <span className="auth-subtitle">OpaysFox</span>
        <h1 className="auth-title" style={{ fontSize: '28px', marginTop: '4px' }}>{t('loading.init_title')}</h1>
      </div>
      <div style={{ color: '#ffffff', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', fontWeight: '500', opacity: 0.8 }}>
        <Loader2 className="animate-spin" size={20} />
        <span>{t('loading.session_check')}</span>
      </div>
    </div>
  );
}

function MoreMenuPage({ setActiveTab, hasPermission, isModuleEnabled }) {
  const t = useT();
  const navigate = useNavigate();
  const { isAdmin, profilAcces, user } = useApp();
  const isPlatformEditor = Boolean(profilAcces?.is_platform_editor) || Boolean(user?.isDemo);

  const items = [
    {
      id: 'clients',
      label: t('nav.clients') || 'Clients',
      icon: Users,
      description: 'Gérer le fichier client et les comptes',
      show: true,
    },
    {
      id: 'employes',
      label: t('nav.employes') || 'Employés',
      icon: Users,
      description: 'Gérer les profils et accès de l\'équipe',
      show: hasPermission && hasPermission('employes.gerer'),
    },
    {
      id: 'transferts',
      label: t('nav.transferts') || 'Transferts',
      icon: SendHorizonal,
      description: 'Effectuer et suivre les transferts de fonds',
      show: isModuleEnabled && isModuleEnabled('transfert_argent'),
    },
    {
      id: 'abonnements',
      label: t('nav.abonnements') || 'Abonnements',
      icon: Tv,
      description: 'Gérer les services de streaming et renouvellements',
      show: isModuleEnabled && isModuleEnabled('abonnements'),
    },
    {
      id: 'billets',
      label: t('nav.billets') || 'Billets',
      icon: Plane,
      description: 'Réservation de vols et gestion de billetterie',
      show: isModuleEnabled && isModuleEnabled('billets_avion'),
    },
    {
      id: 'remote_orders',
      label: t('nav.remote_orders') || 'Commandes',
      icon: ClipboardList,
      description: 'Suivre les commandes à distance des clients',
      show: isModuleEnabled && isModuleEnabled('commande_distance'),
    },
    {
      id: 'admin',
      label: t('nav.admin') || 'Admin Agence',
      icon: Shield,
      description: 'Gérer les autorisations et valider les accès de l\'agence',
      show: isAdmin && isAdmin(),
    },
    {
      id: 'admin-plateforme',
      label: t('nav.platform_admin') || 'Admin Plateforme',
      icon: Sliders,
      description: 'Super-administration globale du SaaS (agences, modules, catalogues)',
      show: isPlatformEditor,
    },
    {
      id: 'settings',
      label: t('nav.settings') || 'Paramètres',
      icon: Settings,
      description: 'Configuration générale de l\'application',
      show: true,
    }
  ].filter(item => item.show);

  return (
    <div style={{ padding: '8px 4px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px', color: 'var(--text-primary)' }}>
        {t('nav.more') || 'Plus d\'options'}
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
        {items.map(item => {
          const Icon = item.icon;
          return (
            <div
              key={item.id}
              onClick={() => {
                if (item.id === 'admin-plateforme') {
                  navigate('/admin-plateforme');
                } else {
                  setActiveTab(item.id);
                }
              }}
              className="card"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px',
                cursor: 'pointer',
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '12px',
                  background: 'var(--indigo-soft)',
                  color: 'var(--indigo-strong)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Icon size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: '600', margin: 0, color: 'var(--text-primary)' }}>{item.label}</h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>{item.description}</p>
                </div>
              </div>
              <ChevronRight size={18} style={{ color: 'var(--text-secondary)' }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// The authenticated app shell with tab navigation
function AppShell() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [draftToEdit, setDraftToEdit] = useState(null);
  const [voiceAgentOpen, setVoiceAgentOpen] = useState(false);
  const { isUsingMock, hasPermission, isModuleEnabled, profilAcces, user, isAdmin, getDrafts } = useApp();
  const navigate = useNavigate();
  const t = useT();

  const [profileDrawerOpen, setProfileDrawerOpen] = useState(false);
  const [selectedWalletId, setSelectedWalletId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sheetOpen, setSheetOpen] = useState(true);
  const pendingCount = getDrafts().length;

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam) {
      // Synchronisation ponctuelle depuis l'URL puis nettoyage de l'historique
      // (effet de bord volontaire) ; pattern d'initialisation à l'ouverture.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTab(tabParam);
      params.delete('tab');
      const searchString = params.toString();
      const newUrl = window.location.pathname + (searchString ? `?${searchString}` : '');
      window.history.replaceState({}, document.title, newUrl);
    }
  }, []);

  const handleTabChange = (tabId) => {
    if (tabId === 'dashboard') {
      if (activeTab === 'dashboard') {
        setSheetOpen(prev => !prev);
      } else {
        setActiveTab('dashboard');
        setSheetOpen(true);
      }
    } else {
      setActiveTab(tabId);
      setSheetOpen(true);
    }
  };

  // Acces a l'Espace_Administration_Plateforme (SaaS) : reserve a
  // l'Editeur_Plateforme (ou mode demo). Les membres ordinaires ne voient JAMAIS
  // ce point d'entree, et la route /admin-plateforme is gardee independamment.
  const isPlatformEditor = Boolean(profilAcces?.is_platform_editor) || Boolean(user?.isDemo);

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard
            onSelectDraft={(draft) => {
              setDraftToEdit(draft);
              setActiveTab('transactions');
              setSheetOpen(true);
            }}
            selectedWalletId={selectedWalletId}
            setSelectedWalletId={setSelectedWalletId}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
          />
        );
      case 'transactions':
        return (
          <Transactions
            draftToEdit={draftToEdit}
            clearDraftToEdit={() => setDraftToEdit(null)}
          />
        );
      case 'wallets':
        return <WalletsPage />;
      case 'expenses':
        return <Expenses />;
      case 'loans':
        return <LoansPage mode="loans" onOpenDebts={() => setActiveTab('debts')} />;
      case 'clients':
        return <LoansPage mode="clients" />;
      case 'settings':
        return <SettingsPage />;
      case 'debts':
        return <Debts />;
      case 'admin':
        return (
          <div className="standalone-page" style={{ padding: 0, minHeight: 'auto', background: 'none', boxShadow: 'none' }}>
            <ConsoleAdmin />
          </div>
        );
      // Nouvelles pages — agency-operations-expansion (Req 16.1–16.5)
      case 'employes':
        return <Employes />;
      case 'transferts':
        return <Transferts />;
      case 'abonnements':
        return <Abonnements />;
      case 'billets':
        return <Billets />;
      case 'remote_orders':
        return <CommandesDistantes />;
      case 'more':
        return (
          <MoreMenuPage
            setActiveTab={handleTabChange}
            hasPermission={hasPermission}
            isModuleEnabled={isModuleEnabled}
          />
        );
      default:
        return <Dashboard />;
    }
  };

  // =========================================================================
  // MOBILE GOOGLE MAPS LAYOUT ORCHESTRATION
  // =========================================================================
  if (isMobile) {
    return (
      <div className="app-container mobile-layout-active">
        {/* 1. Background Canvas (Treasury wallets & Net Worth) */}
        <div className="canvas-background-wrapper">
          <Dashboard
            view="canvas"
            selectedWalletId={selectedWalletId}
            setSelectedWalletId={setSelectedWalletId}
          />
        </div>

        {/* 2. Floating Search Bar Overlay */}
        <FloatingSearchBar
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onOpenVoiceAgent={() => setVoiceAgentOpen(true)}
          onOpenProfile={() => setProfileDrawerOpen(true)}
          activeTab={activeTab}
          setActiveTab={handleTabChange}
        />

        {/* 3. Sliding Bottom Sheet Overlay */}
        <SlidingBottomSheet
          isOpen={sheetOpen || activeTab !== 'dashboard'}
          onClose={() => setSheetOpen(false)}
          title={
            activeTab === 'dashboard'
              ? t('dashboard.details') || 'Détails Trésorerie'
              : activeTab === 'wallets'
              ? t('nav.wallets') || 'Caisses'
              : activeTab === 'expenses'
              ? t('nav.expenses') || 'Dépenses'
              : activeTab === 'more'
              ? t('nav.more') || 'Menu Options'
              : t('nav.transactions') || 'Historique'
          }
          isMobile={true}
        >
          <Suspense fallback={<div className="card glass-card" style={{ padding: '16px' }}>{t('loading.page')}</div>}>
            {activeTab === 'dashboard' ? (
              <Dashboard
                view="sheet"
                onSelectDraft={(draft) => {
                  setDraftToEdit(draft);
                  setActiveTab('transactions');
                  setSheetOpen(true);
                }}
                selectedWalletId={selectedWalletId}
                setSelectedWalletId={setSelectedWalletId}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
              />
            ) : (
              renderActiveTab()
            )}
          </Suspense>
        </SlidingBottomSheet>

        {/* 4. WhatsApp FAB (shows only if there are pending drafts) */}
        <WhatsAppFab
          pendingCount={pendingCount}
          onClick={() => {
            setActiveTab('dashboard');
            setSheetOpen(true);
          }}
        />

        {/* 5. Bottom Navigation Bar */}
        <Navbar
          activeTab={activeTab}
          setActiveTab={handleTabChange}
          isUsingMock={isUsingMock}
          hasPermission={hasPermission}
          isModuleEnabled={isModuleEnabled}
        />

        {/* 6. Profile & Multi-Agencies Drawer */}
        <ProfileDrawer
          isOpen={profileDrawerOpen}
          onClose={() => setProfileDrawerOpen(false)}
        />

        {/* 7. Voice Agent Modal */}
        <VoiceAgentModal
          open={voiceAgentOpen}
          onClose={() => setVoiceAgentOpen(false)}
          onSearchHistory={() => {
            setVoiceAgentOpen(false);
            setActiveTab('dashboard');
            setSheetOpen(true);
          }}
        />
      </div>
    );
  }

  // =========================================================================
  // STANDARD DESKTOP LAYOUT (Unmodified)
  // =========================================================================
  return (
    <div className="app-container">
      <Navbar
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        isUsingMock={isUsingMock}
        hasPermission={hasPermission}
        isModuleEnabled={isModuleEnabled}
      />
      <div className="main-layout">
        <div className="floating-spheres">
          <div className="sphere sphere-1"></div>
          <div className="sphere sphere-2"></div>
          <div className="sphere sphere-3"></div>
          <div className="sphere sphere-4"></div>
        </div>
        <header className="app-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img
              src="/logo_fox-icone.png"
              alt="OpaysFox"
              style={{ height: '36px', width: 'auto' }}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            <div>
              <span className="app-subtitle">{t('app.subtitle')}</span>
              <h1 className="app-title">{t('app.title')}</h1>
            </div>
          </div>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isUsingMock && (
              <span className="mock-badge">{t('app.demo')}</span>
            )}
            {isPlatformEditor && (
              <button
                aria-label={t('nav.platform_admin')}
                title={t('nav.platform_admin')}
                className="settings-fab"
                style={{ background: 'linear-gradient(135deg, var(--indigo-strong) 0%, var(--indigo-deep) 100%)' }}
                onClick={() => navigate('/admin-plateforme')}
              >
                <Sliders size={18} />
              </button>
            )}
            {isAdmin && isAdmin() && (
              <button
                aria-label={t('nav.admin') || 'Admin Agence'}
                title={t('nav.admin') || 'Admin Agence'}
                className={`settings-fab${activeTab === 'admin' ? ' active' : ''}`}
                style={{
                  background: activeTab === 'admin'
                    ? 'linear-gradient(135deg, var(--indigo-strong) 0%, var(--indigo-deep) 100%)'
                    : 'var(--bg-secondary, rgba(79, 70, 229, 0.08))',
                  color: activeTab === 'admin' ? '#ffffff' : 'var(--indigo-strong)'
                }}
                onClick={() => setActiveTab(activeTab === 'admin' ? 'dashboard' : 'admin')}
              >
                <Shield size={18} />
              </button>
            )}
            <button
              aria-label={t('nav.clients_aria')}
              className="clients-fab"
              onClick={() => setActiveTab('clients')}
            >
              <Users size={18} />
            </button>
            <button
              aria-label="Ouvrir les paramètres"
              className="settings-fab"
              onClick={() => setActiveTab('settings')}
            >
              <Settings size={18} />
            </button>
            <button
              aria-label={t('dashboard.voice_agent_aria')}
              className="voice-agent-btn"
              onClick={() => setVoiceAgentOpen(true)}
            >
              <Mic size={18} />
              <span>{t('dashboard.voice_agent')}</span>
            </button>
          </div>
        </header>
        <main className="page-content">
          <Suspense fallback={<div className="card glass-card" style={{ padding: '16px' }}>{t('loading.page')}</div>}>
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                {renderActiveTab()}
              </motion.div>
            </AnimatePresence>
          </Suspense>
        </main>
      </div>
      <VoiceAgentModal
        open={voiceAgentOpen}
        onClose={() => setVoiceAgentOpen(false)}
        onSearchHistory={() => {
          setVoiceAgentOpen(false);
          setActiveTab('dashboard');
        }}
      />
    </div>
  );
}


// Route guard: redirects unauthenticated users to /login
function PrivateRoute({ children }) {
  const { user, loading } = useApp();
  const params = new URLSearchParams(window.location.search);
  const forceDemo = params.has('debug_force_demo');

  if (loading) return <LoadingScreen />;
  if (!user && !forceDemo) return <Navigate to="/login" replace />;
  return children;
}

// Garde d'accès payant (spec paid-access-control, R2.1/R2.2/R2.4) :
// consomme `profileStatus`/`profilAcces` exposés par le contexte.
// - 'loading' ⇒ écran de chargement réutilisé (R2.3).
// - non autorisé ou 'error'/timeout ⇒ Page_Acces_Restreint (R2.2, R2.4).
// - autorisé ⇒ rend les enfants (AppShell, R2.1).
// PRINCIPE : toute incertitude ⇒ accès refusé.
function AccessGate({ children }) {
  const { profileStatus, profilAcces, isAccessGranted } = useApp();

  if (hasDebugRestricted()) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <AccesRestreint />
      </Suspense>
    );
  }
  if (hasDebugDemo()) return children;
  if (profileStatus === 'loading') return <LoadingScreen />;

  const isPlatformEditor = Boolean(profilAcces?.is_platform_editor);
  if (profileStatus !== 'ready' || (!isAccessGranted(profilAcces) && !isPlatformEditor)) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <AccesRestreint />
      </Suspense>
    );
  }
  return children;
}

// Garde d'agence (spec agency-operations-expansion, Req 5.2/5.4/18.2) :
// s'intercale APRÈS PrivateRoute (authentifié) et AccessGate (accès payant),
// en amont de l'AppShell. Tant que l'Etat_Agence courant vaut `suspendue`,
// l'accès au shell authentifié est bloqué et un message d'accès suspendu est
// rendu À LA PLACE de l'AppShell : aucune donnée de trésorerie (portefeuilles,
// transactions, soldes…) n'est montée ni exposée (Req 5.4).
// PRINCIPE : seule la valeur `suspendue` bloque ; un Etat_Agence `active`,
// absent (Editeur_Plateforme sans agence) ou non encore chargé laisse passer,
// la RLS PostgreSQL (`a.state = 'active'`) demeurant l'autorité finale.
// La barrière reste une commodité UX, redoublée côté base.
function AgencyGate({ children }) {
  const { agencyState } = useApp();
  const t = useT();

  if (agencyState === 'suspendue') {
    return (
      <StandalonePage maxWidth={480}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--bg-secondary, #f1f5f9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldAlert size={26} color="var(--color-red)" />
            </div>
          </div>
          <h2 className="screen-title" style={{ marginBottom: '10px' }}>{t('agency_gate.suspended_title')}</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {t('agency_gate.suspended_message')}
          </p>
        </div>
      </StandalonePage>
    );
  }
  return children;
}

// Garde d'administration (spec paid-access-control, R6.9) : l'Utilisateur doit
// être authentifié (assuré par PrivateRoute en amont) ET posséder le rôle admin.
// Tout autre cas rend la Page_Acces_Restreint.
function AdminRoute({ children }) {
  const { profilAcces, isAdmin, user } = useApp();

  // Le mode démo (local / ?debug_force_demo) est autorisé pour permettre le test
  // de la console ; en usage réel, seul un Profil_Accès admin passe (R6.9).
  if (!isAdmin(profilAcces) && !user?.isDemo && !hasDebugDemo()) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <AccesRestreint />
      </Suspense>
    );
  }
  return children;
}

// Garde de l'Espace_Administration_Plateforme (SaaS — agency-operations-expansion,
// Req 4.7/5.5). Réservé à l'Editeur_Plateforme (indicateur `is_platform_editor`),
// le mode démo étant autorisé à explorer. Un membre ordinaire d'agence est
// redirigé vers son app : la console SaaS lui est strictement inaccessible.
function PlatformEditorRoute({ children }) {
  const { profilAcces, user } = useApp();
  const isEditor = Boolean(profilAcces?.is_platform_editor) || Boolean(user?.isDemo) || hasDebugDemo();
  if (!isEditor) {
    return <Navigate to="/app" replace />;
  }
  return children;
}

// Écran isolé de l'Espace_Administration_Plateforme : page autonome, hors de la
// navigation d'agence, avec retour vers l'app et déconnexion. Le contenu (gestion
// des Droits_Module, suspension/réactivation d'agences, statistiques globales,
// catalogues) reste porté par EspaceAdminPlateforme, lui-même gardé en interne.
function PlatformAdminScreen() {
  const navigate = useNavigate();
  const { isUsingMock, hasPermission, isModuleEnabled, logOut } = useApp();
  const t = useT();
  const [platformTab, setPlatformTab] = useState('stats');

  const handleLogout = async () => {
    const res = await logOut();
    if (res?.success) navigate('/login');
  };

  return (
    <div className="app-container">
      <Navbar
        mode="platform"
        activeTab={platformTab}
        setActiveTab={setPlatformTab}
        isUsingMock={isUsingMock}
        hasPermission={hasPermission}
        isModuleEnabled={isModuleEnabled}
      />
      <div className="main-layout platform-layout">
        <StandaloneAdminHeader onBack={() => navigate('/app')} onLogout={handleLogout} />
        <main className="page-content">
          <Suspense fallback={<div className="card" style={{ padding: '16px' }}>{t('loading.page')}</div>}>
            <div className="standalone-page" style={{ padding: 0, minHeight: 'auto', background: 'none', boxShadow: 'none' }}>
              <EspaceAdminPlateforme activeTab={platformTab} />
            </div>
          </Suspense>
        </main>
      </div>
    </div>
  );
}

// Écran isolé de la Console_Admin : page autonome, hors de l'AppShell, symétrique
// de PlatformAdminScreen. Elle fournit le même chrome (retour vers l'app +
// déconnexion via StandaloneAdminHeader) autour de la Console_Admin inchangée et
// gardée en amont (PrivateRoute + AdminRoute). Aucune logique métier, garde ou
// flux de données n'est modifié : chrome présentationnel uniquement.
function AdminConsoleScreen() {
  const navigate = useNavigate();
  const { isUsingMock, hasPermission, isModuleEnabled, logOut } = useApp();

  const handleLogout = async () => {
    const res = await logOut();
    if (res?.success) navigate('/login');
  };

  return (
    <div className="app-container">
      <Navbar
        mode="platform"
        activeTab="admin"
        setActiveTab={() => {}}
        isUsingMock={isUsingMock}
        hasPermission={hasPermission}
        isModuleEnabled={isModuleEnabled}
      />
      <div className="main-layout platform-layout">
        <StandaloneAdminHeader onBack={() => navigate('/app')} onLogout={handleLogout} />
        <main className="page-content">
          <Suspense fallback={<LoadingScreen />}>
            <div className="standalone-page" style={{ padding: 0, minHeight: 'auto', background: 'none', boxShadow: 'none' }}>
              <ConsoleAdmin />
            </div>
          </Suspense>
        </main>
      </div>
    </div>
  );
}

// Route guard: redirects authenticated users away from auth pages
function PublicOnlyRoute({ children }) {
  const { user, loading } = useApp();
  if (loading) return <LoadingScreen />;
  if (user) return <Navigate to="/app" replace />;
  return children;
}

function AppContent() {
  return (
    <Routes>
      {/* Public marketing pages */}
      {/* Page d'accueil marketing — accessible à TOUS (Option A) : un utilisateur
          connecté voit aussi la landing. Les CTA mènent vers /register ou /login
          (jamais directement vers l'app/paiement), la garde d'accès orientant
          ensuite vers la page d'accès restreint si le compte n'est pas payé. */}
      <Route
        path="/"
        element={
          <PublicOnlyRoute>
            <Suspense fallback={null}>
              <Home />
            </Suspense>
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <Suspense fallback={null}>
              <SignIn />
            </Suspense>
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnlyRoute>
            <Suspense fallback={null}>
              <SignUp />
            </Suspense>
          </PublicOnlyRoute>
        }
      />

      {/* Legacy query-param auth redirect for backward compat */}
      <Route path="/auth" element={<Navigate to="/login" replace />} />

      {/* Formulaire_Commande — route PUBLIQUE de commande à distance (Req 14.3).
          Aucune authentification : le client distant accède via le Lien_Commande
          (jeton non devinable). La validité du lien est vérifiée dans la page
          (orderToken.js) puis par la RPC SECURITY DEFINER lors de la soumission. */}
      <Route
        path="/commande/:lien"
        element={
          <Suspense fallback={<LoadingScreen />}>
            <FormulaireCommande />
          </Suspense>
        }
      />

      {/* Protected app — authentifié (PrivateRoute), accès autorisé (AccessGate)
          puis agence non suspendue (AgencyGate, Req 5.2/5.4) */}
      <Route
        path="/app/*"
        element={
          <PrivateRoute>
            <AccessGate>
              <AgencyGate>
                <AppShell />
              </AgencyGate>
            </AccessGate>
          </PrivateRoute>
        }
      />

      {/* Espace_Administration_Plateforme (SaaS) — ISOLÉ de l'app d'agence.
          Authentifié (PrivateRoute) + Editeur_Plateforme (PlatformEditorRoute).
          Inaccessible aux membres ordinaires d'agence (redirigés vers /app). */}
      <Route
        path="/admin-plateforme"
        element={
          <PrivateRoute>
            <PlatformEditorRoute>
              <PlatformAdminScreen />
            </PlatformEditorRoute>
          </PrivateRoute>
        }
      />

      {/* Page_Paiement — accessible à tout Utilisateur authentifié (R2.5 : non
          authentifié ⇒ /login). Volontairement hors AccessGate : un Utilisateur
          non encore autorisé doit pouvoir consulter les coordonnées et soumettre
          une preuve. */}
      <Route
        path="/paiement"
        element={
          <PrivateRoute>
            <Suspense fallback={<LoadingScreen />}>
              <Paiement />
            </Suspense>
          </PrivateRoute>
        }
      />

      {/* Console_Admin — authentifié (PrivateRoute) + rôle admin (AdminRoute, R6.9) */}
      <Route
        path="/admin"
        element={
          <PrivateRoute>
            <AdminRoute>
              <AdminConsoleScreen />
            </AdminRoute>
          </PrivateRoute>
        }
      />

      {/* Catch-all: if authenticated go to app, else go home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// Garde de démarrage : en production, exige une configuration Supabase (R5.9).
function BootGuard({ children }) {
  const { hasCredentials } = useApp();
  if (import.meta.env.PROD && !hasCredentials) {
    return (
      <div className="config-error-overlay">
        <div className="config-error-card">
          <h1>Configuration requise</h1>
          <p>
            L'application ne peut pas démarrer : la configuration Supabase est absente.
            Veuillez définir <strong>VITE_SUPABASE_URL</strong> et <strong>VITE_SUPABASE_ANON_KEY</strong> dans
            les variables d'environnement, puis redéployer.
          </p>
        </div>
      </div>
    );
  }
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <BootGuard>
          <AppContent />
        </BootGuard>
      </AppProvider>
    </BrowserRouter>
  );
}

