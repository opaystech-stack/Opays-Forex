import { useApp } from './context/AppContext';

const translations = {
  fr: {
    app: { subtitle: 'Gestion Forex', title: 'OpaysFox' },
    nav: { dashboard: 'Dashboard', transactions: 'Transactions', wallets: 'Portefeuilles', expenses: 'Dépenses', loans: 'Prêts', settings: 'Paramètres' },
    loading: { data: 'Chargement des données...' },
    dashboard: {
      patrimoine: 'Patrimoine Global',
      consolidation: 'Consolidation automatique en temps réel de toutes vos caisses et wallets.',
      summary_today: "Résumé d'aujourd'hui",
      profit: 'Bénéfice de Change',
      biz_expense: "Dépenses Agence",
      net_kiosk: 'Bénéfice Net Kiosque :',
      personal_withdrawals: 'Prélèvements Personnels :',
      wallets_title: 'Vos Caisses & Wallets',
      wallets_none: "Aucun portefeuille créé. Rendez-vous dans l'onglet « Portefeuilles » pour configurer vos caisses.",
      search_title: 'Recherche & Litiges',
      filter_active: 'Filtre actif :',
      search_placeholder: 'Rechercher par ID Transaction, Note... ',
      no_txns: 'Aucune transaction trouvée.',
      drafts_pending: 'brouillon(s) en attente',
      drafts_confirm_error: 'Erreur lors de la validation : '
    },
    modal: {
      txn_details: 'Détails de la Transaction',
      close: 'Fermer',
      source_wallet: 'Portefeuille Source',
      dest_wallet: 'Portefeuille Dest.',
      none_deposit: 'Aucun (Dépôt Capital)',
      none_withdraw: 'Aucun (Retrait Capital)',
      rate: 'Taux Pratiqué',
      profit: 'Bénéfice Réalisé',
      txn_id_label: "ID Unique de Réseau (Preuve Litige)",
      note: 'Note de Transaction',
      date_time: 'Date & Heure'
    },
    expenses: {
      title: 'Nouvelle Dépense',
      desc: "Enregistrer un retrait pour le business ou vos besoins personnels.",
      pro: 'Dépense Kiosque (Pro)',
      personal: 'Retrait Perso',
      no_wallets: "Aucune caisse disponible",
      save: 'Enregistrer le Retrait',
      recent_none: 'Aucune dépense enregistrée.',
      wallet_label: 'Caisse / Portefeuille débité',
      amount_label: 'Montant dépensé',
      category_label: 'Catégorie',
      note_label: 'Détail / Note explicative'
    },
    loans: {
      title: 'Prêts & Clients',
      desc: 'Gérer vos prêts et votre base de clients.',
      demo_badge: 'DÉMO',
      loans_tab: 'Prêts',
      clients_tab: 'Clients',
      add_loan: 'Nouveau Prêt',
      cancel: 'Annuler',
      mark_paid: 'Marquer Payé',
      create_success: 'Prêt créé avec succès ! Le solde de la caisse a été débité.'
    },
    settings: {
      preferences: "Préférences d'affichage",
      language_label: "Langue de l'application",
      lang_note: 'La langue choisie sera appliquée à l\'ensemble de l\'application.',
      reset_mock_confirm: 'Voulez-vous réinitialiser toutes les données de test locales ?'
    },
    common: {
      yes: 'Oui',
      no: 'Non',
      confirm_delete: 'Supprimer ce brouillon ? Cette action est irréversible.'
    }
  },
  en: {
    app: { subtitle: 'Forex Management', title: 'OpaysFox' },
    nav: { dashboard: 'Dashboard', transactions: 'Transactions', wallets: 'Wallets', expenses: 'Expenses', loans: 'Loans', settings: 'Settings' },
    loading: { data: 'Loading data...' },
    dashboard: {
      patrimoine: 'Net Worth',
      consolidation: 'Automatic real-time consolidation of all your cashboxes and wallets.',
      summary_today: "Today's Summary",
      profit: 'Exchange Profit',
      biz_expense: 'Agency Expenses',
      net_kiosk: 'Net Kiosk Profit :',
      personal_withdrawals: 'Personal Withdrawals :',
      wallets_title: 'Your Cashboxes & Wallets',
      wallets_none: "No wallets created. Go to 'Wallets' tab to configure your cashboxes.",
      search_title: 'Search & Disputes',
      filter_active: 'Active filter :',
      search_placeholder: 'Search by Transaction ID, Note...',
      no_txns: 'No transactions found.',
      drafts_pending: 'draft(s) pending',
      drafts_confirm_error: 'Error confirming: '
    },
    modal: {
      txn_details: 'Transaction Details',
      close: 'Close',
      source_wallet: 'Source Wallet',
      dest_wallet: 'Destination Wallet',
      none_deposit: 'None (Capital Deposit)',
      none_withdraw: 'None (Capital Withdrawal)',
      rate: 'Applied Rate',
      profit: 'Realized Profit',
      txn_id_label: 'Network Unique ID (Dispute Evidence)',
      note: 'Transaction Note',
      date_time: 'Date & Time'
    },
    expenses: {
      title: 'New Expense',
      desc: 'Record a withdrawal for business or personal needs.',
      pro: 'Kiosk Expense (Pro)',
      personal: 'Personal Withdrawal',
      no_wallets: 'No wallets available',
      save: 'Save Withdrawal',
      recent_none: 'No expenses recorded.',
      wallet_label: 'Debited Wallet',
      amount_label: 'Amount',
      category_label: 'Category',
      note_label: 'Detail / Note'
    },
    loans: {
      title: 'Loans & Customers',
      desc: 'Manage your loans and customer base.',
      demo_badge: 'DEMO',
      loans_tab: 'Loans',
      clients_tab: 'Clients',
      add_loan: 'New Loan',
      cancel: 'Cancel',
      mark_paid: 'Mark Paid',
      create_success: 'Loan created successfully! Wallet balance debited.'
    },
    settings: {
      preferences: 'Display Preferences',
      language_label: 'Application language',
      lang_note: 'Selected language will apply across the app.',
      reset_mock_confirm: 'Reset all local demo data?'
    },
    common: { yes: 'Yes', no: 'No', confirm_delete: 'Delete this draft? This action is irreversible.' }
  }
};

export function useT() {
  const { language } = useApp();
  return (key) => {
    const lang = language || 'fr';
    const parts = key.split('.');
    let cur = translations[lang];
    for (const p of parts) {
      if (!cur) return key;
      cur = cur[p];
    }
    return cur || key;
  };
}

export default translations;
