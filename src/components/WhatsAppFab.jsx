import { MessageCircle } from 'lucide-react';

export default function WhatsAppFab({ onClick }) {
  return (
    <button className="ofx-whatsapp-fab" onClick={onClick} aria-label="WhatsApp" title="WhatsApp">
      <MessageCircle size={28} fill="currentColor" />
    </button>
  );
}
