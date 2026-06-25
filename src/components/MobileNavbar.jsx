import { Map, BookOpen, Plus } from 'lucide-react';
import { useT } from '../i18n';

export default function MobileNavbar({ activeTab, onChange }) {
  const t = useT();

  return (
    <nav className="ofx-nav">
      <button
        className={`ofx-nav-item ${activeTab === 'treasury' ? 'active' : ''}`}
        onClick={() => onChange('treasury')}
      >
        <Map size={22} />
        <span>{t('ui.tabTreasury') || 'Trésorerie'}</span>
      </button>

      <button
        className="ofx-nav-add"
        onClick={() => onChange('add')}
        aria-label={t('ui.tabAdd') || 'Ajouter'}
      >
        <Plus size={28} />
      </button>

      <button
        className={`ofx-nav-item ${activeTab === 'ledger' ? 'active' : ''}`}
        onClick={() => onChange('ledger')}
      >
        <BookOpen size={22} />
        <span>{t('ui.tabLedger') || 'Dettes & Créances'}</span>
      </button>
    </nav>
  );
}
