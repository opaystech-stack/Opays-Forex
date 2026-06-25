import { MessageCircle } from 'lucide-react';
import { useT } from '../i18n';

export default function WhatsAppFab({ onClick }) {
  const t = useT();
  return (
    <button className="ofx-whatsapp-fab" onClick={onClick} aria-label={t('ui.whatsapp')} title={t('ui.whatsapp')}>
      <MessageCircle size={28} fill="currentColor" />
    </button>
  );
}
