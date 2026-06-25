import { TrendingUp, Wallet, Receipt, Users, Repeat, MessageSquare, Bell, Sparkles } from 'lucide-react';

const SUGGESTIONS = {
  dashboard: [
    { id: 'transaction', label: 'Nouvelle transaction', icon: TrendingUp },
    { id: 'topup', label: 'Recharger une caisse', icon: Wallet },
    { id: 'whatsapp', label: 'Relance WhatsApp', icon: MessageSquare },
  ],
  wallets: [
    { id: 'new-wallet', label: 'Nouveau wallet', icon: Wallet },
    { id: 'low-balance', label: 'Caisse faible', icon: Bell },
    { id: 'capital', label: 'Mouvement capital', icon: TrendingUp },
  ],
  expenses: [
    { id: 'biz-expense', label: 'Depense pro', icon: Receipt },
    { id: 'withdraw', label: 'Retrait perso', icon: Wallet },
    { id: 'stats', label: 'Stats categories', icon: Sparkles },
  ],
  menu: [
    { id: 'employees', label: 'Employes', icon: Users },
    { id: 'transfers', label: 'Transferts', icon: Repeat },
    { id: 'tickets', label: 'Tickets', icon: MessageSquare },
  ],
};

export default function SuggestionChips({ activeTab, onAction }) {
  const chips = SUGGESTIONS[activeTab] || [];
  return (
    <div className="ofx-suggestion-chips" role="list">
      {chips.map(chip => {
        const Icon = chip.icon;
        return (
          <button
            key={chip.id}
            className="ofx-chip"
            onClick={() => onAction(chip.id)}
            role="listitem"
          >
            <Icon size={14} />
            <span>{chip.label}</span>
          </button>
        );
      })}
    </div>
  );
}
