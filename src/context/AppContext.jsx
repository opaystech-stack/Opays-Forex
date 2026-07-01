import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import translations from '../i18n';
import { supabase } from '../services/supabase';
import { getDataBackend, apiProvider, SESSION_UNKNOWN } from '../services/dataProvider';
import {
  calculateLoanRepaymentUSD,
  convertToUSD,
  applyBalances,
  computeExchangeRate,
  computeProfitUSD,
  computeOperationAmounts,
} from '../utils/finance';
// --- agency-operations-expansion : logique pure réutilisée (étend, ne duplique pas) ---
import {
  effectivePermissions as computeEffectivePermissions,
  isAuthorized,
  isValidRole,
  isValidInvitationEmail,
  isDuplicateInvitationEmail,
  isInvitationExpired,
  PERMISSIONS,
} from '../utils/authorization';
import {
  isModuleEnabled as computeModuleEnabled,
  isModuleActivatable as computeModuleActivatable,
  defaultModuleState,
  ADDITIONAL_MODULES,
} from '../utils/moduleEntitlements';
import {
  assignAgencyId,
  isValidAgencyId,
  countAgenciesByState,
  AGENCY_STATES,
} from '../utils/agencyStats';
import { validateTransfer } from '../utils/transferValidation';
import { validateSubscription } from '../utils/subscriptionValidation';
import { validateFlightBooking, computeFlightProfit } from '../utils/flightBooking';
import { DEFAULT_PROVIDERS, TRANSFER_METHOD_OTHER } from '../utils/catalogs';
import { generateOrderToken } from '../utils/orderToken';
import { computeDebtTotals } from '../utils/debts';

// --- auth-access-mobile-fixes (Z2) ------------------------------------------
// URL du script Google Identity Services (GIS) préchargé sur les pages d'auth.
const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const GIS_SCRIPT_ID = 'gsi-client-script';
const GOOGLE_CLIENT_ID =
  '234409145334-fdvn7490d4avgf4ud437abmps192j2cd.apps.googleusercontent.com';
// Délai de sécurité anti-blocage : si aucun `callback` GIS n'arrive (pop-up
// bloquée), `signInWithGoogle()` se résout avec une erreur explicite au lieu de
// rester en chargement infini. Configurable via `VITE_GOOGLE_AUTH_TIMEOUT_MS`.
//
// Bug C : 15 s s'avéraient trop courts en production pour un utilisateur qui
// doit choisir un compte Google parmi plusieurs, valider un nouveau compte, ou
// subit une connexion lente : la garde se déclenchait prématurément ("La fenêtre
// Google ne s'est pas ouverte") alors que la pop-up s'ouvrait correctement.
// On monte à 60 s en production. En environnement de test, on reste court
// (500 ms) pour que la Promise se résolve dans la fenêtre de race des tests.
const GOOGLE_AUTH_TIMEOUT_MS = (() => {
  const raw = Number(import.meta.env?.VITE_GOOGLE_AUTH_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return typeof process !== 'undefined' && (process.env?.NODE_ENV === 'test' || process.env?.VITEST) ? 500 : 60000;
})();

// Helpers de repli mock localStorage (mode démo / sans Supabase). Définis au
// niveau module afin d'être accessibles depuis tous les handlers (createOrderLink,
// revokeOrderLink, ...) et pas seulement depuis l'effet de chargement initial.
const readMock = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};
const writeMock = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* no-op : quota / environnement sans localStorage */
  }
};
import {
  validateAmount,
  ensureDistinctWallets,
  detectDuplicate,
} from '../utils/txnValidation';
import { matchCustomer } from '../utils/customerMatching';
import {
  sortCustomerOperations,
  countCustomerOperations,
} from '../utils/customerHistory';
import {
  isAccessGranted,
  isAdmin as isProfileAdmin,
  isRlsDenied,
  LOAD_TIMEOUT_MS,
} from '../utils/accessControl';
import {
  validateProofSubmission,
  buildReceiptPath,
  buildProofRecord,
} from '../utils/paymentProof';

const AppContext = createContext();

// Mock initial data if Supabase is not configured
const MOCK_WALLETS = [
  { id: 'w1', name: 'Caisse USD Cash', currency: 'USD', type: 'cash', balance: 1200.00 },
  { id: 'w2', name: 'Caisse UGX Cash', currency: 'UGX', type: 'cash', balance: 3650000.00 },
  { id: 'w3', name: 'Airtel Money RDC (USD)', currency: 'USD', type: 'mobile_money', balance: 800.00 },
  { id: 'w4', name: 'M-Pesa Kenya (KES)', currency: 'KES', type: 'mobile_money', balance: 35000.00 },
  { id: 'w5', name: 'MTN Uganda (UGX)', currency: 'UGX', type: 'mobile_money', balance: 1500000.00 },
  { id: 'w6', name: 'Caisse Euro Cash', currency: 'EUR', type: 'cash', balance: 450.00 },
  { id: 'w7', name: 'Orange Money Cameroun (FCFA)', currency: 'FCFA', type: 'mobile_money', balance: 250000.00 },
];

const MOCK_RATES = [
  { currency: 'UGX', rate_to_usd: 3750.00 },
  { currency: 'KES', rate_to_usd: 130.00 },
  { currency: 'CDF', rate_to_usd: 2500.00 },
  { currency: 'TZS', rate_to_usd: 2600.00 },
  { currency: 'BIF', rate_to_usd: 2850.00 },
  { currency: 'RWF', rate_to_usd: 1300.00 },
  { currency: 'EUR', rate_to_usd: 0.92 },
  { currency: 'FCFA', rate_to_usd: 600.00 },
];

const MOCK_CUSTOMERS = [
  { id: 'c1', name: 'Jean Kabamba', phone: '+243999988271', created_at: new Date().toISOString() },
  { id: 'c2', name: 'Mama Sarah', phone: '+256788291039', created_at: new Date().toISOString() },
  { id: 'c3', name: 'Joseph Mwamba', phone: '+254711223344', created_at: new Date().toISOString() }
];

const MOCK_LOANS = [
  {
    id: 'l1',
    customer_id: 'c1',
    wallet_id: 'w1',
    amount: 500.00,
    currency: 'USD',
    interest_rate: 10.00,
    due_date: new Date(Date.now() + 3600000 * 24 * 7).toISOString().split('T')[0],
    status: 'pending',
    note: 'Prêt pour fonds de roulement magasin',
    contract_image_url: null,
    created_at: new Date(Date.now() - 3600000 * 24 * 2).toISOString()
  },
  {
    id: 'l2',
    customer_id: 'c2',
    wallet_id: 'w2',
    amount: 1000000.00,
    currency: 'UGX',
    interest_rate: 0.00,
    due_date: new Date(Date.now() - 3600000 * 24).toISOString().split('T')[0],
    status: 'pending',
    note: 'Urgence familiale',
    contract_image_url: null,
    created_at: new Date(Date.now() - 3600000 * 24 * 5).toISOString()
  }
];

const MOCK_TRANSACTIONS = [
  {
    id: 't1',
    source_wallet_id: 'w1',
    dest_wallet_id: 'w2',
    source_amount: 100.00,
    dest_amount: 365000,
    exchange_rate: 3650,
    fee: 0.00,
    profit_usd: 2.67,
    status: 'completed',
    transaction_id: 'TXN-A1293041',
    note: 'Client WhatsApp - Paul',
    timestamp: new Date(Date.now() - 3600000 * 2).toISOString()
  },
  {
    id: 't2',
    source_wallet_id: 'w3',
    dest_wallet_id: 'w5',
    source_amount: 150.00,
    dest_amount: 550000,
    exchange_rate: 3666.67,
    fee: 3.00,
    fee_wallet_id: 'w3',
    profit_usd: 0.33,
    status: 'completed',
    transaction_id: 'TXN-M9847291',
    note: 'Transfert Kinshasa - Kampala',
    timestamp: new Date(Date.now() - 3600000 * 24).toISOString()
  },
  {
    id: 't_draft_1',
    source_wallet_id: 'w1',
    dest_wallet_id: 'w4',
    source_amount: 50.00,
    dest_amount: 6400,
    exchange_rate: 128,
    fee: 1.00,
    fee_wallet_id: 'w1',
    profit_usd: 0.77,
    status: 'draft',
    transaction_id: 'MPESA-KE-7729103',
    receipt_text: 'M-PESA Confirmed. Ksh6,400 sent to...',
    note: '📱 Importé via WhatsApp - Client Joseph',
    timestamp: new Date(Date.now() - 3600000 * 1).toISOString()
  }
];

const MOCK_EXPENSES = [
  { id: 'e1', wallet_id: 'w2', amount: 15000.00, is_business: true, category: 'Transport', note: 'Transport Cash Goma', timestamp: new Date(Date.now() - 3600000 * 5).toISOString() },
  { id: 'e2', wallet_id: 'w1', amount: 20.00, is_business: false, category: 'Famille', note: 'Repas midi et crédit tel', timestamp: new Date(Date.now() - 3600000 * 12).toISOString() },
];

const MOCK_DEBTS = [
  { id: 'd1', type: 'receivable', counterparty_name: 'Jean Kabamba', amount: 200.00, currency: 'USD', note: 'Avance échange', status: 'pending', created_at: new Date(Date.now() - 3600000 * 24).toISOString(), settled_at: null },
  { id: 'd2', type: 'payable', counterparty_name: 'Fournisseur Goma', amount: 150000.00, currency: 'CDF', note: 'Stock à régler', status: 'pending', created_at: new Date(Date.now() - 3600000 * 48).toISOString(), settled_at: null },
];

const MOCK_TEMPLATES = [
  {
    id: 'tpl1',
    name: 'Rappel de créance',
    lang: 'fr',
    scenario: 'recovery',
    body: 'Bonjour {{customer_name}}, nous vous rappelons votre solde de {{amount_due}} {{currency}} dû le {{due_date}}. Merci de régulariser au plus vite.',
    created_at: new Date(Date.now() - 3600000 * 24 * 3).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 24 * 3).toISOString(),
  },
  {
    id: 'tpl2',
    name: 'Announcement (taux du jour)',
    lang: 'en',
    scenario: 'announcement',
    body: 'Hello {{customer_name}}, our exchange rates have been updated today. Contact us for the best deal.',
    created_at: new Date(Date.now() - 3600000 * 24 * 2).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 24 * 2).toISOString(),
  },
];

// Historique des relances (Historique_Relance) - données de démonstration.
// Champs alignés sur la table `reminder_history` (cf. design.md / db_schema).
const MOCK_REMINDERS = [
  {
    id: 'rem1',
    customer_id: 'c1',
    loan_id: 'l1',
    template_id: 'tpl1',
    scenario: 'recovery',
    content: 'Bonjour Jean Kabamba, nous vous rappelons votre solde de 500 USD dû prochainement. Merci de régulariser au plus vite.',
    trigger_source: 'manual',
    status: 'sent',
    provider_message_id: 'wamid.DEMO0001',
    error_reason: null,
    created_at: new Date(Date.now() - 3600000 * 6).toISOString(),
  },
];

// ==========================================================================
// agency-operations-expansion : données de démonstration (mode démo préservé)
// --------------------------------------------------------------------------
// Ces jeux de données alimentent le repli mock localStorage des nouvelles
// entités multi-agences (agence courante, modules, services additionnels,
// employés, invitations, catalogues). Ils n'altèrent en rien les données de
// trésorerie existantes ci-dessus.
// ==========================================================================

// Identifiant d'agence de démonstration (clé de cloisonnement, Req 3.2).
const MOCK_AGENCY_ID = 'agency-demo';

// Agence par défaut implicite du mode démo (Etat_Agence = active, Req 5).
const MOCK_AGENCY = {
  id: MOCK_AGENCY_ID,
  owner_id: 'demo-user',
  name: 'Agence par défaut',
  state: 'active',
  plan_id: 'plan-default',
  created_at: new Date(Date.now() - 3600000 * 24 * 30).toISOString(),
};

// Droits_Module accordés au niveau plateforme (Req 4.3). En démo, les trois
// Modules_Additionnels sont habilités afin de permettre l'exploration complète.
const MOCK_MODULE_ENTITLEMENTS = {
  transfert_argent: true,
  abonnements: true,
  billets_avion: true,
};

// États d'activation des Modules_Fonctionnels de l'agence démo (Req 6.6, 6.8).
// On part de l'état par défaut (Modules_Base activés) puis on active les modules
// optionnels et additionnels habilités pour une démonstration riche.
const MOCK_MODULE_STATES = {
  ...defaultModuleState(),
  taux_service: true,
  publication_whatsapp: true,
  commande_distance: true,
  transfert_argent: true,
  abonnements: true,
  billets_avion: true,
};

// Catalogue_Methodes_Transfert par défaut ('Autre' permanent — Req 9.1, 9.7).
const MOCK_TRANSFER_METHODS = [
  { id: 'tm_airtel', agency_id: null, label: 'Airtel Money', is_active: true, is_permanent: false },
  { id: 'tm_mpesa', agency_id: null, label: 'M-Pesa', is_active: true, is_permanent: false },
  { id: 'tm_western', agency_id: null, label: 'Western Union', is_active: true, is_permanent: false },
  { id: 'tm_other', agency_id: null, label: TRANSFER_METHOD_OTHER, is_active: true, is_permanent: true },
];

// Catalogue_Fournisseurs_Abonnement par défaut (Req 11.1).
const MOCK_SUBSCRIPTION_PROVIDERS = DEFAULT_PROVIDERS.map((label, index) => ({
  id: `sp_${index}`,
  agency_id: null,
  label,
  is_active: true,
}));

const MOCK_TRANSFERS = [];
const MOCK_SUBSCRIPTIONS = [];
const MOCK_FLIGHT_BOOKINGS = [];
const MOCK_REMOTE_ORDERS = [];
const MOCK_ORDER_LINKS = [];

// Comptes_Employés de l'agence démo : l'utilisateur démo est Propriétaire_Agence
// (toutes les permissions via le rôle — Req 2.2).
const MOCK_EMPLOYEES = [
  {
    id: 'mem-demo',
    agency_id: MOCK_AGENCY_ID,
    user_id: 'demo-user',
    email: 'demo@opays.com',
    role: 'proprietaire',
    activation_state: 'actif',
    permission_grants: [],
    permission_denies: [],
    created_at: new Date(Date.now() - 3600000 * 24 * 30).toISOString(),
  },
];

const MOCK_INVITATIONS = [];

export const AppProvider = ({ children }) => {
  // Language (global) - persisted in localStorage
  const [language, setLanguage] = useState(() => {
    try {
      return localStorage.getItem('forex_lang') || 'fr';
    } catch {
      return 'fr';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('forex_lang', language);
    } catch {
      // ignore
    }
  }, [language]);
  const [wallets, setWallets] = useState([]);
  const [rates, setRates] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loans, setLoans] = useState([]);
  const [debts, setDebts] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [reminderHistory, setReminderHistory] = useState([]);
  // --- agency-operations-expansion : état multi-agences (additif) ---
  const [currentAgency, setCurrentAgency] = useState(null);
  const [moduleStates, setModuleStates] = useState({});
  const [moduleEntitlements, setModuleEntitlements] = useState({});
  // Supervision plateforme (Editeur_Plateforme) : liste de toutes les Agences
  // visibles (Req 5.1) et Droits_Module par Agence { [agency_id]: { module_key:
  // granted } } pour l'Espace_Administration_Plateforme (Req 4.2). En mono-agence
  // (V1) cette liste se réduit à l'agence courante.
  const [platformAgencies, setPlatformAgencies] = useState([]);
  const [platformModuleEntitlements, setPlatformModuleEntitlements] = useState({});
  const [transfers, setTransfers] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [flightBookings, setFlightBookings] = useState([]);
  const [remoteOrders, setRemoteOrders] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [transferMethods, setTransferMethods] = useState([]);
  const [subscriptionProviders, setSubscriptionProviders] = useState([]);
  const [orderLinks, setOrderLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [isUsingMock, setIsUsingMock] = useState(false);
  const [user, setUser] = useState(null);

  // Profil_Accès (contrôle d'accès par activation manuelle) — voir
  // spec paid-access-control. Le gating React s'appuie sur ces deux états ;
  // l'autorité finale reste la RLS côté base.
  //   profileStatus ∈ 'loading' | 'ready' | 'error'  (toute incertitude ⇒ refus)
  const [profilAcces, setProfilAcces] = useState(null);
  const [profileStatus, setProfileStatus] = useState('loading');

  // Message de restriction d'accès remonté lorsqu'une opération de lecture ou
  // d'écriture de données de trésorerie est refusée par la RLS (Exigence 2.8).
  // `null` quand aucune restriction n'est active. Exposé via le contexte pour
  // que l'UI puisse afficher le message sans altérer les données locales.
  const [accessError, setAccessError] = useState(null);

  // Check if Supabase credentials are valid
  const hasCredentials = 
    import.meta.env.VITE_SUPABASE_URL && 
    import.meta.env.VITE_SUPABASE_ANON_KEY &&
    supabase !== null;

  // Backend de données sélectionné (Lot L0). Stable pour la durée de vie du
  // provider. Défaut rétro-compatible : 'supabase' si clés présentes, sinon
  // 'mock'. 'api' route vers le backend Fastify (cookie JWT httpOnly).
  const dataBackend = getDataBackend();
  const isApiBackend = dataBackend === 'api';

  // --- auth-access-mobile-fixes (Z2) ----------------------------------------
  // Préchargement de Google Identity Services au montage (chemin API). Charger
  // le script en amont permet, au clic, d'invoquer `requestAccessToken()` de
  // façon SYNCHRONE dans le geste utilisateur (sans `await` préalable), ce qui
  // évite que la pop-up soit bloquée par les navigateurs mobiles.
  useEffect(() => {
    if (!isApiBackend) return;
    if (typeof document === 'undefined') return;
    if (window.google?.accounts?.oauth2) return;
    if (document.getElementById(GIS_SCRIPT_ID)) return;
    const script = document.createElement('script');
    script.id = GIS_SCRIPT_ID;
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  }, [isApiBackend]);

  const getAppBaseUrl = useCallback(() => {
    const candidates = [
      import.meta.env.VITE_APP_URL,
      import.meta.env.VITE_PUBLIC_SITE_URL,
      import.meta.env.VITE_SITE_URL,
      import.meta.env.VITE_DOMAIN,
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;

      const normalized = candidate.trim().replace(/\/+$/, '');
      if (/^https?:\/\//i.test(normalized)) {
        return normalized;
      }

      return `https://${normalized}`;
    }

    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin;
    }

    return 'https://fox.opays.io';
  }, []);

  // Message localisé de restriction d'accès (Exigence 2.8). Repli sur le
  // français puis sur une chaîne par défaut si la clé est absente.
  const getAccessRestrictionMessage = useCallback(() => {
    const dict = translations[language] || translations.fr || {};
    return (
      dict.access?.data_restricted ||
      translations.fr?.access?.data_restricted ||
      "Accès aux données refusé : aucune donnée n'a été modifiée."
    );
  }, [language]);

  // Interprète un refus RLS imposé par la base lors d'une opération de
  // trésorerie (Exigences 2.6, 2.7, 2.8). En cas de refus :
  //   - affiche le message de restriction d'accès (`accessError`) ;
  //   - déclenche la garde d'accès en plaçant `profileStatus = 'error'`, ce qui
  //     bascule l'application vers la Page_Acces_Restreint si l'accès a été
  //     révoqué (R2.6) ;
  //   - NE modifie AUCUNE donnée de trésorerie locale (R2.8).
  // Pour toute autre erreur, retourne null afin que l'appelant conserve son
  // comportement existant (distinction refus RLS / erreur de connectivité).
  const handleRlsDenial = useCallback((error, context = '') => {
    if (!isRlsDenied(error)) {
      return null;
    }
    const message = getAccessRestrictionMessage();
    console.warn(
      `Refus RLS détecté${context ? ` (${context})` : ''} :`,
      error?.message || error,
    );
    setAccessError(message);
    // Accès révoqué / refusé côté base ⇒ bascule vers Page_Acces_Restreint.
    setProfileStatus('error');
    return { success: false, error: message, accessDenied: true };
  }, [getAccessRestrictionMessage]);

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) {
      setLoading(true);
    }

    // --- Backend API Fastify (Lot L1/L3) : chargement via apiProvider --------
    // L'isolation par agence est appliquée côté serveur (cookie JWT) ; le
    // client ne transmet jamais d'agency_id.
    if (isApiBackend) {
      if (!authChecked) return;
      if (!user || user?.isDemo) { setLoading(false); return; }
      try {
        const [wl, tx] = await Promise.all([
          apiProvider.wallets.list(),
          apiProvider.transactions.list({ limit: 200 }),
        ]);
        setWallets(wl);
        setTransactions(tx);
        // Lectures secondaires tolérantes (chaque entité isolée pour ne pas
        // casser le chargement global si une table est absente).
        try { setRates(await apiProvider.rates.list()); } catch (e) { console.warn('API rates indisponibles:', e?.message); }
        try { setCustomers(await apiProvider.customers.list()); } catch (e) { console.warn('API customers indisponibles:', e?.message); }
        try { setExpenses(await apiProvider.expenses.list()); } catch (e) { console.warn('API expenses indisponibles:', e?.message); }
        try { setLoans(await apiProvider.loans.list()); } catch (e) { console.warn('API loans indisponibles:', e?.message); }
        try { setDebts(await apiProvider.debts.list()); } catch (e) { console.warn('API debts indisponibles:', e?.message); }
        try { setTemplates(await apiProvider.templates.list()); } catch (e) { console.warn('API templates indisponibles:', e?.message); }
        try { setReminderHistory(await apiProvider.reminders.list()); } catch (e) { console.warn('API reminders indisponibles:', e?.message); }
        try { setModuleStates(await apiProvider.modules.states()); } catch (e) { console.warn('API module states indisponibles:', e?.message); }
        try { setModuleEntitlements(await apiProvider.modules.entitlements()); } catch (e) { console.warn('API module entitlements indisponibles:', e?.message); }
        try { setFlightBookings(await apiProvider.flightBookings.list()); } catch (e) { console.warn('API flight bookings indisponibles:', e?.message); }
        try { setOrderLinks(await apiProvider.orderLinks.list()); } catch (e) { console.warn('API order links indisponibles:', e?.message); }
        try { setTransferMethods(await apiProvider.transferMethods.list()); } catch (e) { console.warn('API transfer methods indisponibles:', e?.message); }
        try { setSubscriptionProviders(await apiProvider.subscriptionProviders.list()); } catch (e) { console.warn('API subscription providers indisponibles:', e?.message); }
        try { setInvitations(await apiProvider.invitations.list()); } catch (e) { console.warn('API invitations indisponibles:', e?.message); }
        try { setEmployees(await apiProvider.members.list()); } catch (e) { console.warn('API members indisponibles:', e?.message); }
        // Contexte agence (Lot multi-agences) : indispensable pour deriver le
        // role Proprietaire_Agence, les permissions et l'etat de l'agence. Sans
        // cela, currentAgency restait null en mode API ("Aucune agence active")
        // et le menu se reduisait aux seuls items toujours visibles.
        try {
          const mineAgency = await apiProvider.agencies.mine();
          if (mineAgency) setCurrentAgency(mineAgency);
        } catch (e) { console.warn('API agence courante indisponible:', e?.message); }
        try {
          const myAgencies = await apiProvider.agencies.myList();
          if (Array.isArray(myAgencies) && myAgencies.length) setPlatformAgencies(myAgencies);
        } catch (e) { console.warn('API liste agences indisponible:', e?.message); }
        setIsUsingMock(false);
        setAccessError(null);
      } catch (err) {
        const denied = handleRlsDenial(err, 'fetchData:api');
        if (denied) { setLoading(false); return; }
        console.error('Erreur API Fastify (fetchData):', err);
      } finally {
        setLoading(false);
      }
      return;
    }

    // If session check hasn't finished, wait
    if (hasCredentials && !authChecked) {
      return;
    }

    if (!hasCredentials || user?.isDemo) {
      console.log('Supabase credentials not found or Demo Mode active. Using Mock Data.');
      // Load mock from localStorage or defaults
      const localWallets = localStorage.getItem('forex_wallets');
      const localRates = localStorage.getItem('forex_rates');
      const localTxns = localStorage.getItem('forex_txns');
      const localExp = localStorage.getItem('forex_expenses');
      const localCust = localStorage.getItem('forex_customers');
      const localLoans = localStorage.getItem('forex_loans');
      const localDebts = localStorage.getItem('forex_debts');
      const localTemplates = localStorage.getItem('forex_templates');
      const localReminders = localStorage.getItem('forex_reminders');

      setWallets(localWallets ? JSON.parse(localWallets) : MOCK_WALLETS);
      setRates(localRates ? JSON.parse(localRates) : MOCK_RATES);
      setTransactions(localTxns ? JSON.parse(localTxns) : MOCK_TRANSACTIONS);
      setExpenses(localExp ? JSON.parse(localExp) : MOCK_EXPENSES);
      setCustomers(localCust ? JSON.parse(localCust) : MOCK_CUSTOMERS);
      setLoans(localLoans ? JSON.parse(localLoans) : MOCK_LOANS);
      setDebts(localDebts ? JSON.parse(localDebts) : MOCK_DEBTS);
      setTemplates(localTemplates ? JSON.parse(localTemplates) : MOCK_TEMPLATES);
      setReminderHistory(localReminders ? JSON.parse(localReminders) : MOCK_REMINDERS);
      // --- agency-operations-expansion : repli mock localStorage (mode démo) ---
      // (readMock/writeMock définis au niveau module)
      setCurrentAgency(readMock('forex_agency', MOCK_AGENCY));
      setModuleEntitlements(readMock('forex_module_entitlements', MOCK_MODULE_ENTITLEMENTS));
      {
        const agencyMock = readMock('forex_agency', MOCK_AGENCY);
        const entMock = readMock('forex_module_entitlements', MOCK_MODULE_ENTITLEMENTS);
        setPlatformAgencies([agencyMock]);
        setPlatformModuleEntitlements({ [agencyMock.id]: entMock });
      }
      setModuleStates(readMock('forex_module_states', MOCK_MODULE_STATES));
      setTransferMethods(readMock('forex_transfer_methods', MOCK_TRANSFER_METHODS));
      setSubscriptionProviders(readMock('forex_subscription_providers', MOCK_SUBSCRIPTION_PROVIDERS));
      setTransfers(readMock('forex_transfers', MOCK_TRANSFERS));
      setSubscriptions(readMock('forex_subscriptions', MOCK_SUBSCRIPTIONS));
      setFlightBookings(readMock('forex_flight_bookings', MOCK_FLIGHT_BOOKINGS));
      setRemoteOrders(readMock('forex_remote_orders', MOCK_REMOTE_ORDERS));
      setOrderLinks(readMock('forex_order_links', MOCK_ORDER_LINKS));
      setEmployees(readMock('forex_employees', MOCK_EMPLOYEES));
      setInvitations(readMock('forex_invitations', MOCK_INVITATIONS));
      setIsUsingMock(true);
      setLoading(false);
      return;
    }

    if (!user) {
      setLoading(false);
      return;
    }

    try {
      // Fetch from Supabase
      const [wRes, rRes, tRes, eRes, cRes, lRes] = await Promise.all([
        supabase.from('wallets').select('*').order('name'),
        supabase.from('exchange_rates').select('*').order('date', { ascending: false }),
        supabase.from('transactions').select('*').order('timestamp', { ascending: false }),
        supabase.from('expenses').select('*').order('timestamp', { ascending: false }),
        supabase.from('customers').select('*').order('name'),
        supabase.from('loans').select('*').order('created_at', { ascending: false })
      ]);

      if (wRes.error) throw wRes.error;
      // Détection d'un refus RLS sur l'une des requêtes de trésorerie
      // (Exigences 2.6, 2.7, 2.8) : on NE bascule PAS vers les données mock et
      // on NE modifie AUCUNE donnée de trésorerie locale.
      const rlsError = [wRes, rRes, tRes, eRes, cRes, lRes]
        .map((r) => r?.error)
        .find((e) => isRlsDenied(e));
      if (rlsError) {
        handleRlsDenial(rlsError, 'fetchData');
        setLoading(false);
        return;
      }
      setWallets(wRes.data || []);
      setRates(rRes.data || []);
      setTransactions(tRes.data || []);
      setExpenses(eRes.data || []);
      setCustomers(cRes.data || []);
      setLoans(lRes.data || []);
      // Les dettes sont chargées séparément pour rester compatibles si la table
      // n'existe pas encore (déploiement progressif du schéma).
      try {
        const dRes = await supabase.from('debts').select('*').order('created_at', { ascending: false });
        if (!dRes.error) setDebts(dRes.data || []);
      } catch (debtErr) {
        console.warn('Table debts indisponible, dettes ignorées:', debtErr?.message);
      }
      // Les modèles de message sont chargés séparément pour rester compatibles
      // si la table n'existe pas encore (déploiement progressif du schéma).
      try {
        const tplRes = await supabase.from('message_templates').select('*').order('created_at', { ascending: false });
        if (!tplRes.error) setTemplates(tplRes.data || []);
      } catch (tplErr) {
        console.warn('Table message_templates indisponible, modèles ignorés:', tplErr?.message);
      }
      // L'historique des relances est chargé séparément pour rester compatible
      // si la table n'existe pas encore (déploiement progressif du schéma).
      try {
        const remRes = await supabase.from('reminder_history').select('*').order('created_at', { ascending: false });
        if (!remRes.error) setReminderHistory(remRes.data || []);
      } catch (remErr) {
        console.warn('Table reminder_history indisponible, historique des relances ignoré:', remErr?.message);
      }
      // --- agency-operations-expansion : chargement de l'agence courante et des
      // entités multi-tenant. Chargé séparément (déploiement progressif du
      // schéma) : l'absence de ces tables ne doit pas casser le mode existant.
      // La RLS cloisonne déjà les lignes par agence ; les requêtes ci-dessous
      // n'exposent que les données accessibles à l'Utilisateur courant.
      try {
        const agencyRes = await supabase
          .from('agencies')
          .select('*')
          .order('created_at', { ascending: true });
        if (!agencyRes.error) {
          const agency = (agencyRes.data || [])[0] || null;
          setCurrentAgency(agency);
          // Supervision plateforme : la liste complète des Agences lisibles est
          // exposée à l'Espace_Administration_Plateforme (la RLS la restreint à
          // l'Editeur_Plateforme côté base — Req 5.1, 5.6).
          setPlatformAgencies(agencyRes.data || []);
          const aid = agency?.id;

          const [memRes, invRes, mStateRes, mEntRes, tmRes, spRes, trRes, subRes, fbRes, roRes, olRes] =
            await Promise.all([
              supabase.from('agency_members').select('*'),
              supabase.from('agency_invitations').select('*'),
              supabase.from('module_states').select('*'),
              supabase.from('module_entitlements').select('*'),
              supabase.from('transfer_methods').select('*'),
              supabase.from('subscription_providers').select('*'),
              supabase.from('transfers').select('*').order('created_at', { ascending: false }),
              supabase.from('subscriptions').select('*').order('created_at', { ascending: false }),
              supabase.from('flight_bookings').select('*').order('flight_at', { ascending: false }),
              supabase.from('remote_orders').select('*').order('created_at', { ascending: false }),
              supabase.from('order_links').select('*').order('created_at', { ascending: false }),
            ]);

          if (!memRes.error) setEmployees(memRes.data || []);
          if (!invRes.error) setInvitations(invRes.data || []);
          // Reconstruit les dictionnaires { module_key: enabled/granted } à partir
          // des lignes ; en l'absence d'état persisté, on retombe sur les défauts.
          if (!mStateRes.error) {
            const rows = (mStateRes.data || []).filter((r) => !aid || r.agency_id === aid);
            const map = rows.length
              ? rows.reduce((acc, r) => ({ ...acc, [r.module_key]: r.enabled === true }), {})
              : defaultModuleState();
            setModuleStates(map);
          }
          if (!mEntRes.error) {
            const rows = (mEntRes.data || []).filter((r) => !aid || r.agency_id === aid);
            const map = rows.reduce((acc, r) => ({ ...acc, [r.module_key]: r.granted === true }), {});
            setModuleEntitlements(map);
            // Droits_Module par Agence pour la supervision plateforme (Req 4.2, 5.1).
            const byAgency = (mEntRes.data || []).reduce((acc, r) => {
              const current = acc[r.agency_id] || {};
              return { ...acc, [r.agency_id]: { ...current, [r.module_key]: r.granted === true } };
            }, {});
            setPlatformModuleEntitlements(byAgency);
          }
          if (!tmRes.error) setTransferMethods(tmRes.data || []);
          if (!spRes.error) setSubscriptionProviders(spRes.data || []);
          if (!trRes.error) setTransfers(trRes.data || []);
          if (!subRes.error) setSubscriptions(subRes.data || []);
          if (!fbRes.error) setFlightBookings(fbRes.data || []);
          if (!roRes.error) setRemoteOrders(roRes.data || []);
          if (!olRes.error) setOrderLinks(olRes.data || []);
        }
      } catch (agErr) {
        console.warn('Données multi-agences indisponibles, contexte agence ignoré:', agErr?.message);
      }
      setIsUsingMock(false);
      // Lecture réussie : toute restriction d'accès antérieure est levée.
      setAccessError(null);
    } catch (error) {
      // Refus RLS (accès révoqué côté base) : surface la restriction d'accès,
      // ne bascule PAS vers les données mock et ne modifie AUCUNE donnée de
      // trésorerie locale (Exigences 2.6, 2.8).
      if (handleRlsDenial(error, 'fetchData')) {
        setLoading(false);
        return;
      }
      console.error('Error fetching Supabase data, falling back to local mock data:', error);
      setIsUsingMock(true);
      // Fallback
      setWallets(MOCK_WALLETS);
      setRates(MOCK_RATES);
      setTransactions(MOCK_TRANSACTIONS);
      setExpenses(MOCK_EXPENSES);
      setCustomers(MOCK_CUSTOMERS);
      setLoans(MOCK_LOANS);
      setDebts(MOCK_DEBTS);
      setTemplates(MOCK_TEMPLATES);
      setReminderHistory(MOCK_REMINDERS);
      // --- agency-operations-expansion : repli mock du contexte agence ---
      setCurrentAgency(MOCK_AGENCY);
      setModuleEntitlements(MOCK_MODULE_ENTITLEMENTS);
      setPlatformAgencies([MOCK_AGENCY]);
      setPlatformModuleEntitlements({ [MOCK_AGENCY.id]: MOCK_MODULE_ENTITLEMENTS });
      setModuleStates(MOCK_MODULE_STATES);
      setTransferMethods(MOCK_TRANSFER_METHODS);
      setSubscriptionProviders(MOCK_SUBSCRIPTION_PROVIDERS);
      setTransfers(MOCK_TRANSFERS);
      setSubscriptions(MOCK_SUBSCRIPTIONS);
      setFlightBookings(MOCK_FLIGHT_BOOKINGS);
      setRemoteOrders(MOCK_REMOTE_ORDERS);
      setOrderLinks(MOCK_ORDER_LINKS);
      setEmployees(MOCK_EMPLOYEES);
      setInvitations(MOCK_INVITATIONS);
    } finally {
      setLoading(false);
    }
  }, [hasCredentials, authChecked, user, handleRlsDenial, isApiBackend]);

  // Listen to Supabase Auth Changes
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    // --- Backend API Fastify : session restaurée depuis le cookie JWT -------
    if (isApiBackend) {
      let active = true;
      apiProvider.auth.getSession().then((sessionResult) => {
        if (!active) return;
        // Z1 — Ne JAMAIS déconnecter sur un aléa réseau transitoire. `getSession()`
        // renvoie `SESSION_UNKNOWN` quand l'état n'a pas pu être tranché (réseau) :
        // on conserve alors l'utilisateur courant. Un 401 confirmé renvoie `null`
        // (déconnexion), un succès renvoie l'utilisateur restauré.
        setUser((prev) => {
          if (prev?.isDemo) return prev;
          if (sessionResult === SESSION_UNKNOWN) return prev;
          return sessionResult;
        });
        setAuthChecked(true);
      });
      return () => { active = false; };
    }

    if (!supabase) {
      setAuthChecked(true);
      setLoading(false);
      return;
    }

    // Get active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser((prev) => (prev?.isDemo ? prev : (session?.user ?? null)));
      setAuthChecked(true);
    });

    // Listen to changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser((prev) => (prev?.isDemo ? prev : (session?.user ?? null)));
      setAuthChecked(true);
    });
    /* eslint-enable react-hooks/set-state-in-effect */

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // Sign up with email/password and optional user metadata
  const signUp = async (email, password, metadata = {}) => {
    if (isApiBackend) {
      const res = await apiProvider.auth.signUp(email, password, metadata);
      if (res.success && res.user) { setUser(res.user); setAuthChecked(true); }
      return res;
    }
    if (!supabase) return { success: false, error: 'Supabase non configuré' };
    try {
      const { data, error } = await supabase.auth.signUp({ 
        email, 
        password,
        options: {
          emailRedirectTo: getAppBaseUrl(),
          data: metadata,
        }
      });
      if (error) throw error;
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  // Sign in with email/password
  const signIn = async (email, password) => {
    if (isApiBackend) {
      const res = await apiProvider.auth.signIn(email, password);
      if (res.success && res.user) { setUser(res.user); setAuthChecked(true); }
      return res;
    }
    if (!supabase) return { success: false, error: 'Supabase non configuré' };
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  // Sign in with Google OAuth
  const signInWithGoogle = async () => {
    // --- Backend API Fastify : authentification via Google Identity Services ------
    if (isApiBackend) {
      return new Promise((resolve) => {
        let settled = false;

        // Résolution unique : neutralise le délai de sécurité et garantit que la
        // Promise ne se résout qu'une seule fois (callback OU timeout OU erreur).
        const finish = (result) => {
          if (settled) return;
          settled = true;
          clearTimeout(safetyTimer);
          resolve(result);
        };

        // Garde anti-blocage (pop-up bloquée) : si aucun callback GIS n'arrive
        // dans la fenêtre impartie, on résout avec une erreur EXPLICITE plutôt
        // que de laisser un spinner infini. Le bouton peut ainsi être réarmé.
        const safetyTimer = setTimeout(() => {
          finish({
            success: false,
            popupBlocked: true,
            error:
              "La fenêtre Google ne s'est pas ouverte. Autorisez les pop-ups pour ce site, puis réessayez.",
          });
        }, GOOGLE_AUTH_TIMEOUT_MS);

        // Initialise le client GIS et déclenche la pop-up de façon SYNCHRONE
        // (dans le geste utilisateur) lorsque le script est déjà préchargé.
        const startTokenClient = () => {
          try {
            const client = window.google.accounts.oauth2.initTokenClient({
              client_id: GOOGLE_CLIENT_ID,
              scope: 'email profile openid',
              callback: async (tokenResponse) => {
                if (tokenResponse.error) {
                  finish({
                    success: false,
                    error: tokenResponse.error_description || 'Authentification annulée.',
                  });
                  return;
                }
                try {
                  const accessToken = tokenResponse.access_token;
                  const result = await apiProvider.auth.signInWithGoogle(accessToken);
                  if (result.success) {
                    setUser(result.user);
                    setAuthChecked(true);
                    finish({ success: true });
                  } else {
                    finish({ success: false, error: result.error });
                  }
                } catch (e) {
                  finish({ success: false, error: e.message || 'Authentification Google échouée.' });
                }
              },
            });
            // Appel synchrone : GIS préchargé, aucun `await` ne précède ce point.
            client.requestAccessToken();
          } catch (err) {
            finish({ success: false, error: err.message || "Erreur d'initialisation Google OAuth." });
          }
        };

        // Cas attendu : GIS préchargé au montage de la page d'auth.
        if (window.google?.accounts?.oauth2) {
          startTokenClient();
          return;
        }

        // Repli best-effort : le script n'est pas encore prêt — on le charge à la
        // volée. Le délai de sécurité ci-dessus garantit une résolution même si
        // le script ne se charge jamais.
        let script = document.getElementById(GIS_SCRIPT_ID);
        if (!script) {
          script = document.createElement('script');
          script.id = GIS_SCRIPT_ID;
          script.src = GIS_SCRIPT_URL;
          script.async = true;
          script.defer = true;
          document.body.appendChild(script);
        }
        script.addEventListener(
          'load',
          () => {
            if (window.google?.accounts?.oauth2) startTokenClient();
            else finish({ success: false, error: 'Impossible de charger le service Google.' });
          },
          { once: true },
        );
        script.addEventListener(
          'error',
          () => finish({ success: false, error: 'Impossible de charger le service Google.' }),
          { once: true },
        );
      });
    }

    if (!supabase) return { success: false, error: 'Supabase non configuré' };
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getAppBaseUrl()
        }
      });
      if (error) throw error;
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  // Sign out
  const logOut = async () => {
    if (isApiBackend && !user?.isDemo) {
      await apiProvider.auth.signOut();
      setUser(null);
      return { success: true };
    }
    if (!supabase || user?.isDemo) {
      setUser(null);
      return { success: true };
    }
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  // Login as demo user
  const loginAsDemo = () => {
    setUser({ email: 'demo@opays.com', id: 'demo-user', isDemo: true });
    setAuthChecked(true);
  };

  // Accès de test (local) : si l'URL contient `?debug_force_demo`, on connecte
  // automatiquement en mode démo. Cela permet d'ouvrir directement les espaces
  // protégés (ex. /admin, /admin-plateforme) via un lien, sans session réelle.
  // En production, ce paramètre n'est volontairement jamais présent dans les
  // parcours normaux ; le mode démo n'expose que des données fictives.
  useEffect(() => {
    try {
      if (
        typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).has('debug_force_demo')
      ) {
        // Bascule unique en mode démo à l'initialisation (synchronisation
        // volontaire depuis l'URL).
        /* eslint-disable react-hooks/set-state-in-effect */
        setUser({ email: 'demo@opays.com', id: 'demo-user', isDemo: true });
        setAuthChecked(true);
        /* eslint-enable react-hooks/set-state-in-effect */
      }
    } catch {
      /* no-op */
    }
  }, []);

  // Charge le Profil_Accès de l'Utilisateur courant (spec paid-access-control).
  //
  // PRINCIPE : toute incertitude ⇒ accès refusé. Le chargement est protégé par
  // un délai de 10 s via Promise.race ; un échec ou un dépassement de délai place
  // `profileStatus` à 'error' (traité comme NON autorisé par le gating, R2.4).
  //
  // Mode démo / Supabase non configuré : accès accordé localement, AUCUN appel
  // réseau (préserve le mode démo existant, R2.1).
  const loadProfile = useCallback(async () => {
    // Mode démo ou Supabase absent : accès local accordé sans appel réseau.
    if (!supabase || user?.isDemo) {
      setProfilAcces({ acces_autorise: true, role: 'user' });
      setProfileStatus('ready');
      return;
    }

    // Pas d'utilisateur authentifié : aucun profil à charger.
    if (!user) {
      setProfilAcces(null);
      setProfileStatus('error');
      return;
    }

    if (isApiBackend) {
      // Z4 : le verdict d'accès est calculé CÔTÉ SERVEUR et renvoyé par
      // /api/auth/me (champ `accessGranted`). Le client ne fait que le refléter
      // (autorité non falsifiable). Repli rétro-compatible sur `isActive` si le
      // serveur n'expose pas encore le verdict.
      const serverVerdict =
        typeof user.accessGranted === 'boolean'
          ? user.accessGranted
          : (user.isActive ?? true);
      setProfilAcces({
        id: user.id,
        user_id: user.id,
        role: user.role === 'superadmin' ? 'admin' : (user.role === 'agency_admin' ? 'admin' : 'user'),
        acces_autorise: serverVerdict,
        // Verdict serveur explicite (consommé en priorité par isAccessGranted).
        accessGranted: serverVerdict,
        trialActive: user.trialActive,
        trialEndsAt: user.trialEndsAt ?? null,
        paidAccess: user.paidAccess ?? false,
        createdAt: user.createdAt,
        created_at: user.createdAt,
      });
      setProfileStatus('ready');
      return;
    }

    setProfileStatus('loading');

    // Garde de délai 10 s (R2.4) : le timeout rejette pour forcer le refus.
    let timeoutId;
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error('profile_load_timeout')),
        LOAD_TIMEOUT_MS,
      );
    });

    const query = supabase
      .from('access_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    try {
      const { data, error } = await Promise.race([query, timeout]);
      if (error) throw error;
      setProfilAcces(data ?? null);
      setProfileStatus('ready');
    } catch (err) {
      // Échec du chargement ou délai dépassé ⇒ accès refusé (R1.9, R2.4).
      console.error('Échec du chargement du Profil_Accès:', err?.message || err);
      setProfilAcces(null);
      setProfileStatus('error');
    } finally {
      clearTimeout(timeoutId);
    }
  }, [user]);

  // Soumet une Preuve_Paiement (spec paid-access-control, R5).
  //
  // FLUX déterministe :
  //   1. Validation pure préalable via `validateProofSubmission` (mode, reçu,
  //      format, taille). Toute soumission invalide est refusée AVANT tout effet
  //      de bord, sans téléversement ni insertion (R5.1, R5.3–R5.6).
  //   2. Téléversement du Reçu dans le bucket privé `receipts` au chemin
  //      `buildReceiptPath(user.id, file.name)` (R5.2). UPLOAD D'ABORD.
  //   3. Insertion de l'enregistrement de preuve (`buildProofRecord`) dans la
  //      table `payment_proofs` AVEC le statut `en_attente` (R5.1, R5.8).
  //      INSERT ENSUITE.
  //
  // En cas d'échec du téléversement : AUCUNE insertion, retour d'une erreur
  // invitant à réessayer (R5.7). En cas de succès : confirmation < 5 s (R5.9).
  //
  // Mode démo / Supabase absent : succès simulé localement, aucun appel réseau
  // (préserve le mode démo existant) — la validation pure reste appliquée.
  const submitPaymentProof = async ({ mode, reference, file } = {}) => {
    // 1. Validation pure préalable (aucun effet de bord si invalide).
    const validation = validateProofSubmission({ mode, file });
    if (!validation.ok) {
      return { success: false, error: validation.message, code: validation.code };
    }

    // Backend API Fastify (L4) : téléversement via volume Dokploy, jamais Supabase.
    if (isApiBackend) {
      if (!user) return { success: false, error: 'Utilisateur non authentifié' };
      try {
        const uploaded = await apiProvider.storage.upload(file, 'payment_proof');
        const recuPath = uploaded?.id ? `uploads/${uploaded.id}` : buildReceiptPath(user.id, file.name);
        return {
          success: true,
          data: buildProofRecord({ userId: user.id, mode, reference, recuPath }),
        };
      } catch (err) {
        console.error('Échec du téléversement via API:', err?.message || err);
        return { success: false, error: err?.message || String(err), code: 'error_upload' };
      }
    }

    // Mode démo ou Supabase non configuré : succès simulé, aucun appel réseau.
    if (!supabase || user?.isDemo) {
      return {
        success: true,
        data: buildProofRecord({
          userId: user?.id ?? 'demo-user',
          mode,
          reference,
          recuPath: buildReceiptPath(user?.id ?? 'demo-user', file.name),
        }),
      };
    }

    if (!user) {
      return { success: false, error: 'Utilisateur non authentifié' };
    }

    const recuPath = buildReceiptPath(user.id, file.name);

    // 2. Téléversement du Reçu dans le Stockage_Reçus (UPLOAD D'ABORD, R5.2).
    try {
      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(recuPath, file, {
          contentType: file.type,
          upsert: false,
        });
      // Échec d'upload ⇒ aucun insert, message d'erreur (R5.7, clé payment.error_upload).
      if (uploadError) {
        console.error('Échec du téléversement du reçu:', uploadError.message);
        return { success: false, error: uploadError.message, code: 'error_upload' };
      }
    } catch (err) {
      console.error('Échec du téléversement du reçu:', err?.message || err);
      return { success: false, error: err?.message || String(err), code: 'error_upload' };
    }

    // 3. Insertion de l'enregistrement de preuve (INSERT ENSUITE, R5.1, R5.8).
    try {
      const record = buildProofRecord({ userId: user.id, mode, reference, recuPath });
      const { data, error } = await supabase
        .from('payment_proofs')
        .insert([record])
        .select();
      if (error) throw error;
      // Confirmation de réception en cas de succès (R5.9).
      return { success: true, data: data?.[0] ?? record };
    } catch (err) {
      console.error('Échec de l\'enregistrement de la preuve de paiement:', err?.message || err);
      return { success: false, error: err?.message || String(err) };
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  // Charge le Profil_Accès dès que la session est connue (R2.1, R2.3).
  // Démo / Supabase absent : accès accordé localement, aucun appel réseau.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!authChecked) {
      return;
    }
    if (!user) {
      setProfilAcces(null);
      setProfileStatus('loading');
      return;
    }
    if (!supabase || user.isDemo) {
      setProfilAcces({ acces_autorise: true, role: 'user' });
      setProfileStatus('ready');
      return;
    }
    loadProfile();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [authChecked, user, loadProfile]);

  // Update localStorage helper if using mock data
  const updateLocalMock = (key, data) => {
    if (isUsingMock) {
      localStorage.setItem(key, JSON.stringify(data));
    }
  };

  // Prépare et valide une opération avant enregistrement (fonctions pures de
  // `finance.js` et `txnValidation.js`). Ne produit aucun effet de bord :
  //  - valide les montants requis selon le type (Ex. 4.2) ;
  //  - vérifie que les portefeuilles d'un `exchange` sont distincts (Ex. 4.3) ;
  //  - détecte un doublon par `transaction_id` et suspend l'enregistrement tant
  //    qu'il n'est pas explicitement confirmé via `options.confirmDuplicate`
  //    (Ex. 4.4, 4.5) ;
  //  - recalcule `exchange_rate` (Ex. 1.1/1.2) et `profit_usd` (Ex. 1.3) ;
  //  - applique les mutations de soldes via `applyBalances` et refuse en cas de
  //    fonds insuffisants, sans modifier les soldes (Ex. 1.4–1.9, 1.7, 4.1).
  //
  // `options.excludeId` permet d'exclure une opération existante de la détection
  // de doublon (cas de la confirmation d'un brouillon déjà présent).
  //
  // Retourne { ok: true, enriched, wallets } ou
  // { ok: false, error, duplicate?, existing? }.
  const prepareTransaction = (rawTxn, options = {}) => {
    const txn = { ...rawTxn, status: rawTxn.status || 'completed' };
    const type = txn.type || 'exchange';
    const debitsSource = type === 'exchange' || type === 'withdrawal';
    const creditsDest = type === 'exchange' || type === 'deposit';

    // Validation des montants requis selon le type d'opération (Ex. 4.2).
    if (debitsSource) {
      const v = validateAmount(txn.source_amount, 'montant source');
      if (!v.ok) return { ok: false, error: v.error };
    }
    if (creditsDest) {
      const v = validateAmount(txn.dest_amount, 'montant destination');
      if (!v.ok) return { ok: false, error: v.error };
    }
    // Les frais sont optionnels : ne valider que s'ils sont strictement positifs.
    if (txn.fee !== undefined && txn.fee !== null && Number(txn.fee) > 0) {
      const vf = validateAmount(txn.fee, 'frais');
      if (!vf.ok) return { ok: false, error: vf.error };
    }

    // Portefeuilles source/destination distincts pour un `exchange` (Ex. 4.3).
    const distinct = ensureDistinctWallets(txn);
    if (!distinct.ok) return { ok: false, error: distinct.error };

    // Détection de doublon par identifiant réseau (Ex. 4.4, 4.5).
    const existingOps = options.excludeId
      ? transactions.filter((t) => t.id !== options.excludeId)
      : transactions;
    const dup = detectDuplicate(existingOps, txn.transaction_id);
    if (dup.duplicate && !options.confirmDuplicate) {
      return {
        ok: false,
        duplicate: true,
        existing: dup.existing,
        error: `Doublon potentiel : une opération avec l'identifiant réseau "${String(txn.transaction_id).trim()}" existe déjà. Confirmez ou annulez l'enregistrement.`,
      };
    }

    // Recalcul des grandeurs financières pour un `exchange` (Ex. 1.1, 1.2, 1.3).
    const enriched = { ...txn };
    if (type === 'exchange') {
      const rateRes = computeExchangeRate(txn.source_amount, txn.dest_amount);
      if (!rateRes.ok) return { ok: false, error: rateRes.error };
      enriched.exchange_rate = rateRes.rate;

      const sourceWallet = wallets.find((w) => w.id === txn.source_wallet_id);
      const destWallet = wallets.find((w) => w.id === txn.dest_wallet_id);
      if (sourceWallet && destWallet) {
        enriched.profit_usd = computeProfitUSD(
          txn.source_amount,
          sourceWallet.currency,
          txn.dest_amount,
          destWallet.currency,
          rates,
        );
      }
    }

    // Application des mutations de soldes / pré-contrôle des fonds (Ex. 1.4–1.9).
    let nextWallets = wallets;
    if (enriched.status === 'completed') {
      const balRes = applyBalances(wallets, enriched);
      if (balRes.error) return { ok: false, error: balRes.error };
      nextWallets = balRes.wallets;
    }

    return { ok: true, enriched, wallets: nextWallets };
  };

  // Add a new transaction (always with status = 'completed' by default).
  // `options.confirmDuplicate` lève la suspension en cas de doublon détecté.
  // Note: Le dépassement de délai (timeout) du Gemini_Proxy (via callGeminiWithTimeout)
  // est géré au niveau de la couche UI (Transactions.jsx) et non ici.
  const addTransaction = async (txn, options = {}) => {
    const prep = prepareTransaction(txn, options);
    if (!prep.ok) {
      return {
        success: false,
        error: prep.error,
        duplicate: prep.duplicate,
        existing: prep.existing,
      };
    }

    const { enriched, wallets: nextWallets } = prep;

    if (isApiBackend) {
      try {
        const created = await apiProvider.transactions.create(enriched);
        await fetchData();
        return { success: true, data: created };
      } catch (err) {
        const denied = handleRlsDenial(err, 'addTransaction:api');
        if (denied) return denied;
        console.error('Erreur API Fastify (addTransaction):', err);
        return { success: false, error: err.message };
      }
    }

    if (isUsingMock) {
      const newTxn = { id: 't_' + Date.now(), ...enriched, timestamp: new Date().toISOString() };
      const updatedTxns = [newTxn, ...transactions];
      setTransactions(updatedTxns);
      updateLocalMock('forex_txns', updatedTxns);

      // Only update wallet balances if this is a completed transaction.
      if (enriched.status === 'completed') {
        setWallets(nextWallets);
        updateLocalMock('forex_wallets', nextWallets);
      }
      return { success: true };
    }

    try {
      const { data, error } = await supabase.from('transactions').insert([enriched]).select();
      if (error) throw error;
      // Trigger refresh to load updated wallets & transactions from db
      await fetchData();
      return { success: true, data };
    } catch (err) {
      const denied = handleRlsDenial(err, 'addTransaction');
      if (denied) return denied;
      console.error('Error saving transaction:', err);
      return { success: false, error: err.message };
    }
  };

  // Confirm a draft transaction (change status from 'draft' to 'completed').
  // `options.confirmDuplicate` lève la suspension en cas de doublon détecté.
  const confirmDraft = async (draftId, updatedData = {}, options = {}) => {
    const draft = transactions.find((t) => t.id === draftId);
    if (!draft) {
      return { success: false, error: 'Brouillon introuvable' };
    }

    // L'opération confirmée porte le même `transaction_id` que le brouillon
    // existant : on l'exclut de la détection de doublon.
    const merged = { ...draft, ...updatedData, status: 'completed' };
    const prep = prepareTransaction(merged, { ...options, excludeId: draftId });
    if (!prep.ok) {
      return {
        success: false,
        error: prep.error,
        duplicate: prep.duplicate,
        existing: prep.existing,
      };
    }

    const { enriched, wallets: nextWallets } = prep;

    if (isApiBackend) {
      try {
        const confirmed = await apiProvider.transactions.confirmDraft(draftId);
        await fetchData();
        return { success: true, data: confirmed };
      } catch (err) {
        const denied = handleRlsDenial(err, 'confirmDraft:api');
        if (denied) return denied;
        console.error('Erreur API Fastify (confirmDraft):', err);
        return { success: false, error: err.message };
      }
    }

    if (isUsingMock) {
      const confirmedTxn = { ...draft, ...enriched };
      const updatedTxns = transactions.map((t) => (t.id === draftId ? confirmedTxn : t));
      setTransactions(updatedTxns);
      updateLocalMock('forex_txns', updatedTxns);

      setWallets(nextWallets);
      updateLocalMock('forex_wallets', nextWallets);
      return { success: true };
    }

    try {
      // Persiste les données saisies ainsi que les grandeurs recalculées.
      const updatePayload = {
        ...updatedData,
        status: 'completed',
      };
      if (enriched.exchange_rate !== undefined) updatePayload.exchange_rate = enriched.exchange_rate;
      if (enriched.profit_usd !== undefined) updatePayload.profit_usd = enriched.profit_usd;

      const { data, error } = await supabase
        .from('transactions')
        .update(updatePayload)
        .eq('id', draftId)
        .select();
      if (error) throw error;
      await fetchData();
      return { success: true, data };
    } catch (err) {
      const denied = handleRlsDenial(err, 'confirmDraft');
      if (denied) return denied;
      console.error('Error confirming draft:', err);
      return { success: false, error: err.message };
    }
  };

  // Create a new wallet
  const createWallet = async (wallet) => {
    const formattedWallet = {
      ...wallet,
      balance: parseFloat(wallet.balance) || 0,
      is_active: wallet.is_active !== undefined ? wallet.is_active : true
    };

    if (isApiBackend) {
      try {
        const created = await apiProvider.wallets.create(formattedWallet);
        await fetchData();
        return { success: true, data: created };
      } catch (err) {
        const denied = handleRlsDenial(err, 'createWallet:api');
        if (denied) return denied;
        console.error('Erreur API Fastify (createWallet):', err);
        return { success: false, error: err.message };
      }
    }

    if (isUsingMock) {
      const newWallet = {
        id: 'w_' + Date.now(),
        ...formattedWallet,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      const updatedWallets = [...wallets, newWallet];
      setWallets(updatedWallets);
      updateLocalMock('forex_wallets', updatedWallets);
      return { success: true, data: newWallet };
    }
    try {
      const { data, error } = await supabase.from('wallets').insert([formattedWallet]).select();
      if (error) throw error;
      await fetchData();
      return { success: true, data: data[0] };
    } catch (err) {
      const denied = handleRlsDenial(err, 'createWallet');
      if (denied) return denied;
      console.error('Error creating wallet:', err);
      return { success: false, error: err.message };
    }
  };

  // Update an existing wallet
  const updateWallet = async (id, updates) => {
    if (isApiBackend) {
      try {
        const updated = await apiProvider.wallets.update(id, updates);
        await fetchData();
        return { success: true, data: updated };
      } catch (err) {
        const denied = handleRlsDenial(err, 'updateWallet:api');
        if (denied) return denied;
        console.error('Erreur API Fastify (updateWallet):', err);
        return { success: false, error: err.message };
      }
    }
    if (isUsingMock) {
      const updatedWallets = wallets.map(w => 
        w.id === id ? { ...w, ...updates, updated_at: new Date().toISOString() } : w
      );
      setWallets(updatedWallets);
      updateLocalMock('forex_wallets', updatedWallets);
      return { success: true };
    }
    try {
      const { data, error } = await supabase.from('wallets').update(updates).eq('id', id).select();
      if (error) throw error;
      await fetchData();
      return { success: true, data };
    } catch (err) {
      const denied = handleRlsDenial(err, 'updateWallet');
      if (denied) return denied;
      console.error('Error updating wallet:', err);
      return { success: false, error: err.message };
    }
  };

  // Delete a wallet
  const deleteWallet = async (id) => {
    if (isUsingMock) {
      const updatedWallets = wallets.filter(w => w.id !== id);
      setWallets(updatedWallets);
      updateLocalMock('forex_wallets', updatedWallets);
      return { success: true };
    }
    try {
      const { error } = await supabase.from('wallets').delete().eq('id', id);
      if (error) throw error;
      await fetchData();
      return { success: true };
    } catch (err) {
      const denied = handleRlsDenial(err, 'deleteWallet');
      if (denied) return denied;
      console.error('Error deleting wallet:', err);
      return { success: false, error: err.message };
    }
  };

  // Adjust wallet balance directly (Admin Stock adjustment)
  const adjustWalletBalance = async (id, newBalance) => {
    const balanceNum = parseFloat(newBalance);
    if (isNaN(balanceNum)) return { success: false, error: 'Montant invalide' };

    if (isUsingMock) {
      const updatedWallets = wallets.map(w => 
        w.id === id ? { ...w, balance: balanceNum, updated_at: new Date().toISOString() } : w
      );
      setWallets(updatedWallets);
      updateLocalMock('forex_wallets', updatedWallets);
      return { success: true };
    }
    try {
      const { data, error } = await supabase
        .from('wallets')
        .update({ balance: balanceNum, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select();
      if (error) throw error;
      await fetchData();
      return { success: true, data };
    } catch (err) {
      const denied = handleRlsDenial(err, 'adjustWalletBalance');
      if (denied) return denied;
      console.error('Error adjusting wallet balance:', err);
      return { success: false, error: err.message };
    }
  };

  // Delete/reject a draft transaction
  const deleteDraft = async (draftId) => {
    if (isUsingMock) {
      const updatedTxns = transactions.filter(t => t.id !== draftId);
      setTransactions(updatedTxns);
      updateLocalMock('forex_txns', updatedTxns);
      return { success: true };
    }

    try {
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', draftId)
        .eq('status', 'draft'); // Safety: only delete drafts
      if (error) throw error;
      await fetchData();
      return { success: true };
    } catch (err) {
      const denied = handleRlsDenial(err, 'deleteDraft');
      if (denied) return denied;
      console.error('Error deleting draft:', err);
      return { success: false, error: err.message };
    }
  };

  // Add a new expense
  const addExpense = async (exp) => {
    if (isUsingMock) {
      const newExp = { id: 'e_' + Date.now(), ...exp, timestamp: new Date().toISOString() };
      const updatedExp = [newExp, ...expenses];
      setExpenses(updatedExp);
      updateLocalMock('forex_expenses', updatedExp);

      // Trigger simulation: update wallet balance
      const updatedWallets = wallets.map(w => {
        if (w.id === exp.wallet_id) {
          return { ...w, balance: w.balance - parseFloat(exp.amount) };
        }
        return w;
      });
      setWallets(updatedWallets);
      updateLocalMock('forex_wallets', updatedWallets);
      return { success: true };
    }

    try {
      const { data, error } = await supabase.from('expenses').insert([exp]).select();
      if (error) throw error;
      await fetchData();
      return { success: true, data };
    } catch (err) {
      const denied = handleRlsDenial(err, 'addExpense');
      if (denied) return denied;
      console.error('Error saving expense:', err);
      return { success: false, error: err.message };
    }
  };

  // Supprime une dépense. En mode mock, restaure le solde de la caisse débitée
  // (re-crédite le montant). Utilisé pour corriger une dépense mal enregistrée.
  const deleteExpense = async (expenseId) => {
    const target = expenses.find((e) => e.id === expenseId);
    if (!target) return { success: false, error: 'Dépense introuvable' };

    if (isUsingMock) {
      const updated = expenses.filter((e) => e.id !== expenseId);
      setExpenses(updated);
      updateLocalMock('forex_expenses', updated);
      // Restaure le solde de la caisse (re-crédite le montant dépensé).
      const updatedWallets = wallets.map((w) =>
        w.id === target.wallet_id ? { ...w, balance: (Number(w.balance) || 0) + parseFloat(target.amount) } : w
      );
      setWallets(updatedWallets);
      updateLocalMock('forex_wallets', updatedWallets);
      return { success: true };
    }
    try {
      const { error } = await supabase.from('expenses').delete().eq('id', expenseId);
      if (error) throw error;
      await fetchData();
      return { success: true };
    } catch (err) {
      const denied = handleRlsDenial(err, 'deleteExpense');
      if (denied) return denied;
      console.error('Error deleting expense:', err);
      return { success: false, error: err.message };
    }
  };

  // Save exchange rates for the day
  const updateRates = async (newRates) => {
    if (isApiBackend) {
      try {
        await apiProvider.rates.upsert(
          (newRates || []).map((nr) => ({ currency: nr.currency, rate_to_usd: parseFloat(nr.rate_to_usd) }))
        );
        await fetchData();
        return { success: true };
      } catch (err) {
        const denied = handleRlsDenial(err, 'updateRates:api');
        if (denied) return denied;
        console.error('Erreur API Fastify (updateRates):', err);
        return { success: false, error: err.message };
      }
    }
    if (isUsingMock) {
      // Merge new rates into current rates
      const updatedRates = [...rates];
      newRates.forEach(nr => {
        const index = updatedRates.findIndex(r => r.currency === nr.currency);
        if (index > -1) {
          updatedRates[index].rate_to_usd = parseFloat(nr.rate_to_usd);
        } else {
          updatedRates.push({ currency: nr.currency, rate_to_usd: parseFloat(nr.rate_to_usd) });
        }
      });
      setRates(updatedRates);
      updateLocalMock('forex_rates', updatedRates);
      return { success: true };
    }

    try {
      const promises = newRates.map(nr => 
        supabase.from('exchange_rates').upsert({
          currency: nr.currency,
          rate_to_usd: nr.rate_to_usd,
          date: new Date().toISOString().split('T')[0]
        }, { onConflict: 'currency,date' })
      );
      await Promise.all(promises);
      await fetchData();
      return { success: true };
    } catch (err) {
      const denied = handleRlsDenial(err, 'updateRates');
      if (denied) return denied;
      console.error('Error updating rates:', err);
      return { success: false, error: err.message };
    }
  };

  // Reset Mock Data to defaults
  const resetMockData = () => {
    if (isUsingMock) {
      localStorage.removeItem('forex_wallets');
      localStorage.removeItem('forex_rates');
      localStorage.removeItem('forex_txns');
      localStorage.removeItem('forex_expenses');
      localStorage.removeItem('forex_customers');
      localStorage.removeItem('forex_loans');
      localStorage.removeItem('forex_debts');
      localStorage.removeItem('forex_templates');
      localStorage.removeItem('forex_reminders');
      localStorage.removeItem('forex_agency');
      localStorage.removeItem('forex_module_entitlements');
      localStorage.removeItem('forex_module_states');
      localStorage.removeItem('forex_transfer_methods');
      localStorage.removeItem('forex_subscription_providers');
      localStorage.removeItem('forex_transfers');
      localStorage.removeItem('forex_subscriptions');
      localStorage.removeItem('forex_flight_bookings');
      localStorage.removeItem('forex_remote_orders');
      localStorage.removeItem('forex_employees');
      localStorage.removeItem('forex_invitations');
      setWallets(MOCK_WALLETS);
      setRates(MOCK_RATES);
      setTransactions(MOCK_TRANSACTIONS);
      setExpenses(MOCK_EXPENSES);
      setCustomers(MOCK_CUSTOMERS);
      setLoans(MOCK_LOANS);
      setDebts(MOCK_DEBTS);
      setTemplates(MOCK_TEMPLATES);
      setReminderHistory(MOCK_REMINDERS);
      setCurrentAgency(MOCK_AGENCY);
      setModuleEntitlements(MOCK_MODULE_ENTITLEMENTS);
      setPlatformAgencies([MOCK_AGENCY]);
      setPlatformModuleEntitlements({ [MOCK_AGENCY.id]: MOCK_MODULE_ENTITLEMENTS });
      setModuleStates(MOCK_MODULE_STATES);
      setTransferMethods(MOCK_TRANSFER_METHODS);
      setSubscriptionProviders(MOCK_SUBSCRIPTION_PROVIDERS);
      setTransfers(MOCK_TRANSFERS);
      setSubscriptions(MOCK_SUBSCRIPTIONS);
      setFlightBookings(MOCK_FLIGHT_BOOKINGS);
      setRemoteOrders(MOCK_REMOTE_ORDERS);
      setEmployees(MOCK_EMPLOYEES);
      setInvitations(MOCK_INVITATIONS);
    }
  };

  // ==========================================
  // CUSTOMERS CRUD
  // ==========================================

  // Create a new customer
  const createCustomer = async (customer) => {
    if (isUsingMock) {
      const newCust = { id: 'c_' + Date.now(), ...customer, created_at: new Date().toISOString() };
      const updated = [newCust, ...customers];
      setCustomers(updated);
      updateLocalMock('forex_customers', updated);
      return { success: true, data: newCust };
    }
    try {
      const { data, error } = await supabase.from('customers').insert([customer]).select();
      if (error) throw error;
      await fetchData();
      return { success: true, data: data[0] };
    } catch (err) {
      const denied = handleRlsDenial(err, 'createCustomer');
      if (denied) return denied;
      console.error('Error creating customer:', err);
      return { success: false, error: err.message };
    }
  };

  // Update an existing customer
  const updateCustomer = async (id, updates) => {
    if (isUsingMock) {
      const updated = customers.map(c => c.id === id ? { ...c, ...updates } : c);
      setCustomers(updated);
      updateLocalMock('forex_customers', updated);
      return { success: true };
    }
    try {
      const { data, error } = await supabase.from('customers').update(updates).eq('id', id).select();
      if (error) throw error;
      await fetchData();
      return { success: true, data };
    } catch (err) {
      const denied = handleRlsDenial(err, 'updateCustomer');
      if (denied) return denied;
      console.error('Error updating customer:', err);
      return { success: false, error: err.message };
    }
  };

  // Rattache une opération à un Client (détection déterministe puis création
  // au besoin), en s'appuyant sur le module pur `customerMatching`.
  //
  // Contrat de retour (compatible avec l'usage dans `Transactions.jsx` qui lit
  // `custRes.success` / `custRes.data` / `custRes.isNew`) :
  //   { success, data?, isNew?, ambiguous?, error? }
  //
  // Règles couvertes :
  //  - Ex. 8.4 : sans nom NI téléphone, aucune création ni rattachement
  //    (succès neutre, `data: null`) ;
  //  - Ex. 8.1/8.2/8.5/8.6/8.7 : rattachement déterministe via `matchCustomer`
  //    (téléphone normalisé prioritaire, puis nom normalisé ; départage par
  //    `created_at` le plus ancien ; jamais de doublon) ;
  //  - Ex. 5.9/6.5/7.3 : une correspondance ambiguë (plusieurs fiches) est
  //    signalée via `ambiguous: true` pour confirmation manuelle en amont ;
  //  - Ex. 8.3 : aucune correspondance et identité fournie → création puis
  //    rattachement ;
  //  - Ex. 8.8 : échec de `createCustomer` → erreur explicite SANS rattachement,
  //    l'appelant conserve les données saisies (aucune perte).
  const findOrCreateCustomer = async ({ name, phone } = {}) => {
    const hasName = typeof name === 'string' ? name.trim() !== '' : Boolean(name);
    const hasPhone = typeof phone === 'string' ? phone.trim() !== '' : Boolean(phone);

    // Ex. 8.4 : sans identité, on n'altère aucun Client et on ne rattache rien.
    if (!hasName && !hasPhone) {
      return { success: true, data: null, isNew: false };
    }

    // Rattachement déterministe, sans création (Ex. 8.1, 8.2, 8.5, 8.6, 8.7).
    const { match, ambiguous } = matchCustomer(customers, { name, phone });
    if (match) {
      return { success: true, data: match, isNew: false, ambiguous };
    }

    // Ex. 8.3 : aucune correspondance → créer puis rattacher.
    const res = await createCustomer({ name: name || 'Client inconnu', phone: phone || null });
    if (res.success && res.data) {
      return { success: true, data: res.data, isNew: true };
    }

    // Ex. 8.8 : la création a échoué → ne pas rattacher, message explicite.
    return {
      success: false,
      error: res.error || "Échec de la création du client : l'opération n'a pas été rattachée.",
    };
  };

  // Historique d'un Client : opérations rattachées (`customer_id`) triées par
  // date décroissante et total borné, via les helpers purs `customerHistory`.
  // Recalculé à partir de `transactions`, donc la Fiche_Client se met à jour
  // automatiquement après chaque enregistrement (Ex. 9.1, 9.5, 9.6, 12.5).
  // Renvoie { operations: Operation[], total: number }.
  const getCustomerHistory = (customerId) => {
    if (!customerId) return { operations: [], total: 0 };
    const related = transactions.filter((t) => t && t.customer_id === customerId);
    const operations = sortCustomerOperations(related);
    return { operations, total: countCustomerOperations(operations) };
  };

  // ==========================================
  // LOANS CRUD
  // ==========================================

  // Create a new loan
  const createLoan = async (loan) => {
    if (isUsingMock) {
      const newLoan = {
        id: 'l_' + Date.now(),
        ...loan,
        status: 'pending',
        created_at: new Date().toISOString()
      };
      const updatedLoans = [newLoan, ...loans];
      setLoans(updatedLoans);
      updateLocalMock('forex_loans', updatedLoans);

      // Debit wallet balance (simulate trigger)
      const updatedWallets = wallets.map(w => {
        if (w.id === loan.wallet_id) {
          return { ...w, balance: w.balance - parseFloat(loan.amount) };
        }
        return w;
      });
      setWallets(updatedWallets);
      updateLocalMock('forex_wallets', updatedWallets);

      return { success: true, data: newLoan };
    }
    try {
      const { data, error } = await supabase.from('loans').insert([{
        ...loan,
        status: 'pending'
      }]).select();
      if (error) throw error;
      await fetchData();
      return { success: true, data: data[0] };
    } catch (err) {
      const denied = handleRlsDenial(err, 'createLoan');
      if (denied) return denied;
      console.error('Error creating loan:', err);
      return { success: false, error: err.message };
    }
  };

  // Update loan status (mark as paid / overdue)
  const updateLoanStatus = async (loanId, newStatus) => {
    if (isUsingMock) {
      let targetLoan = null;
      const updatedLoans = loans.map(l => {
        if (l.id === loanId) {
          targetLoan = { ...l, status: newStatus };
          return targetLoan;
        }
        return l;
      });

      if (!targetLoan) return { success: false, error: (translations[language] && translations[language].loans && translations[language].loans.loan_not_found) || 'Loan not found' };

      setLoans(updatedLoans);
      updateLocalMock('forex_loans', updatedLoans);

      // If marked as paid, credit wallet with amount + interest (simulate trigger)
      if (newStatus === 'paid') {
        const repayAmount = parseFloat(targetLoan.amount) * (1 + parseFloat(targetLoan.interest_rate) / 100);
        const updatedWallets = wallets.map(w => {
          if (w.id === targetLoan.wallet_id) {
            return { ...w, balance: w.balance + repayAmount };
          }
          return w;
        });
        setWallets(updatedWallets);
        updateLocalMock('forex_wallets', updatedWallets);
      }

      return { success: true };
    }
    try {
      const { data, error } = await supabase
        .from('loans')
        .update({ status: newStatus })
        .eq('id', loanId)
        .select();
      if (error) throw error;
      await fetchData();
      return { success: true, data };
    } catch (err) {
      const denied = handleRlsDenial(err, 'updateLoanStatus');
      if (denied) return denied;
      console.error('Error updating loan status:', err);
      return { success: false, error: err.message };
    }
  };

  // ==========================================
  // DEBTS CRUD (Registre des dettes / créances)
  // ==========================================

  // Crée une dette ou créance. type ∈ {'receivable','payable'}.
  // Aucun effet sur les soldes de portefeuilles (grand livre déclaratif).
  const createDebt = async (debt) => {
    const amountNum = parseFloat(debt?.amount);
    const validType = debt?.type === 'receivable' || debt?.type === 'payable';
    if (!validType || isNaN(amountNum) || amountNum <= 0 || !debt?.currency) {
      return { success: false, error: 'Champs obligatoires manquants ou invalides (type, montant, devise).' };
    }

    const record = {
      type: debt.type,
      counterparty_name: debt.counterparty_name || null,
      amount: amountNum,
      currency: debt.currency,
      note: debt.note || null,
      status: 'pending',
    };

    if (isApiBackend) {
      try {
        const created = await apiProvider.debts.create(record);
        await fetchData();
        return { success: true, data: created };
      } catch (err) {
        const denied = handleRlsDenial(err, 'createDebt:api');
        if (denied) return denied;
        console.error('Erreur API Fastify (createDebt):', err);
        return { success: false, error: err.message };
      }
    }

    if (isUsingMock) {
      const newDebt = { id: 'd_' + Date.now(), ...record, created_at: new Date().toISOString(), settled_at: null };
      const updated = [newDebt, ...debts];
      setDebts(updated);
      updateLocalMock('forex_debts', updated);
      return { success: true, data: newDebt };
    }
    try {
      const { data, error } = await supabase.from('debts').insert([record]).select();
      if (error) throw error;
      await fetchData();
      return { success: true, data: data[0] };
    } catch (err) {
      const denied = handleRlsDenial(err, 'createDebt');
      if (denied) return denied;
      console.error('Error creating debt:', err);
      return { success: false, error: err.message };
    }
  };

  // Met à jour le statut d'une dette ('settled' immédiat, idempotent).
  const updateDebtStatus = async (debtId, newStatus) => {
    const settledAt = newStatus === 'settled' ? new Date().toISOString() : null;

    if (isApiBackend) {
      try {
        await apiProvider.debts.updateStatus(debtId, newStatus);
        await fetchData();
        return { success: true };
      } catch (err) {
        const denied = handleRlsDenial(err, 'updateDebtStatus:api');
        if (denied) return denied;
        console.error('Erreur API Fastify (updateDebtStatus):', err);
        return { success: false, error: err.message };
      }
    }

    if (isUsingMock) {
      let found = false;
      const updated = debts.map((d) => {
        if (d.id === debtId) {
          found = true;
          return { ...d, status: newStatus, settled_at: settledAt };
        }
        return d;
      });
      if (!found) return { success: false, error: 'Dette introuvable' };
      setDebts(updated);
      updateLocalMock('forex_debts', updated);
      return { success: true };
    }
    try {
      const { data, error } = await supabase
        .from('debts')
        .update({ status: newStatus, settled_at: settledAt })
        .eq('id', debtId)
        .select();
      if (error) throw error;
      await fetchData();
      return { success: true, data };
    } catch (err) {
      const denied = handleRlsDenial(err, 'updateDebtStatus');
      if (denied) return denied;
      console.error('Error updating debt status:', err);
      return { success: false, error: err.message };
    }
  };

  // Totaux séparés des créances et dettes en attente (dans leur devise + en USD).
  // Délègue à la logique pure `computeDebtTotals` (testée isolément).
  const getDebtTotals = () => computeDebtTotals(debts, rates);

  // ==========================================
  // MESSAGE TEMPLATES CRUD (Modèles de message)
  // ==========================================

  // Recharge les modèles de message depuis Supabase (ou localStorage en mock).
  // Retourne { success, data } pour un usage explicite par l'UI (Ex. 10.2, 10.5).
  const fetchTemplates = async () => {
    if (isUsingMock) {
      const local = localStorage.getItem('forex_templates');
      const data = local ? JSON.parse(local) : templates;
      setTemplates(data);
      return { success: true, data };
    }
    try {
      const { data, error } = await supabase
        .from('message_templates')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTemplates(data || []);
      return { success: true, data: data || [] };
    } catch (err) {
      console.error('Error fetching templates:', err);
      return { success: false, error: err.message };
    }
  };

  // Crée un modèle de message réutilisable.
  // Champs : name (obligatoire), lang ∈ {'fr','en'}, scenario, body (obligatoire).
  const createTemplate = async (template) => {
    const name = typeof template?.name === 'string' ? template.name.trim() : '';
    const body = typeof template?.body === 'string' ? template.body.trim() : '';
    if (!name || !body) {
      return { success: false, error: 'Champs obligatoires manquants (nom, corps du message).' };
    }

    const record = {
      name,
      lang: template.lang || 'fr',
      scenario: template.scenario || 'personalized',
      body,
    };

    if (isApiBackend) {
      try {
        const created = await apiProvider.templates.create(record);
        await fetchData();
        return { success: true, data: created };
      } catch (err) {
        const denied = handleRlsDenial(err, 'createTemplate:api');
        if (denied) return denied;
        console.error('Erreur API Fastify (createTemplate):', err);
        return { success: false, error: err.message };
      }
    }

    if (isUsingMock) {
      const now = new Date().toISOString();
      const newTemplate = { id: 'tpl_' + Date.now(), ...record, created_at: now, updated_at: now };
      const updated = [newTemplate, ...templates];
      setTemplates(updated);
      updateLocalMock('forex_templates', updated);
      return { success: true, data: newTemplate };
    }
    try {
      const { data, error } = await supabase.from('message_templates').insert([record]).select();
      if (error) throw error;
      await fetchData();
      return { success: true, data: data[0] };
    } catch (err) {
      const denied = handleRlsDenial(err, 'createTemplate');
      if (denied) return denied;
      console.error('Error creating template:', err);
      return { success: false, error: err.message };
    }
  };

  // Met à jour un modèle existant (rafraîchit updated_at).
  const updateTemplate = async (id, updates) => {
    if (isApiBackend) {
      try {
        await apiProvider.templates.update(id, updates);
        await fetchData();
        return { success: true };
      } catch (err) {
        const denied = handleRlsDenial(err, 'updateTemplate:api');
        if (denied) return denied;
        console.error('Erreur API Fastify (updateTemplate):', err);
        return { success: false, error: err.message };
      }
    }
    if (isUsingMock) {
      let found = false;
      const updated = templates.map((t) => {
        if (t.id === id) {
          found = true;
          return { ...t, ...updates, updated_at: new Date().toISOString() };
        }
        return t;
      });
      if (!found) return { success: false, error: 'Modèle introuvable' };
      setTemplates(updated);
      updateLocalMock('forex_templates', updated);
      return { success: true };
    }
    try {
      const { data, error } = await supabase
        .from('message_templates')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select();
      if (error) throw error;
      await fetchData();
      return { success: true, data };
    } catch (err) {
      const denied = handleRlsDenial(err, 'updateTemplate');
      if (denied) return denied;
      console.error('Error updating template:', err);
      return { success: false, error: err.message };
    }
  };

  // Supprime un modèle de message.
  const deleteTemplate = async (id) => {
    if (isApiBackend) {
      try {
        await apiProvider.templates.remove(id);
        await fetchData();
        return { success: true };
      } catch (err) {
        const denied = handleRlsDenial(err, 'deleteTemplate:api');
        if (denied) return denied;
        console.error('Erreur API Fastify (deleteTemplate):', err);
        return { success: false, error: err.message };
      }
    }
    if (isUsingMock) {
      const updated = templates.filter((t) => t.id !== id);
      setTemplates(updated);
      updateLocalMock('forex_templates', updated);
      return { success: true };
    }
    try {
      const { error } = await supabase.from('message_templates').delete().eq('id', id);
      if (error) throw error;
      await fetchData();
      return { success: true };
    } catch (err) {
      const denied = handleRlsDenial(err, 'deleteTemplate');
      if (denied) return denied;
      console.error('Error deleting template:', err);
      return { success: false, error: err.message };
    }
  };

  // ==========================================
  // REMINDER HISTORY (Historique_Relance)
  // ==========================================

  // Journalise une relance envoyée (succès, échec ou en file). Champs alignés
  // sur la table `reminder_history` :
  //   customer_id (obligatoire), loan_id?, template_id?, scenario, content,
  //   trigger_source ('manual'|'voice'), status ('sent'|'failed'|'queued'),
  //   provider_message_id?, error_reason?, created_at.
  //
  // IMPORTANT (Ex. 11.4) : cette action est résiliente. Si l'écriture en base
  // échoue, elle renvoie { success:false, error } SANS jamais lever d'exception,
  // afin que l'appelant (Service_Relance) puisse poursuivre l'envoi.
  const logReminder = async (entry) => {
    const record = {
      customer_id: entry?.customer_id || null,
      loan_id: entry?.loan_id || null,
      template_id: entry?.template_id || null,
      scenario: entry?.scenario || 'personalized',
      content: entry?.content || '',
      trigger_source: entry?.trigger_source || 'manual',
      status: entry?.status || 'sent',
      provider_message_id: entry?.provider_message_id || null,
      error_reason: entry?.error_reason || null,
    };

    if (isApiBackend) {
      try {
        const created = await apiProvider.reminders.create(record);
        if (created) setReminderHistory((prev) => [created, ...prev]);
        return { success: true, data: created };
      } catch (err) {
        // Résilience : ne jamais bloquer l'envoi sur un échec de journalisation.
        console.warn('Journalisation relance via API échouée (non bloquant):', err?.message);
        return { success: false, error: err.message };
      }
    }

    if (isUsingMock) {
      try {
        const newEntry = { id: 'rem_' + Date.now(), ...record, created_at: new Date().toISOString() };
        const updated = [newEntry, ...reminderHistory];
        setReminderHistory(updated);
        updateLocalMock('forex_reminders', updated);
        return { success: true, data: newEntry };
      } catch (err) {
        // Résilience : ne jamais bloquer l'envoi sur un échec de journalisation.
        console.error('Error logging reminder (mock):', err);
        return { success: false, error: err.message };
      }
    }

    try {
      const { data, error } = await supabase.from('reminder_history').insert([record]).select();
      if (error) throw error;
      const inserted = data?.[0];
      if (inserted) {
        setReminderHistory((prev) => [inserted, ...prev]);
      }
      return { success: true, data: inserted };
    } catch (err) {
      // Résilience (Ex. 11.4) : l'échec d'écriture ne doit pas interrompre l'envoi.
      console.error('Error logging reminder:', err);
      return { success: false, error: err.message };
    }
  };

  // Historique des relances d'un Client, trié par date décroissante (Ex. 11.5).
  const getCustomerReminders = (customerId) => {
    if (!customerId) return [];
    return reminderHistory
      .filter((r) => r && r.customer_id === customerId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  };

  // Helper: Convert any wallet amount to USD
  const convertToUSDValue = (amount, currency) => convertToUSD(amount, currency, rates);

  // Helper: Calculate total net worth in USD (wallets + active loans as recoverable assets)
  const getNetWorthUSD = () => {
    const walletsTotal = wallets.reduce((acc, w) => acc + convertToUSDValue(w.balance, w.currency), 0);
    const loansTotal = loans
      .filter(l => l.status === 'pending' || l.status === 'overdue')
      .reduce((acc, l) => acc + calculateLoanRepaymentUSD(parseFloat(l.amount), l.currency, l.interest_rate, rates), 0);
    return walletsTotal + loansTotal;
  };

  // Helper: Get total outstanding loans in USD
  const getOutstandingLoansUSD = () => {
    return loans
      .filter(l => l.status === 'pending' || l.status === 'overdue')
      .reduce((acc, l) => acc + calculateLoanRepaymentUSD(parseFloat(l.amount), l.currency, l.interest_rate, rates), 0);
  };

  // Helper: Get pending draft transactions
  const getDrafts = () => {
    return transactions.filter(t => t.status === 'draft');
  };

  // Helper: Get completed transactions only
  const getCompletedTransactions = () => {
    return transactions.filter(t => t.status === 'completed');
  };

  // ==========================================================================
  // agency-operations-expansion : agence courante, permissions, modules, CRUD
  // --------------------------------------------------------------------------
  // Couche de commodité côté React : l'autorité finale reste la RLS PostgreSQL.
  // Toute la logique de décision réutilise les modules purs déjà implémentés
  // (authorization.js, moduleEntitlements.js, agencyStats.js, finance.js, …) ;
  // ce contexte se contente de fournir l'état courant et d'orchestrer les effets
  // de bord (Supabase + repli mock localStorage, mode démo préservé).
  // _Requirements: 1.10, 2.9, 6.6, 6.7, 7.6_
  // ==========================================================================

  // Etat_Agence courant et clé de cloisonnement (Req 3.2, 5).
  const agencyState = currentAgency?.state ?? null;
  const agencyId = currentAgency?.id ?? null;

  // Compte_Employé de l'Utilisateur courant dans l'agence courante.
  const currentMembership =
    user ? employees.find((m) => m && m.user_id === user.id) || null : null;

  // Rôle effectif : membership explicite, sinon Propriétaire_Agence si l'utilisateur
  // est le propriétaire de l'agence (ou en mode démo). Sert de base au calcul des
  // permissions effectives (Req 2.2).
  const currentRole = (() => {
    if (currentMembership && isValidRole(currentMembership.role)) {
      return currentMembership.role;
    }
    if (user?.isDemo) return 'proprietaire';
    if (currentAgency && user && currentAgency.owner_id === user.id) return 'proprietaire';
    return null;
  })();

  // Ensemble effectif des Permissions = (rôle ∪ octrois) ∖ retraits (Req 2.5, 2.6).
  const effectivePerms = currentRole
    ? computeEffectivePermissions(
        currentRole,
        currentMembership?.permission_grants || [],
        currentMembership?.permission_denies || [],
      )
    : [];

  // Décision d'autorisation pour une Permission donnée (Req 2.3, 2.4, 2.9).
  const hasPermission = (permission) => {
    if (!currentRole) return false;
    return isAuthorized(
      currentRole,
      currentMembership?.permission_grants || [],
      currentMembership?.permission_denies || [],
      permission,
    );
  };

  // isAdmin (Bug A) : expose un booléen correct pour l'accès à la Console_Admin.
  // Cause racine : la fonction pure `isAdmin(profile)` de accessControl.js
  // n'accepte que `profile.role === 'admin'` et retourne `false` si elle est
  // appelée sans argument. Or, en base, le rôle des créateurs d'agence est
  // `agency_admin` ou `superadmin`, et l'UI appelait `isAdmin()` (sans profil).
  // Ce wrapper contextuel reconnait tous les cas réels :
  //   - rôle serveur `superadmin` / `agency_admin` (user.role renvoyé par /me) ;
  //   - rôle effectif d'agence `proprietaire` (Propriétaire_Agence, Req 2.2) ;
  //   - verdict de la fonction pure sur `profilAcces.role === 'admin'`
  //     (rétro-compatibilité, y compris mode démo) ;
  //   - mode démo explicite.
  // Signature tolérante : peut être appelé sans argument (`isAdmin()`) ou avec
  // un profil (`isAdmin(profilAcces)`) pour préserver les appels existants.
  const isAdmin = useCallback(
    (profile) => {
      // Priorité au profil passé en argument (AdminRoute appelle isAdmin(profilAcces)).
      if (profile && typeof profile === 'object') {
        if (isProfileAdmin(profile)) return true;
        if (profile.role === 'agency_admin' || profile.role === 'superadmin') return true;
      }
      // Rôle serveur exposé par /api/auth/me.
      if (user?.role === 'superadmin' || user?.role === 'agency_admin') return true;
      // Rôle effectif dans l'agence courante (Propriétaire_Agence).
      if (currentRole === 'proprietaire') return true;
      // Mode démo local.
      if (user?.isDemo) return true;
      // Rétro-compat : profilAcces du contexte (role mappé en 'admin' par loadProfile).
      if (isProfileAdmin(profilAcces)) return true;
      return false;
    },
    [user, currentRole, profilAcces],
  );

  // Module UTILISABLE selon l'activation à deux niveaux (Req 6.5).
  const isModuleEnabled = (moduleKey) =>
    computeModuleEnabled(moduleKey, { moduleStates, entitlements: moduleEntitlements });

  // Module ACTIVABLE par le Propriétaire_Agence (Droit_Module accordé — Req 6.2).
  const isModuleActivatable = (moduleKey) =>
    computeModuleActivatable(moduleKey, moduleEntitlements);

  // Statistique du nombre d'agences par Etat_Agence (Req 5.8). En mono-agence,
  // porte sur l'agence courante ; un Editeur_Plateforme peut passer une liste.
  const getAgenciesByState = (agencies) =>
    countAgenciesByState(Array.isArray(agencies) ? agencies : currentAgency ? [currentAgency] : []);

  // Résultats normalisés des refus côté commodité UI.
  const permissionDeniedResult = () => ({
    success: false,
    error: 'Permission insuffisante : action refusée.',
    permissionDenied: true,
  });
  const moduleDisabledResult = (moduleKey) => ({
    success: false,
    error: `Le module « ${moduleKey} » est désactivé pour l'agence.`,
    moduleDisabled: true,
  });
  const noAgencyResult = () => ({
    success: false,
    error: "Aucune agence courante : l'opération ne peut pas être enregistrée.",
    noAgency: true,
  });

  // ---- Pré-remplissage du Taux_Service par défaut d'un Client (Req 7.6) ----

  // Taux_Service par défaut défini au niveau d'un Client, ou null si absent /
  // hors bornes [0,100].
  const getClientDefaultServiceRate = (customerId) => {
    if (!customerId) return null;
    const customer = customers.find((c) => c && c.id === customerId);
    const rate = Number(customer?.default_service_rate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) return null;
    return rate;
  };

  // Valeur de Taux_Service à pré-renseigner pour une nouvelle Operation rattachée
  // à un Client (Req 7.6). Si le Module_Fonctionnel `taux_service` est désactivé,
  // renvoie 0 — aucune commission de service n'est appliquée (Req 7.8).
  const prefillServiceRate = (customerId) => {
    if (!isModuleEnabled('taux_service')) return 0;
    return getClientDefaultServiceRate(customerId) ?? 0;
  };

  // Recalcule Montant_Service et montant converti d'une Operation avec taux de
  // service optionnel (Req 7.7). Force serviceRate = 0 si le module est désactivé
  // (Req 7.8). Réutilise la fonction pure `computeOperationAmounts` de finance.js.
  const computeServiceOperation = ({ sourceAmount, exchangeRate, serviceRate, destDecimals } = {}) => {
    const effectiveRate = isModuleEnabled('taux_service') ? serviceRate : 0;
    return computeOperationAmounts({ sourceAmount, exchangeRate, serviceRate: effectiveRate, destDecimals });
  };

  // ---- Aides génériques de persistance (Supabase + repli mock localStorage) ----

  const persistCreate = async ({ table, record, localKey, list, setList, idPrefix }) => {
    if (isUsingMock) {
      const newRow = {
        id: `${idPrefix || table}_` + Date.now(),
        ...record,
        created_at: new Date().toISOString(),
      };
      const updated = [newRow, ...list];
      setList(updated);
      updateLocalMock(localKey, updated);
      return { success: true, data: newRow };
    }
    try {
      const { data, error } = await supabase.from(table).insert([record]).select();
      if (error) throw error;
      await fetchData();
      return { success: true, data: data?.[0] };
    } catch (err) {
      const denied = handleRlsDenial(err, `create:${table}`);
      if (denied) return denied;
      console.error(`Error creating ${table}:`, err);
      return { success: false, error: err.message };
    }
  };

  const persistUpdate = async ({ table, id, updates, localKey, list, setList }) => {
    if (isUsingMock) {
      let found = false;
      const updated = list.map((r) => {
        if (r.id === id) {
          found = true;
          return { ...r, ...updates };
        }
        return r;
      });
      if (!found) return { success: false, error: 'Élément introuvable' };
      setList(updated);
      updateLocalMock(localKey, updated);
      return { success: true };
    }
    try {
      const { data, error } = await supabase.from(table).update(updates).eq('id', id).select();
      if (error) throw error;
      await fetchData();
      return { success: true, data };
    } catch (err) {
      const denied = handleRlsDenial(err, `update:${table}`);
      if (denied) return denied;
      console.error(`Error updating ${table}:`, err);
      return { success: false, error: err.message };
    }
  };

  const persistDelete = async ({ table, id, localKey, list, setList }) => {
    if (isUsingMock) {
      const updated = list.filter((r) => r.id !== id);
      setList(updated);
      updateLocalMock(localKey, updated);
      return { success: true };
    }
    try {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      await fetchData();
      return { success: true };
    } catch (err) {
      const denied = handleRlsDenial(err, `delete:${table}`);
      if (denied) return denied;
      console.error(`Error deleting ${table}:`, err);
      return { success: false, error: err.message };
    }
  };

  // ---- Activation des Modules_Fonctionnels (Req 6.6, 6.7) ----

  // Active ou désactive un Module_Fonctionnel pour l'agence courante, avec
  // persistance et repli. Refuse l'activation d'un Module_Additionnel non
  // habilité (Req 4.6, 6.2). En cas d'échec de persistance, l'état reste
  // inchangé et un message est renvoyé (Req 6.7).
  const setModuleEnabled = async (moduleKey, enabled) => {
    if (!hasPermission('modules.gerer')) return permissionDeniedResult();
    const wantEnabled = enabled === true;

    // Activation d'un Module_Additionnel exige un Droit_Module (Req 4.6, 6.2).
    if (wantEnabled && ADDITIONAL_MODULES.includes(moduleKey) && !isModuleActivatable(moduleKey)) {
      return {
        success: false,
        error: "Ce module doit d'abord être habilité par l'éditeur de la plateforme.",
        notEntitled: true,
      };
    }

    const next = { ...moduleStates, [moduleKey]: wantEnabled };

    if (isApiBackend) {
      try {
        await apiProvider.modules.setState(moduleKey, wantEnabled);
        setModuleStates(next);
        return { success: true };
      } catch (err) {
        const denied = handleRlsDenial(err, 'setModuleEnabled:api');
        if (denied) return denied;
        console.error('Erreur API Fastify (setModuleEnabled):', err);
        return {
          success: false,
          error: "Échec de l'enregistrement de l'état du module. Veuillez réessayer.",
          persistError: true,
        };
      }
    }

    if (isUsingMock) {
      setModuleStates(next);
      updateLocalMock('forex_module_states', next);
      return { success: true };
    }
    if (!isValidAgencyId(agencyId)) return noAgencyResult();
    try {
      const { error } = await supabase
        .from('module_states')
        .upsert(
          { agency_id: agencyId, module_key: moduleKey, enabled: wantEnabled },
          { onConflict: 'agency_id,module_key' },
        );
      if (error) throw error;
      setModuleStates(next);
      return { success: true };
    } catch (err) {
      const denied = handleRlsDenial(err, 'setModuleEnabled');
      if (denied) return denied;
      // Req 6.7 : échec de persistance -> message, état inchangé.
      console.error('Error persisting module state:', err);
      return {
        success: false,
        error: "Échec de l'enregistrement de l'état du module. Veuillez réessayer.",
        persistError: true,
      };
    }
  };

  // Accorde ou révoque un Droit_Module pour une agence (réservé à
  // l'Editeur_Plateforme — Req 4.4, 4.5). Persistance + repli mock.
  const setModuleEntitlement = async (targetAgencyId, moduleKey, granted) => {
    if (!profilAcces?.is_platform_editor && !user?.isDemo) {
      return permissionDeniedResult();
    }
    if (!ADDITIONAL_MODULES.includes(moduleKey)) {
      return { success: false, error: 'Module additionnel inconnu.' };
    }
    const wantGranted = granted === true;
    const next = { ...moduleEntitlements, [moduleKey]: wantGranted };
    const targetId = targetAgencyId || agencyId || currentAgency?.id || null;

    // Maintient à jour la carte des Droits_Module par Agence exposée à la
    // supervision plateforme (Req 4.2, 5.1).
    const syncPlatformEntitlement = (aid) => {
      if (!aid) return;
      setPlatformModuleEntitlements((prev) => {
        const current = prev?.[aid] || {};
        return { ...prev, [aid]: { ...current, [moduleKey]: wantGranted } };
      });
    };

    if (isUsingMock) {
      setModuleEntitlements(next);
      updateLocalMock('forex_module_entitlements', next);
      syncPlatformEntitlement(targetId);
      // Révocation : le module devient immédiatement non utilisable (Req 4.5).
      return { success: true };
    }
    const aid = targetAgencyId || agencyId;
    if (!isValidAgencyId(aid)) return noAgencyResult();
    try {
      const { error } = await supabase
        .from('module_entitlements')
        .upsert(
          {
            agency_id: aid,
            module_key: moduleKey,
            granted: wantGranted,
            granted_by: user?.id || null,
            granted_at: wantGranted ? new Date().toISOString() : null,
          },
          { onConflict: 'agency_id,module_key' },
        );
      if (error) throw error;
      if (aid === agencyId) setModuleEntitlements(next);
      syncPlatformEntitlement(aid);
      return { success: true };
    } catch (err) {
      const denied = handleRlsDenial(err, 'setModuleEntitlement');
      if (denied) return denied;
      console.error('Error persisting module entitlement:', err);
      return { success: false, error: err.message };
    }
  };

  // Suspend ou réactive une Agence (cycle de vie réservé à l'Editeur_Plateforme —
  // Req 5.2, 5.3, 5.5). `nextState` ∈ { 'active', 'suspendue' } (Etat_Agence).
  // Persistance dans `agencies` + repli mock ; met à jour la liste de supervision
  // et l'agence courante si elle est concernée.
  const setAgencyState = async (targetAgencyId, nextState) => {
    if (!profilAcces?.is_platform_editor && !user?.isDemo) {
      return permissionDeniedResult();
    }
    if (!AGENCY_STATES.includes(nextState)) {
      return { success: false, error: 'Etat_Agence invalide.' };
    }
    const aid = targetAgencyId || agencyId;
    if (!isValidAgencyId(aid)) return noAgencyResult();

    const applyLocalState = () => {
      setPlatformAgencies((prev) =>
        (Array.isArray(prev) ? prev : []).map((a) =>
          a?.id === aid ? { ...a, state: nextState } : a,
        ),
      );
      setCurrentAgency((prev) => (prev?.id === aid ? { ...prev, state: nextState } : prev));
    };

    if (isUsingMock) {
      applyLocalState();
      // Reflète l'état de l'agence courante dans le repli localStorage.
      if (aid === (currentAgency?.id ?? null)) {
        updateLocalMock('forex_agency', { ...(currentAgency || MOCK_AGENCY), state: nextState });
      }
      return { success: true };
    }
    try {
      const { error } = await supabase
          .from('agencies')
          .update({ state: nextState })
          .eq('id', aid);
      if (error) throw error;
      applyLocalState();
      return { success: true };
    } catch (err) {
      const denied = handleRlsDenial(err, 'setAgencyState');
      if (denied) return denied;
      console.error('Error persisting agency state:', err);
      return { success: false, error: err.message };
    }
  };

  const createAgency = async (opts) => {
    const name = typeof opts === 'string' ? opts : (opts?.name || '');
    const slug = typeof opts === 'object' ? (opts?.slug || null) : null;
    const description = typeof opts === 'object' ? (opts?.description || null) : null;
    if (!name.trim()) return { success: false, error: "Le nom de l'agence est requis." };
    if (isApiBackend) {
      try {
        const res = await apiProvider.auth.createAgency(name);
        if (!res.success) return { success: false, error: res.error || "Échec de la création de l'agence." };
        // L'agence active a changé côté serveur (cookie ré-émis) : on rafraîchit
        // la session puis toutes les données (agence courante incluse).
        try {
          const sess = await apiProvider.auth.getSession();
          if (sess && sess !== SESSION_UNKNOWN) setUser(sess);
        } catch { /* la session sera resynchronisée au prochain bootstrap */ }
        await fetchData();
        return { success: true };
      } catch (err) {
        console.error('Erreur API Fastify (createAgency):', err);
        return { success: false, error: err.message };
      }
    }
    if (isUsingMock) {
      const newAgency = {
        id: `agency_${Date.now()}`,
        name,
        slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        description,
        state: 'active',
        owner_id: user?.id || 'demo-owner',
        created_at: new Date().toISOString()
      };
      const updatedAgencies = [...platformAgencies, newAgency];
      setPlatformAgencies(updatedAgencies);
      updateLocalMock('forex_agencies_list', updatedAgencies);
      setCurrentAgency(newAgency);
      return { success: true, data: newAgency };
    }
    try {
      const insertData = { name, owner_id: user.id, state: 'active' };
      if (slug) insertData.slug = slug;
      if (description) insertData.description = description;
      const { data, error } = await supabase.from('agencies').insert([insertData]).select();
      if (error) throw error;
      const agencyRes = await supabase.from('agencies').select('*').order('created_at', { ascending: true });
      if (!agencyRes.error) {
        setPlatformAgencies(agencyRes.data || []);
      }
      const created = data?.[0];
      if (created) {
        setCurrentAgency(created);
      }
      return { success: true, data: created };
    } catch (err) {
      console.error('Error creating agency:', err);
      return { success: false, error: err.message };
    }
  };

  // ---- Transferts d'argent (Req 8) ----

  const createTransfer = async (transfer = {}) => {
    if (!hasPermission('services.vendre')) return permissionDeniedResult();
    if (!isModuleEnabled('transfert_argent')) return moduleDisabledResult('transfert_argent');

    const method = transferMethods.find((m) => m.id === transfer.method_id);
    const v = validateTransfer({
      amount: transfer.amount,
      methodId: transfer.method_id,
      methodLabel: method?.label,
      methodActive: method?.is_active,
      customLabel: transfer.custom_method_label,
    });
    if (!v.ok) return { success: false, error: v.error, field: v.field };

    if (!isValidAgencyId(agencyId)) return noAgencyResult();
    const record = assignAgencyId(
      {
        customer_id: transfer.customer_id || null,
        method_id: transfer.method_id,
        custom_method_label: transfer.custom_method_label || null,
        amount: Number(transfer.amount),
        commission: Number(transfer.commission) || 0,
      },
      agencyId,
    );
    return persistCreate({
      table: 'transfers',
      record,
      localKey: 'forex_transfers',
      list: transfers,
      setList: setTransfers,
      idPrefix: 'tr',
    });
  };

  const deleteTransfer = (id) =>
    persistDelete({ table: 'transfers', id, localKey: 'forex_transfers', list: transfers, setList: setTransfers });

  // ---- Abonnements TV (Req 10) ----

  const createSubscription = async (sub = {}) => {
    if (!hasPermission('services.vendre')) return permissionDeniedResult();
    if (!isModuleEnabled('abonnements')) return moduleDisabledResult('abonnements');

    const provider = subscriptionProviders.find((p) => p.id === sub.provider_id);
    const amountPaid = Number(sub.amount_paid);
    const v = validateSubscription({
      providerActive: provider?.is_active,
      plan: sub.plan,
      amount: amountPaid,
      renewalDate: sub.renewal_date,
      today: new Date(),
    });
    if (!v.ok) return { success: false, error: v.error, field: v.field };

    if (!isValidAgencyId(agencyId)) return noAgencyResult();
    const record = assignAgencyId(
      {
        customer_id: sub.customer_id || null,
        provider_id: sub.provider_id,
        plan: sub.plan,
        amount_paid: amountPaid,
        commission: Number(sub.commission) || 0,
        renewal_date: sub.renewal_date,
        renewal_threshold_days: Number(sub.renewal_threshold_days) || 3,
        marketing_consent: sub.marketing_consent === true,
        reminder_history: [],
      },
      agencyId,
    );
    return persistCreate({
      table: 'subscriptions',
      record,
      localKey: 'forex_subscriptions',
      list: subscriptions,
      setList: setSubscriptions,
      idPrefix: 'sub',
    });
  };

  const updateSubscription = (id, updates) =>
    persistUpdate({ table: 'subscriptions', id, updates, localKey: 'forex_subscriptions', list: subscriptions, setList: setSubscriptions });

  const deleteSubscription = (id) =>
    persistDelete({ table: 'subscriptions', id, localKey: 'forex_subscriptions', list: subscriptions, setList: setSubscriptions });

  // ---- Réservations de billets d'avion (Req 12) ----

  const createFlightBooking = async (booking = {}) => {
    if (!hasPermission('services.vendre')) return permissionDeniedResult();
    if (!isModuleEnabled('billets_avion')) return moduleDisabledResult('billets_avion');

    const v = validateFlightBooking({
      ticketNumber: booking.ticket_number,
      flightDate: booking.flight_at,
      agencyPrice: booking.agency_price,
      customerPrice: booking.customer_price,
    });
    if (!v.ok) return { success: false, error: v.error, field: v.field };

    if (!isValidAgencyId(agencyId)) return noAgencyResult();
    const profit = computeFlightProfit(booking.customer_price, booking.agency_price);
    const record = assignAgencyId(
      {
        customer_name: booking.customer_name,
        ticket_number: booking.ticket_number,
        airline: booking.airline || null,
        departure_airport: booking.departure_airport || null,
        arrival_airport: booking.arrival_airport || null,
        destination: booking.destination || null,
        flight_at: booking.flight_at,
        agency_price: Number(booking.agency_price),
        customer_price: Number(booking.customer_price),
        profit,
        customer_whatsapp: booking.customer_whatsapp || null,
        flight_lead_time_hours: Number(booking.flight_lead_time_hours) || 48,
        status: booking.status || 'reservé',
        reminder_history: [],
      },
      agencyId,
    );
    return persistCreate({
      table: 'flight_bookings',
      record,
      localKey: 'forex_flight_bookings',
      list: flightBookings,
      setList: setFlightBookings,
      idPrefix: 'fb',
    });
  };

  const updateFlightBooking = (id, updates) =>
    persistUpdate({ table: 'flight_bookings', id, updates, localKey: 'forex_flight_bookings', list: flightBookings, setList: setFlightBookings });

  const deleteFlightBooking = (id) =>
    persistDelete({ table: 'flight_bookings', id, localKey: 'forex_flight_bookings', list: flightBookings, setList: setFlightBookings });

  // ---- Commandes à distance (Req 14) ----
  // Une Commande_Distante exige une Confirmation humaine avant enregistrement
  // définitif (Req 14.7) : la mise à jour d'état est gardée par `services.vendre`.

  const updateRemoteOrderState = async (id, state) => {
    if (!hasPermission('services.vendre')) return permissionDeniedResult();
    const allowed = ['à_traiter', 'confirmée', 'rejetée'];
    if (!allowed.includes(state)) {
      return { success: false, error: "État de commande invalide." };
    }
    return persistUpdate({
      table: 'remote_orders',
      id,
      updates: { state },
      localKey: 'forex_remote_orders',
      list: remoteOrders,
      setList: setRemoteOrders,
    });
  };

  // ---- Liens de commande à distance (Req 14) ----

  const createOrderLink = async (expiresInHours = 24) => {
    if (!hasPermission('services.vendre')) return permissionDeniedResult();
    if (isApiBackend) {
      try {
        const link = await apiProvider.orderLinks.create(expiresInHours);
        if (link) setOrderLinks((prev) => [link, ...prev]);
        return { success: true, link };
      } catch (err) {
        const denied = handleRlsDenial(err, 'createOrderLink:api');
        if (denied) return denied;
        console.error('Erreur API Fastify (createOrderLink):', err);
        return { success: false, error: err.message };
      }
    }
    const token = generateOrderToken();
    const expiresAt = expiresInHours
      ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString()
      : null;

    if (!supabase || user?.isDemo) {
      const newLink = {
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
        agency_id: agencyId || 'mock-agency-id',
        token,
        revoked: false,
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
      };
      const current = readMock('forex_order_links', []);
      const next = [newLink, ...current];
      writeMock('forex_order_links', next);
      setOrderLinks(next);
      return { success: true, link: newLink };
    }

    try {
      const { data, error } = await supabase
        .from('order_links')
        .insert({
          agency_id: agencyId,
          token,
          expires_at: expiresAt,
        })
        .select()
        .single();
      if (error) throw error;
      setOrderLinks((prev) => [data, ...prev]);
      return { success: true, link: data };
    } catch (err) {
      console.error('Error creating order link:', err.message);
      return { success: false, error: err.message };
    }
  };

  const revokeOrderLink = async (id) => {
    if (!hasPermission('services.vendre')) return permissionDeniedResult();
    if (isApiBackend) {
      try {
        await apiProvider.orderLinks.revoke(id);
        setOrderLinks((prev) => prev.map((l) => (l.id === id ? { ...l, revoked: true } : l)));
        return { success: true };
      } catch (err) {
        const denied = handleRlsDenial(err, 'revokeOrderLink:api');
        if (denied) return denied;
        console.error('Erreur API Fastify (revokeOrderLink):', err);
        return { success: false, error: err.message };
      }
    }
    if (!supabase || user?.isDemo) {
      const current = readMock('forex_order_links', []);
      const next = current.map(l => l.id === id ? { ...l, revoked: true } : l);
      writeMock('forex_order_links', next);
      setOrderLinks(next);
      return { success: true };
    }
    try {
      const { error } = await supabase
        .from('order_links')
        .update({ revoked: true })
        .eq('id', id);
      if (error) throw error;
      setOrderLinks((prev) => prev.map((l) => (l.id === id ? { ...l, revoked: true } : l)));
      return { success: true };
    } catch (err) {
      console.error('Error revoking order link:', err.message);
      return { success: false, error: err.message };
    }
  };

  // ---- Comptes_Employés et Invitations_Collaborateur (Req 1) ----

  // Modifie le Rôle d'un Compte_Employé (Req 1.8). Rejette un rôle hors ensemble
  // fermé (Req 1.5, 2.1). Gardé par `employes.gerer` (Req 1.1, 1.11).
  const updateMemberRole = async (memberId, role) => {
    if (!hasPermission('employes.gerer')) return permissionDeniedResult();
    if (!isValidRole(role)) {
      return { success: false, error: 'Le rôle est invalide.', field: 'role' };
    }
    return persistUpdate({
      table: 'agency_members',
      id: memberId,
      updates: { role },
      localKey: 'forex_employees',
      list: employees,
      setList: setEmployees,
    });
  };

  // Met à jour les octrois/retraits individuels de permissions d'un membre
  // (Req 2.5, 2.6). Gardé par `employes.gerer`.
  const updateMemberPermissions = async (memberId, { grants, denies } = {}) => {
    if (!hasPermission('employes.gerer')) return permissionDeniedResult();
    const updates = {};
    if (Array.isArray(grants)) updates.permission_grants = grants;
    if (Array.isArray(denies)) updates.permission_denies = denies;
    return persistUpdate({
      table: 'agency_members',
      id: memberId,
      updates,
      localKey: 'forex_employees',
      list: employees,
      setList: setEmployees,
    });
  };

  // Active ou désactive un Compte_Employé (Req 1.9). `activation_state` ∈
  // { 'actif', 'désactivé' }. Gardé par `employes.gerer`.
  const setMemberActivation = async (memberId, activationState) => {
    if (!hasPermission('employes.gerer')) return permissionDeniedResult();
    if (activationState !== 'actif' && activationState !== 'désactivé') {
      return { success: false, error: "État d'activation invalide." };
    }
    return persistUpdate({
      table: 'agency_members',
      id: memberId,
      updates: { activation_state: activationState },
      localKey: 'forex_employees',
      list: employees,
      setList: setEmployees,
    });
  };

  // Crée une Invitation_Collaborateur à l'état `en_attente` (Req 1.2). Valide
  // l'e-mail (Req 1.4), le rôle (Req 1.5) et l'unicité de l'e-mail parmi les
  // invitations en attente et les comptes actifs de l'agence (Req 1.6). Gardé
  // par `employes.gerer` (Req 1.1, 1.11). L'envoi effectif de l'e-mail relève
  // de l'Edge Function `agency-invite`.
  const createInvitation = async (invite = {}) => {
    if (!hasPermission('employes.gerer')) return permissionDeniedResult();
    if (!isValidInvitationEmail(invite.email)) {
      return { success: false, error: "L'adresse e-mail est invalide.", field: 'email' };
    }
    if (!isValidRole(invite.role)) {
      return { success: false, error: 'Le rôle est invalide.', field: 'role' };
    }
    const existingEmails = [
      ...invitations
        .filter((i) => i && i.state === 'en_attente' && i.agency_id === agencyId)
        .map((i) => i.email),
      ...employees
        .filter((m) => m && m.activation_state === 'actif' && m.agency_id === agencyId)
        .map((m) => m.email),
    ];
    if (isDuplicateInvitationEmail(invite.email, existingEmails)) {
      return { success: false, error: "L'adresse e-mail est déjà utilisée.", field: 'email' };
    }
    if (!isValidAgencyId(agencyId)) return noAgencyResult();
    const record = assignAgencyId(
      {
        email: invite.email,
        role: invite.role,
        permission_grants: Array.isArray(invite.permission_grants) ? invite.permission_grants : [],
        permission_denies: Array.isArray(invite.permission_denies) ? invite.permission_denies : [],
        state: 'en_attente',
        accepted_at: null,
      },
      agencyId,
    );
    return persistCreate({
      table: 'agency_invitations',
      record,
      localKey: 'forex_invitations',
      list: invitations,
      setList: setInvitations,
      idPrefix: 'inv',
    });
  };

  // Accepte une Invitation_Collaborateur `en_attente` non expirée (Req 1.3).
  // Au-delà de 168 h après création, l'invitation est marquée `expirée` et
  // aucun compte n'est créé (Req 1.7). La création/activation effective du
  // Compte_Employé côté Auth relève de l'Edge Function `agency-invite`.
  const acceptInvitation = async (invitationId) => {
    const invite = invitations.find((i) => i && i.id === invitationId);
    if (!invite) return { success: false, error: 'Invitation introuvable.' };
    if (invite.state !== 'en_attente') {
      return { success: false, error: "L'invitation n'est plus en attente." };
    }
    const createdMs = new Date(invite.created_at).getTime();
    if (isInvitationExpired(createdMs, Date.now())) {
      await persistUpdate({
        table: 'agency_invitations',
        id: invitationId,
        updates: { state: 'expirée' },
        localKey: 'forex_invitations',
        list: invitations,
        setList: setInvitations,
      });
      return { success: false, error: "L'invitation a expiré.", expired: true };
    }
    return persistUpdate({
      table: 'agency_invitations',
      id: invitationId,
      updates: { state: 'acceptée', accepted_at: new Date().toISOString() },
      localKey: 'forex_invitations',
      list: invitations,
      setList: setInvitations,
    });
  };

  // ---- Catalogues administrables (Req 9, 11) ----
  // L'administration des catalogues est réservée à l'Editeur_Plateforme (Req 9.2,
  // 11.2) ; la validation fine des libellés et de la permanence de « Autre » est
  // assurée par les écrans via `catalogs.js`.

  const createTransferMethod = async (method = {}) => {
    if (!profilAcces?.is_platform_editor && !user?.isDemo) return permissionDeniedResult();
    const record = {
      agency_id: method.agency_id ?? null,
      label: method.label,
      is_active: method.is_active !== undefined ? method.is_active === true : true,
      is_permanent: method.is_permanent === true,
    };
    return persistCreate({
      table: 'transfer_methods',
      record,
      localKey: 'forex_transfer_methods',
      list: transferMethods,
      setList: setTransferMethods,
      idPrefix: 'tm',
    });
  };

  const updateTransferMethod = async (id, updates) => {
    if (!profilAcces?.is_platform_editor && !user?.isDemo) return permissionDeniedResult();
    return persistUpdate({
      table: 'transfer_methods',
      id,
      updates,
      localKey: 'forex_transfer_methods',
      list: transferMethods,
      setList: setTransferMethods,
    });
  };

  const createSubscriptionProvider = async (provider = {}) => {
    if (!profilAcces?.is_platform_editor && !user?.isDemo) return permissionDeniedResult();
    const record = {
      agency_id: provider.agency_id ?? null,
      label: provider.label,
      is_active: provider.is_active !== undefined ? provider.is_active === true : true,
    };
    return persistCreate({
      table: 'subscription_providers',
      record,
      localKey: 'forex_subscription_providers',
      list: subscriptionProviders,
      setList: setSubscriptionProviders,
      idPrefix: 'sp',
    });
  };

  const updateSubscriptionProvider = async (id, updates) => {
    if (!profilAcces?.is_platform_editor && !user?.isDemo) return permissionDeniedResult();
    return persistUpdate({
      table: 'subscription_providers',
      id,
      updates,
      localKey: 'forex_subscription_providers',
      list: subscriptionProviders,
      setList: setSubscriptionProviders,
    });
  };

  return (
    <AppContext.Provider value={{
      wallets,
      rates,
      transactions,
      expenses,
      customers,
      loans,
      debts,
      templates,
      reminderHistory,
      loading,
      isUsingMock,
      user,
      hasCredentials,
      isApiBackend,
      profilAcces,
      profileStatus,
      accessError,
      clearAccessError: () => setAccessError(null),
      loadProfile,
      submitPaymentProof,
      isAccessGranted,
      isAdmin: isAdmin, // Bug A — wrapper contextuel (booléen), pas la fonction pure
      signUp,
      signIn,
      signInWithGoogle,
      logOut,
      loginAsDemo,
      addTransaction,
      addExpense,
      deleteExpense,
      updateRates,
      convertToUSD: convertToUSDValue,
      getNetWorthUSD,
      getOutstandingLoansUSD,
      getDrafts,
      getCompletedTransactions,
      confirmDraft,
      deleteDraft,
      createWallet,
      updateWallet,
      deleteWallet,
      adjustWalletBalance,
      createCustomer,
      updateCustomer,
      findOrCreateCustomer,
      getCustomerHistory,
      createLoan,
      updateLoanStatus,
      createDebt,
      updateDebtStatus,
      getDebtTotals,
      createTemplate,
      updateTemplate,
      deleteTemplate,
      fetchTemplates,
      logReminder,
      getCustomerReminders,
      // --- agency-operations-expansion : agence courante, permissions, modules ---
      currentAgency,
      agencyState,
      agencyId,
      currentMembership,
      currentRole,
      effectivePermissions: effectivePerms,
      hasPermission,
      ALL_PERMISSIONS: PERMISSIONS,
      moduleStates,
      moduleEntitlements,
      isModuleEnabled,
      isModuleActivatable,
      setModuleEnabled,
      setModuleEntitlement,
      setAgencyState,
      switchAgency: setCurrentAgency,
      createAgency,
      platformAgencies,
      platformModuleEntitlements,
      getAgenciesByState,
      // Taux_Service par défaut client (Req 7.6) + recalcul (Req 7.7/7.8)
      getClientDefaultServiceRate,
      prefillServiceRate,
      computeServiceOperation,
      // Données des nouvelles entités
      transfers,
      subscriptions,
      flightBookings,
      remoteOrders,
      employees,
      invitations,
      transferMethods,
      subscriptionProviders,
      orderLinks,
      // CRUD des nouvelles entités
      createTransfer,
      deleteTransfer,
      createSubscription,
      updateSubscription,
      deleteSubscription,
      createFlightBooking,
      updateFlightBooking,
      deleteFlightBooking,
      updateRemoteOrderState,
      createOrderLink,
      revokeOrderLink,
      createInvitation,
      acceptInvitation,
      updateMemberRole,
      updateMemberPermissions,
      setMemberActivation,
      createTransferMethod,
      updateTransferMethod,
      createSubscriptionProvider,
      updateSubscriptionProvider,
      refreshData: fetchData,
      resetMockData,
      language,
      setLanguage
    }}>
      {children}
    </AppContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useApp = () => useContext(AppContext);
