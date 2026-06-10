import { useApp } from './context/AppContext';

const translations = {
  fr: {
    app: { subtitle: 'Gestion Forex', title: 'OpaysFox', demo: 'Démo' },
    nav: { dashboard: 'Dashboard', transactions: 'Transactions', wallets: 'Portefeuilles', expenses: 'Dépenses', loans: 'Prêts', settings: 'Paramètres' },
    loading: { data: 'Chargement des données...', init_title: 'Initialisation...', session_check: 'Vérification de la session en cours', skeleton: 'Chargement…', page: 'Chargement de la page…' },
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
      ,categories: {
        business: ['Loyer Kiosque', 'Transport de fonds', 'Frais Retrait', 'Airtel Commission', 'MTN Commission', 'Internet/Forfait', 'Salaire Agent', 'Autre Business'],
        personal: ['Famille', 'Nourriture', 'Transport Perso', 'Loyer Maison', 'Santé', 'Scolarité', 'Divertissement', 'Autre Perso']
      },
      required_fields: 'Veuillez remplir tous les champs obligatoires.',
      created_success: 'Dépense enregistrée et solde déduit !',
      wallet_unknown: 'Portefeuille inconnu',
      recent_title: 'Dépenses Récentes',
      amount_placeholder: 'Ex: 5000',
      note_placeholder: 'Ex: Transport Kampala centre, Achat pain...',
      pro_label: 'PRO',
      personal_label: 'PERSO'
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
      create_success: 'Prêt créé avec succès ! Le solde de la caisse a été débité.',
      required_fields: 'Veuillez remplir tous les champs obligatoires.',
      mark_paid_success: 'Prêt marqué comme remboursé ! Solde crédité.',
      client_name_required: 'Le nom du client est requis.',
      client_created_success: 'Client créé avec succès.',
      client_unknown: 'Client inconnu',
      no_txn_related: 'Aucune transaction liée.',
      status: {
        overdue: 'En retard',
        pending: 'En cours',
        paid: 'Remboursé'
      }
    },
    settings: {
      preferences: "Préférences d'affichage",
      language_label: "Langue de l'application",
      lang_note: 'La langue choisie sera appliquée à l\'ensemble de l\'application.',
      rates_title: 'Taux de change du jour (Base USD)',
      rates_desc: 'Combien d\'unités de cette devise équivalent à **1 USD** ? Utilisé pour calculer le patrimoine global.',
      admin_title: 'Administration des Stocks & Caisses',
      admin_desc: 'Ajuster directement et manuellement le solde de vos portefeuilles (utilisé pour corriger une erreur de stock physique).',
      danger_title: 'Zone de Danger',
      danger_desc: 'Réinitialiser les données de test locales pour repartir d\'un grand livre propre.',
      reset_mock_button: 'Réinitialiser les Données Démo',
      reset_mock_confirm: 'Voulez-vous réinitialiser toutes les données de test locales ?',
      user_session: 'Session Utilisateur',
      connected_as: 'Connecté en tant que :',
      logout_button: 'Se Déconnecter',
      save_rates: 'Enregistrer les Taux',
      rates_update_success: "Taux de change mis à jour pour aujourd'hui !",
      rates_update_error: 'Erreur : ',
      mock_reset_success: 'Données de test locales réinitialisées !',
      admin_none: 'Aucune caisse à administrer.',
      currency_label: 'Devise',
      type_label: 'Type',
      adjust_button: 'Ajuster',
      adjust_done: 'Fait !',
      adjust_error_prefix: "Erreur d'ajustement : ",
      logout_error_prefix: "Erreur lors de la déconnexion : "
    },
    currency: {
      UGX: 'Shilling Ougandais (UGX / 1 USD)',
      KES: 'Shilling Kenyan (KES / 1 USD)',
      CDF: 'Franc Congolais (CDF / 1 USD)',
      TZS: 'Shilling Tanzanien (TZS / 1 USD)',
      BIF: 'Franc Burundais (BIF / 1 USD)',
      EUR: 'Euro (EUR / 1 USD)',
      FCFA: 'Franc CFA (FCFA / 1 USD)'
    },
    wallet: {
      type: {
        cash: 'Cash',
        mmoney: 'M-Money'
      }
    },
    common: {
      yes: 'Oui',
      no: 'Non',
      confirm_delete: 'Supprimer ce brouillon ? Cette action est irréversible.'
    }
  },
  en: {
    app: { subtitle: 'Forex Management', title: 'OpaysFox', demo: 'Demo' },
    nav: { dashboard: 'Dashboard', transactions: 'Transactions', wallets: 'Wallets', expenses: 'Expenses', loans: 'Loans', settings: 'Settings' },
    loading: { data: 'Loading data...', init_title: 'Initializing...', session_check: 'Checking session', skeleton: 'Loading…', page: 'Loading page…' },
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
      ,categories: {
        business: ['Rent - Kiosk', 'Cash Transport', 'Withdrawal Fees', 'Airtel Commission', 'MTN Commission', 'Internet/Plan', 'Agent Salary', 'Other Business'],
        personal: ['Family', 'Food', 'Personal Transport', 'House Rent', 'Health', 'Schooling', 'Entertainment', 'Other Personal']
      },
      required_fields: 'Please fill required fields.',
      created_success: 'Expense saved and wallet balance deducted!',
      wallet_unknown: 'Unknown wallet',
      recent_title: 'Recent Expenses',
      amount_placeholder: 'Ex: 5000',
      note_placeholder: 'Ex: Kampala center transport, Bread purchase...',
      pro_label: 'BUS',
      personal_label: 'PERS'
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
      create_success: 'Loan created successfully! Wallet balance debited.',
      required_fields: 'Please fill required fields.',
      mark_paid_success: 'Loan marked as paid! Wallet credited.',
      client_name_required: 'Customer name is required.',
      client_created_success: 'Customer created successfully.',
      client_unknown: 'Unknown customer',
      no_txn_related: 'No related transactions.',
      status: {
        overdue: 'Overdue',
        pending: 'Pending',
        paid: 'Paid'
      }
    },
    settings: {
      preferences: 'Display Preferences',
      language_label: 'Application language',
      lang_note: 'Selected language will apply across the app.',
      rates_title: 'Daily Exchange Rates (Base USD)',
      rates_desc: 'How many units of this currency equal 1 USD? Used to calculate global net worth.',
      admin_title: 'Stock & Cashbox Administration',
      admin_desc: 'Directly adjust wallet balances (used to correct physical inventory errors).',
      danger_title: 'Danger Zone',
      danger_desc: 'Reset all local demo data and start fresh.',
      reset_mock_button: 'Reset Demo Data',
      reset_mock_confirm: 'Reset all local demo data?',
      user_session: 'User Session',
      connected_as: 'Connected as:',
      logout_button: 'Sign Out',
      save_rates: 'Save Rates',
      rates_update_success: 'Exchange rates updated for today!',
      rates_update_error: 'Error: ',
      mock_reset_success: 'Local demo data reset!',
      admin_none: 'No cashboxes to administer.',
      currency_label: 'Currency',
      type_label: 'Type',
      adjust_button: 'Adjust',
      adjust_done: 'Done!',
      adjust_error_prefix: 'Adjustment error: ',
      logout_error_prefix: 'Logout error: '
    },
    currency: {
      UGX: 'Ugandan Shilling (UGX / 1 USD)',
      KES: 'Kenyan Shilling (KES / 1 USD)',
      CDF: 'Congolese Franc (CDF / 1 USD)',
      TZS: 'Tanzanian Shilling (TZS / 1 USD)',
      BIF: 'Burundian Franc (BIF / 1 USD)',
      EUR: 'Euro (EUR / 1 USD)',
      FCFA: 'CFA Franc (FCFA / 1 USD)'
    },
    wallet: {
      type: {
        cash: 'Cash',
        mmoney: 'M-Money'
      }
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
