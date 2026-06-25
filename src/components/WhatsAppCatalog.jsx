import { X, MessageCircle, Wallet, Receipt, Globe, Zap, Smartphone } from 'lucide-react';

const services = [
  { id: 'mobile-money', title: 'Mobile Money', desc: 'Depots, retraits et transferts', icon: Smartphone, color: '#25D366' },
  { id: 'change', title: 'Change de Devises', desc: 'USD, UGX, EUR, RWF, XAF', icon: Globe, color: '#3b62d4' },
  { id: 'bills', title: 'Paiement Factures', desc: 'Electricite, eau, internet', icon: Receipt, color: '#f97316' },
  { id: 'cash', title: 'Retrait Cash', desc: 'Disponible en agence', icon: Wallet, color: '#22c55e' },
  { id: 'loans', title: 'Micro-Credit', desc: 'Prets et creances clients', icon: Zap, color: '#eab308' },
];

export default function WhatsAppCatalog({ isOpen, onClose, onService }) {
  if (!isOpen) return null;

  return (
    <div className="ofx-whatsapp-modal-overlay" onClick={onClose}>
      <div className="ofx-whatsapp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ofx-whatsapp-header">
          <h3>
            <MessageCircle size={24} color="#25D366" fill="#25D366" />
            Commander via WhatsApp
          </h3>
          <button className="ofx-whatsapp-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="ofx-whatsapp-hero">
          <img src="/favicon.svg" alt="OpaysFox" />
          <h4>OpaysFox sur WhatsApp</h4>
          <p>Envoyez-nous une commande, un recu ou une note vocale. Notre IA traite votre demande automatiquement.</p>
        </div>

        <div className="ofx-service-grid">
          {services.map(service => (
            <button
              key={service.id}
              className="ofx-service-card"
              onClick={() => { onService(service.id); onClose(); }}
            >
              <div className="icon" style={{ background: `${service.color}20`, color: service.color }}>
                <service.icon size={20} />
              </div>
              <div className="title">{service.title}</div>
              <div className="desc">{service.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
