import { X, Smartphone, Banknote, Receipt, ArrowRightLeft, BadgePercent } from 'lucide-react';
import { useT } from '../i18n';

const SERVICES = [
  { id: 'mobile-money', label: 'Mobile Money', desc: 'Depot / retrait', icon: Smartphone },
  { id: 'change', label: 'Change de devises', desc: 'USD, CDF, RWF...', icon: ArrowRightLeft },
  { id: 'bills', label: 'Paiement factures', desc: 'Electricite, eau...', icon: Receipt },
  { id: 'cash', label: 'Cash pickup', desc: 'Retrait immediat', icon: Banknote },
  { id: 'loan', label: 'Micro-Credit', desc: 'Pret express', icon: BadgePercent },
];

export default function WhatsAppCatalog({ isOpen, onClose, onService }) {
  const t = useT();
  if (!isOpen) return null;
  return (
    <div className="ofx-whatsapp-modal" onClick={onClose}>
      <div className="ofx-whatsapp-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="ofx-whatsapp-header">
          <div>
            <h3>WhatsApp OpaysFox</h3>
            <p>Choisissez un service</p>
          </div>
          <button className="ofx-whatsapp-close" onClick={onClose} aria-label={t('common.close') || 'Fermer'}>
            <X size={22} />
          </button>
        </div>
        <div className="ofx-whatsapp-body">
          {SERVICES.map(s => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                className="ofx-service-card"
                onClick={() => { onService(s.id); onClose(); }}
              >
                <div className="ofx-service-icon">
                  <Icon size={22} />
                </div>
                <div className="ofx-service-text">
                  <div className="title">{s.label}</div>
                  <div className="desc">{s.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
