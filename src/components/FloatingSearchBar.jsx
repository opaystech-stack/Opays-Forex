import { Search, Mic } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useT } from '../i18n';

export default function FloatingSearchBar({ value, onChange, onVoice, placeholder }) {
  const t = useT();
  const { user } = useApp();
  const initials = `${user?.firstName?.[0] || 'O'}${user?.lastName?.[0] || 'P'}`;

  return (
    <div className="ofx-search-bar">
      <Search className="ofx-search-icon" size={18} />
      <input
        type="text"
        placeholder={placeholder || t('ui.searchPlaceholder') || 'Rechercher caisses, transactions...'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button className="ofx-mic-btn" onClick={onVoice} aria-label={t('ui.voice')} title={t('ui.voice')}>
        <Mic size={18} />
      </button>
      <div className="ofx-avatar-mini" aria-label={t('ui.profile')}>
        {initials}
      </div>
    </div>
  );
}
