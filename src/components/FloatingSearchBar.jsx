import { Search, Mic } from 'lucide-react';
import { useT } from '../i18n';

export default function FloatingSearchBar({ query, onQueryChange, onAvatarClick }) {
  const t = useT();
  const initials = t('ui.initials') || 'OP';

  return (
    <div className="ofx-search-bar">
      <Search className="ofx-search-icon" size={18} />
      <input
        type="text"
        placeholder={t('ui.searchPlaceholder') || 'Rechercher caisses, transactions...'}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
      />
      <button className="ofx-mic-btn" aria-label={t('ui.voice')} title={t('ui.voice')}>
        <Mic size={18} />
      </button>
      <button className="ofx-avatar" onClick={onAvatarClick} aria-label={t('ui.profile')}>
        {initials}
      </button>
    </div>
  );
}
