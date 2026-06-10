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
      ,loan_not_found: 'Prêt introuvable',
      none: 'Aucun prêt',
      create_first: 'Créez votre premier prêt en appuyant sur "Nouveau Prêt".',
      add_client: 'Ajouter un client',
      save_client: 'Enregistrer Client'
    },
    transactions: {
      supabase_not_configured: 'Supabase non configuré',
      gemini_error: 'Erreur Gemini proxy',
      ai_parsing: "L'IA analyse le fichier...",
      ai_parse_success: 'Reçu analysé par l\'IA avec succès.',
      client_auto_created: 'Nouveau client "{name}" créé automatiquement à partir du reçu.',
      required_exchange: 'Veuillez remplir tous les champs requis pour un échange.',
      required_deposit: 'Veuillez renseigner le portefeuille à créditer et le montant.',
      required_withdrawal: 'Veuillez renseigner le portefeuille à débiter et le montant.',
      same_wallet_error: 'Le portefeuille de départ doit être différent de celui d\'arrivée.',
      draft_validated: 'Brouillon validé avec succès et soldes mis à jour !',
      transaction_saved: 'Transaction enregistrée et soldes mis à jour !',
      voice_button: 'Saisie Vocale',
      voice_stop: 'Fin écoute',
      take_photo: 'Prendre Photo',
      choose_file: 'Choisir Fichier',
      new_operation: 'Nouvelle Opération',
      validate_draft: 'Validation Brouillon',
      exchange_label: 'Échange Forex',
      deposit_label: 'Renforcement (+)',
      withdrawal_label: 'Prélèvement (-)',
      payment_note_placeholder: 'Nom du client, WhatsApp...',
      receipt_ai_simulated: 'Simulé : Reçu analysé (configuration Supabase absente).',
      receipt_ai_success: 'Reçu analysé par l\'IA Gemini avec succès ! Complétez les champs manquants.'
    },
    wallets: {
      page_title: 'Gestion des Caisses',
      page_desc: 'Ajouter de nouvelles caisses et piloter les mouvements de fonds.',
      capital_movement: 'Mouvement de Capital',
      new_wallet: 'Nouvelle Caisse',
      create_wallet_title: 'Créer une Nouvelle Caisse',
      create_wallet_button: 'Créer la caisse',
      type_label: 'Type',
      currency_label: 'Devise',
      initial_balance: 'Solde Initial',
      create_success: 'Caisse "{name}" créée avec succès !',
      update_success: 'Portefeuille mis à jour !',
      delete_confirm: 'Voulez-vous vraiment supprimer la caisse "{name}" ?',
      delete_success: 'Caisse supprimée avec succès.',
      delete_error_prefix: 'Impossible de supprimer. ',
      movement_inject: 'Injecter / Renforcer',
      movement_withdraw: 'Prélèvement',
      select_wallet: 'Sélectionner la Caisse',
      amount_placeholder: 'Ex: 5000',
      note_placeholder: 'Ex: Apport capital cash USD, Retrait dividendes...',
      validate_movement: 'Valider le Mouvement',
      wallet_none: 'Aucune caisse enregistrée',
      create_first_wallet: 'Créer votre premier portefeuille',
      wallet_type_cash: 'Espèces',
      wallet_type_mmoney: 'Mobile Money',
      wallet_active_label: 'Caisse Active (visible pour les transactions)'
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
      save: 'Enregistrer',
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
      ,loan_not_found: 'Loan not found',
      none: 'No loans',
      create_first: 'Create your first loan by clicking "New Loan" above.',
      add_client: 'Add client',
      save_client: 'Save client'
    },
    transactions: {
      supabase_not_configured: 'Supabase not configured',
      gemini_error: 'Gemini proxy error',
      ai_parsing: 'AI is analysing the file...',
      ai_parse_success: 'Receipt analysed by AI successfully.',
      client_auto_created: 'New customer "{name}" automatically created from receipt.',
      required_exchange: 'Please fill required fields for an exchange.',
      required_deposit: 'Please provide the wallet to credit and the amount.',
      required_withdrawal: 'Please provide the wallet to debit and the amount.',
      same_wallet_error: 'Source wallet must be different from destination wallet.',
      draft_validated: 'Draft validated successfully and balances updated!',
      transaction_saved: 'Transaction saved and balances updated!',
      voice_button: 'Voice Input',
      voice_stop: 'Stop Listening',
      take_photo: 'Take Photo',
      choose_file: 'Choose File',
      new_operation: 'New Operation',
      validate_draft: 'Validate Draft',
      exchange_label: 'Forex Exchange',
      deposit_label: 'Top-up (+)',
      withdrawal_label: 'Withdrawal (-)',
      payment_note_placeholder: 'Customer name, WhatsApp...',
      receipt_ai_simulated: 'Simulated: Receipt analysed (Supabase missing).',
      receipt_ai_success: 'Receipt analysed by Gemini AI successfully! Complete missing fields.'
    },
    wallets: {
      page_title: 'Wallet Management',
      page_desc: 'Add new wallets and manage capital movements.',
      capital_movement: 'Capital Movement',
      new_wallet: 'New Wallet',
      create_wallet_title: 'Create a New Wallet',
      create_wallet_button: 'Create Wallet',
      type_label: 'Type',
      currency_label: 'Currency',
      initial_balance: 'Initial Balance',
      create_success: 'Wallet "{name}" created successfully!',
      update_success: 'Wallet updated!',
      delete_confirm: 'Are you sure you want to delete wallet "{name}"?',
      delete_success: 'Wallet deleted successfully.',
      delete_error_prefix: 'Unable to delete. ',
      movement_inject: 'Inject / Top-up',
      movement_withdraw: 'Withdrawal',
      select_wallet: 'Select Wallet',
      amount_placeholder: 'Ex: 5000',
      note_placeholder: 'Ex: Cash USD capital injection, Dividend withdrawal...',
      validate_movement: 'Validate Movement',
      wallet_none: 'No wallets registered',
      create_first_wallet: 'Create your first wallet',
      wallet_type_cash: 'Cash',
      wallet_type_mmoney: 'Mobile Money',
      wallet_active_label: 'Active Wallet (visible for transactions)'
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
    common: { yes: 'Yes', no: 'No', save: 'Save', confirm_delete: 'Delete this draft? This action is irreversible.' }
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
