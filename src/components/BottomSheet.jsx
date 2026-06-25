import { useState } from 'react';
import { ArrowRightLeft, Receipt, Landmark, Repeat, CalendarCheck, MessageSquare, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ACTIONS = [
  { id: 'transaction', label: 'Transaction', desc: 'Change, depot, retrait', icon: ArrowRightLeft, path: '/app/transactions' },
  { id: 'expense', label: 'Depense', desc: 'Pro ou personnelle', icon: Receipt, path: '/app/expenses' },
  { id: 'loan', label: 'Pret / Creance', desc: 'Client', icon: Landmark, path: '/app/loans' },
  { id: 'transfer', label: 'Transfert', desc: 'Entre caisses', icon: Repeat, path: '/app/transfers' },
  { id: 'subscription', label: 'Abonnement', desc: 'Recurrent', icon: CalendarCheck, path: '/app/subscriptions' },
  { id: 'ticket', label: 'Ticket', desc: 'Support client', icon: MessageSquare, path: '/app/tickets' },
];

export default function BottomSheet() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  return (
    <div className={`ofx-bottom-sheet ${open ? 'open' : ''}`}>
      <button className="ofx-sheet-handle" onClick={() => setOpen(!open)} aria-label="Actions rapides">
        <div className="ofx-sheet-bar" />
        <span className="ofx-sheet-label">{open ? 'Fermer' : 'Actions rapides'}</span>
      </button>

      <div className="ofx-sheet-body">
        <div className="ofx-sheet-grid">
          {ACTIONS.map(a => {
            const Icon = a.icon;
            return (
              <button
                key={a.id}
                className="ofx-sheet-card"
                onClick={() => { navigate(a.path); setOpen(false); }}
              >
                <div className="ofx-sheet-icon">
                  <Icon size={22} />
                </div>
                <div className="ofx-sheet-text">
                  <div className="title">{a.label}</div>
                  <div className="desc">{a.desc}</div>
                </div>
              </button>
            );
          })}
          <button className="ofx-sheet-card" onClick={() => { navigate('/app/transactions'); setOpen(false); }}>
            <div className="ofx-sheet-icon primary">
              <Plus size={22} />
            </div>
            <div className="ofx-sheet-text">
              <div className="title">Nouveau</div>
              <div className="desc">Transaction libre</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
