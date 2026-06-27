// StandaloneAdminHeader — en-tete partage des espaces d'administration rendus
// HORS de l'AppShell (Admin_Console et Platform_Admin_Space).
//
// Ce composant purement presentationnel extrait l'en-tete jusqu'ici inline dans
// PlatformAdminScreen (src/App.jsx) afin que les deux espaces partagent une
// hierarchie DOM, des classes et un ordre de controles strictement identiques :
// le bouton retour-au-dashboard vient TOUJOURS avant le bouton de deconnexion.
// Les libelles passent par les cles i18n existantes `nav.dashboard` et
// `access.logout` (aucune nouvelle cle, aucun litteral en dur).
import { ArrowLeft, LogOut } from 'lucide-react';
import { useT } from '../i18n';

export default function StandaloneAdminHeader({ onBack, onLogout }) {
  const t = useT();

  return (
    <div className="standalone-header">
      <button
        type="button"
        className="btn btn-outline standalone-header__back"
        onClick={onBack}
      >
        <ArrowLeft size={16} />
        <span>{t('nav.dashboard')}</span>
      </button>
      <button
        type="button"
        className="btn btn-outline standalone-header__logout"
        onClick={onLogout}
      >
        <LogOut size={16} />
        <span>{t('access.logout')}</span>
      </button>
    </div>
  );
}
