import { useApp } from '../context/AppContext';
import { ArrowRightLeft, Wallet, Receipt, Users, Repeat, MessageSquare, Bell, TrendingUp, AlertCircle, Plus } from 'lucide-react';

const suggestionsByTab = {
  dashboard: [
    { id: 'new-txn', label: 'Nouvelle transaction', icon: ArrowRightLeft, action: 'transaction' },
    { id: 'kpi', label: 'Voir evolution', icon: TrendingUp, action: 'kpi' },
    { id: 'reminder', label: 'Relance WhatsApp', icon: Bell, action: 'whatsapp' },
  ],
  wallets: [
    { id: 'topup', label: 'Recharger caisse', icon: Plus, action: 'topup' },
    { id: 'new-wallet', label: 'Nouveau wallet', icon: Wallet, action: 'new-wallet' },
    { id: 'low-balance', label: 'Soldes faibles', icon: AlertCircle, action: 'low-balance' },
  ],
  expenses: [
    { id: 'biz-expense', label: 'Depense pro', icon: Receipt, action: 'biz-expense' },
    { id: 'personal', label: 'Retrait perso', icon: Wallet, action: 'personal' },
    { id: 'category', label: 'Categories', icon: Plus, action: 'category' },
  ],
  menu: [
    { id: 'employees', label: 'Employes', icon: Users, action: 'employees' },
    { id: 'transfers', label: 'Transferts', icon: Repeat, action: 'transfers' },
    { id: 'tickets', label: 'Tickets', icon: MessageSquare, action: 'tickets' },
  ],
};

export default function SuggestionChips({ activeTab, onAction }) {
  const { wallets } = useApp();
  const chips = suggestionsByTab[activeTab] || suggestionsByTab.dashboard;

  const handleClick = (chip) => {
    if (chip.action === 'low-balance') {
      const low = wallets.filter(w => w.balance < 100).map(w => w.name);
      onAction('low-balance', low);
      return;
    }
    onAction(chip.action);
  };

  return (
    <div className="ofx-suggestion-chips">
      {chips.map(chip => (
        <button key={chip.id} className="ofx-chip" onClick={() => handleClick(chip)}>
          <chip.icon size={14} />
          {chip.label}
        </button>
      ))}
    </div>
  );
}
