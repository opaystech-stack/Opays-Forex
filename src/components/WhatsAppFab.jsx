import { MessageCircle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function WhatsAppFab({ pendingCount = 0, onClick }) {
  if (pendingCount === 0) return null;

  return (
    <motion.button
      type="button"
      className="whatsapp-fab"
      onClick={onClick}
      aria-label={`${pendingCount} brouillons à valider`}
      title="Brouillons WhatsApp à valider"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.95 }}
    >
      <MessageCircle size={24} />
      
      {/* Badge de notification du nombre de brouillons */}
      <span className="whatsapp-fab-badge">
        {pendingCount}
      </span>
    </motion.button>
  );
}
