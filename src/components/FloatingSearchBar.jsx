import { Search, Mic, Menu } from 'lucide-react';
import { useT } from '../i18n';
import { useApp } from '../context/AppContext';

export default function FloatingSearchBar({
  searchQuery,
  setSearchQuery,
  onOpenVoiceAgent,
  onOpenProfile,
  activeTab,
  setActiveTab,
}) {
  const t = useT();
  const { user } = useApp();

  // Initiales de l'utilisateur pour l'avatar
  const userInitials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : 'OP';

  // Suggestions de boutons pilules dynamiques selon l'onglet actif
  const getPills = () => {
    switch (activeTab) {
      case 'dashboard':
        return [
          { label: t('dashboard.pills_all_wallets') || 'Toutes les caisses', action: () => {} },
          { label: t('nav.transferts') || 'Transferts', action: () => setActiveTab('transferts') },
          { label: t('nav.abonnements') || 'Abonnements', action: () => setActiveTab('abonnements') },
        ];
      case 'wallets':
        return [
          { label: t('wallets.pills_cash') || 'Espèces', action: () => {} },
          { label: t('wallets.pills_mobile') || 'Mobile Money', action: () => {} },
        ];
      case 'expenses':
        return [
          { label: t('expenses.pills_biz') || 'Business', action: () => {} },
          { label: t('expenses.pills_perso') || 'Personnel', action: () => {} },
        ];
      case 'debts':
      case 'clients':
      case 'loans':
        return [
          { label: t('loans.pills_active') || 'Prêts Actifs', action: () => {} },
          { label: t('debts.pills_receivables') || 'Créances', action: () => {} },
          { label: t('debts.pills_payables') || 'Dettes', action: () => {} },
        ];
      default:
        return [
          { label: t('nav.dashboard') || 'Trésorerie', action: () => setActiveTab('dashboard') },
          { label: t('nav.transactions') || 'Historique', action: () => setActiveTab('transactions') },
        ];
    }
  };

  const pills = getPills();

  return (
    <div className="floating-searchbar-container">
      <div className="floating-searchbar-card">
        <button
          type="button"
          className="searchbar-icon-btn menu-btn"
          onClick={onOpenProfile}
          aria-label="Ouvrir le menu profil"
        >
          <Menu size={20} />
        </button>
        
        <input
          type="text"
          className="searchbar-input"
          placeholder={t('dashboard.search_placeholder') || 'Rechercher...'}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <div className="searchbar-right-actions">
          {onOpenVoiceAgent && (
            <button
              type="button"
              className="searchbar-icon-btn mic-btn"
              onClick={onOpenVoiceAgent}
              aria-label={t('dashboard.voice_agent_aria') || 'IA Vocale'}
              title={t('dashboard.voice_agent') || 'IA Vocale'}
            >
              <Mic size={18} />
            </button>
          )}

          <button
            type="button"
            className="searchbar-avatar-btn"
            onClick={onOpenProfile}
            aria-label="Menu profil et agences"
          >
            <span className="searchbar-avatar-text">{userInitials}</span>
          </button>
        </div>
      </div>

      {/* Suggestion pills horizontal scroll row */}
      <div className="pills-scroll-row">
        {pills.map((pill, idx) => (
          <button
            key={idx}
            type="button"
            className="pill-suggestion-btn"
            onClick={pill.action}
          >
            {pill.label}
          </button>
        ))}
      </div>
    </div>
  );
}
