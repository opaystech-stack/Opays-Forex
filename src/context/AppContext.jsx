import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi, walletApi, transactionApi, customerApi, loanApi, expenseApi, employeeApi, transferApi, subscriptionApi, ticketApi, remoteOrderApi, agencyApi, userApi } from '../services/api';
import { calculateLoanRepaymentUSD, convertToUSD } from '../utils/finance';

const AppContext = createContext();

const MOCK_WALLETS = [
  { id: 'w1', name: 'Caisse USD Cash', currency: 'USD', type: 'cash', balance: 1200.00 },
  { id: 'w2', name: 'Caisse UGX Cash', currency: 'UGX', type: 'cash', balance: 3650000.00 },
  { id: 'w3', name: 'Airtel Money RDC (USD)', currency: 'USD', type: 'mobile_money', balance: 800.00 },
  { id: 'w4', name: 'M-Pesa Kenya (KES)', currency: 'KES', type: 'mobile_money', balance: 35000.00 },
  { id: 'w5', name: 'MTN Uganda (UGX)', currency: 'UGX', type: 'mobile_money', balance: 1500000.00 },
  { id: 'w6', name: 'Caisse Euro Cash', currency: 'EUR', type: 'cash', balance: 450.00 },
  { id: 'w7', name: 'Orange Money Cameroun (XAF)', currency: 'XAF', type: 'mobile_money', balance: 250000.00 },
];

const MOCK_RATES = [
  { currency: 'UGX', rate_to_usd: 3750.00 },
  { currency: 'KES', rate_to_usd: 130.00 },
  { currency: 'CDF', rate_to_usd: 2500.00 },
  { currency: 'TZS', rate_to_usd: 2600.00 },
  { currency: 'BIF', rate_to_usd: 2850.00 },
  { currency: 'RWF', rate_to_usd: 1380.00 },
  { currency: 'EUR', rate_to_usd: 0.92 },
  { currency: 'XAF', rate_to_usd: 600.00 },
];

const MOCK_CUSTOMERS = [
  { id: 'c1', name: 'Jean Kabamba', phone: '+243****8271', created_at: '2026-06-25T10:00:00Z' },
  { id: 'c2', name: 'Mama Sarah', phone: '+256****1039', created_at: '2026-06-25T10:00:00Z' },
  { id: 'c3', name: 'Joseph Mwamba', phone: '+254****3344', created_at: '2026-06-25T10:00:00Z' }
];

const MOCK_LOANS = [
  { id: 'l1', customer_id: 'c1', wallet_id: 'w1', amount: 500.00, currency: 'USD', interest_rate: 10.00, due_date: '2026-07-02', status: 'pending', note: 'Prêt pour fonds de roulement magasin', contract_image_url: null, created_at: '2026-06-23T10:00:00Z' },
  { id: 'l2', customer_id: 'c2', wallet_id: 'w2', amount: 1000000.00, currency: 'UGX', interest_rate: 0.00, due_date: '2026-06-24', status: 'pending', note: 'Urgence familiale', contract_image_url: null, created_at: '2026-06-20T10:00:00Z' }
];

const MOCK_TRANSACTIONS = [
  { id: 't1', source_wallet_id: 'w1', dest_wallet_id: 'w2', source_amount: 100.00, dest_amount: 365000, exchange_rate: 3650, fee: 0.00, profit_usd: 2.67, status: 'completed', transaction_id: 'TXN-A1293041', note: 'Client WhatsApp - Paul', timestamp: '2026-06-25T10:00:00Z' },
  { id: 't2', source_wallet_id: 'w3', dest_wallet_id: 'w5', source_amount: 150.00, dest_amount: 550000, exchange_rate: 3666.67, fee: 3.00, fee_wallet_id: 'w3', profit_usd: 0.33, status: 'completed', transaction_id: 'TXN-M9847291', note: 'Transfert Kinshasa - Kampala', timestamp: '2026-06-25T09:00:00Z' },
  { id: 't_draft_1', source_wallet_id: 'w1', dest_wallet_id: 'w4', source_amount: 50.00, dest_amount: 6400, exchange_rate: 128, fee: 1.00, fee_wallet_id: 'w1', profit_usd: 0.77, status: 'draft', transaction_id: 'MPESA-KE-7729103', receipt_text: 'M-PESA Confirmed. Ksh6,400 sent to...', note: '📱 Importé via WhatsApp - Client Joseph', timestamp: '2026-06-25T11:00:00Z' }
];

const MOCK_EXPENSES = [
  { id: 'e1', wallet_id: 'w2', amount: 15000.00, is_business: true, category: 'Transport', note: 'Transport Cash Goma', timestamp: '2026-06-25T06:00:00Z' },
  { id: 'e2', wallet_id: 'w1', amount: 20.00, is_business: false, category: 'Famille', note: 'Repas midi et crédit tel', timestamp: '2026-06-25T00:00:00Z' },
];

const getLocalMock = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const updateLocalMock = (key, data) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // ignore storage errors
  }
};

const makeId = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 11)}_${Date.now()}`;

export const AppProvider = ({ children }) => {
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
      // ignore storage errors
    }
  }, [language]);

  const [wallets, setWallets] = useState([]);
  const [rates, setRates] = useState(MOCK_RATES);
  const [transactions, setTransactions] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loans, setLoans] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [remoteOrders, setRemoteOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [isUsingMock, setIsUsingMock] = useState(false);
  const [user, setUser] = useState(null);
  const [userAgencies, setUserAgencies] = useState([]);

  // Check session on load
  useEffect(() => {
    let cancelled = false;
    authApi.me()
      .then(async res => {
        if (cancelled) return;
        if (res.success && res.user) {
          setUser({ ...res.user, agencyId: res.user.agencyId });
          if (!res.user.isDemo) {
            try {
              const agenciesRes = await agencyApi.myList();
              setUserAgencies(agenciesRes.data || []);
            } catch (e) {
              console.error('Failed to load user agencies:', e);
            }
          }
        }
        setAuthChecked(true);
      })
      .catch(() => {
        if (cancelled) return;
        setAuthChecked(true);
      });
    return () => { cancelled = true; };
  }, []);

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);

    if (!user) {
      setLoading(false);
      return;
    }

    if (user.isDemo) {
      setWallets(getLocalMock('forex_wallets', MOCK_WALLETS));
      setTransactions(getLocalMock('forex_txns', MOCK_TRANSACTIONS));
      setExpenses(getLocalMock('forex_expenses', MOCK_EXPENSES));
      setCustomers(getLocalMock('forex_customers', MOCK_CUSTOMERS));
      setLoans(getLocalMock('forex_loans', MOCK_LOANS));
      setIsUsingMock(true);
      setLoading(false);
      return;
    }

    try {
      const [wRes, tRes, eRes, cRes, lRes, empRes, trRes, subRes, tkRes, roRes] = await Promise.all([
        walletApi.list(),
        transactionApi.list({ limit: 200 }),
        expenseApi.list(),
        customerApi.list(),
        loanApi.list(),
        employeeApi.list(),
        transferApi.list(),
        subscriptionApi.list(),
        ticketApi.list(),
        remoteOrderApi.list(),
      ]);

      setWallets((wRes.data || []).map(w => ({ ...w, currency: w.currencyCode, balance: parseFloat(w.balance) })));
      setTransactions((tRes.data || []).map(t => ({ ...t, source_wallet_id: t.sourceWalletId, dest_wallet_id: t.destWalletId, source_amount: t.sourceAmount, dest_amount: t.destAmount, exchange_rate: t.exchangeRate, fee_wallet_id: t.feeWalletId, profit_usd: t.profitUsd, transaction_id: t.transactionId, receipt_text: t.receiptText })));
      setExpenses((eRes.data || []).map(e => ({ ...e, wallet_id: e.walletId, is_business: e.isBusiness })));
      setCustomers(cRes.data || []);
      setLoans((lRes.data || []).map(l => ({ ...l, customer_id: l.customerId, wallet_id: l.walletId, currency: l.currencyCode, interest_rate: l.interestRate, contract_image_url: l.contractImageUrl })));
      setEmployees(empRes.data || []);
      setTransfers(trRes.data || []);
      setSubscriptions(subRes.data || []);
      setTickets(tkRes.data || []);
      setRemoteOrders(roRes.data || []);
      setIsUsingMock(false);
    } catch (error) {
      console.error('Error fetching API data, falling back to local mock data:', error);
      setIsUsingMock(true);
      setWallets(getLocalMock('forex_wallets', MOCK_WALLETS));
      setTransactions(getLocalMock('forex_txns', MOCK_TRANSACTIONS));
      setExpenses(getLocalMock('forex_expenses', MOCK_EXPENSES));
      setCustomers(getLocalMock('forex_customers', MOCK_CUSTOMERS));
      setLoans(getLocalMock('forex_loans', MOCK_LOANS));
      setEmployees(getLocalMock('forex_employees', []));
      setTransfers(getLocalMock('forex_transfers', []));
      setSubscriptions(getLocalMock('forex_subscriptions', []));
      setTickets(getLocalMock('forex_tickets', []));
      setRemoteOrders(getLocalMock('forex_remote_orders', []));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authChecked) {
      const id = setTimeout(() => fetchData(), 0);
      return () => clearTimeout(id);
    }
  }, [authChecked, fetchData]);

  const signUp = async (email, password, extra = {}) => {
    try {
      const res = await authApi.register({ email, password, firstName: extra.firstName, lastName: extra.lastName, agencyName: extra.agencyName });
      if (!res.success) return { success: false, error: res.error };
      setUser({ ...res.user, agencyId: res.user.agencyId });
      if (!res.user.isDemo) {
        try {
          const agenciesRes = await agencyApi.myList();
          setUserAgencies(agenciesRes.data || []);
        } catch (e) {
          console.error('Failed to load user agencies:', e);
        }
      }
      await fetchData(true);
      return { success: true, data: res };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const signIn = async (email, password) => {
    try {
      const res = await authApi.login({ email, password });
      if (!res.success) return { success: false, error: res.error };
      setUser({ ...res.user, agencyId: res.user.agencyId });
      if (!res.user.isDemo) {
        try {
          const agenciesRes = await agencyApi.myList();
          setUserAgencies(agenciesRes.data || []);
        } catch (e) {
          console.error('Failed to load user agencies:', e);
        }
      }
      await fetchData(true);
      return { success: true, data: res };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const signInWithGoogle = async () => {
    return { success: false, error: 'Google OAuth non configuré. Utilisez email/mot de passe.' };
  };

  const switchAgency = async (agencyId) => {
    if (isUsingMock || user?.isDemo) {
      return { success: false, error: 'Switch agency not available in demo mode' };
    }
    try {
      await userApi.switchAgency(agencyId);
      const agenciesRes = await agencyApi.myList();
      setUserAgencies(agenciesRes.data || []);
      const meRes = await authApi.me();
      if (meRes.success) setUser({ ...meRes.user, agencyId: meRes.user.agencyId });
      await fetchData(true);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const createAgency = async (name) => {
    if (isUsingMock || user?.isDemo) {
      return { success: false, error: 'Create agency not available in demo mode' };
    }
    try {
      await userApi.createAgency(name);
      const agenciesRes = await agencyApi.myList();
      setUserAgencies(agenciesRes.data || []);
      const meRes = await authApi.me();
      if (meRes.success) setUser({ ...meRes.user, agencyId: meRes.user.agencyId });
      await fetchData(true);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const logOut = async () => {
    try {
      await authApi.logout();
    } catch (e) {
      // ignore
    }
    setUser(null);
    return { success: true };
  };

  const loginAsDemo = () => {
    setUser({ email: 'demo@opays.com', id: 'demo-user', isDemo: true, role: 'agency_admin', agencyId: null });
  };

  const resetMockData = () => {
    updateLocalMock('forex_wallets', MOCK_WALLETS);
    updateLocalMock('forex_rates', MOCK_RATES);
    updateLocalMock('forex_txns', MOCK_TRANSACTIONS);
    updateLocalMock('forex_expenses', MOCK_EXPENSES);
    updateLocalMock('forex_customers', MOCK_CUSTOMERS);
    updateLocalMock('forex_loans', MOCK_LOANS);
    setWallets(MOCK_WALLETS);
    setRates(MOCK_RATES);
    setTransactions(MOCK_TRANSACTIONS);
    setExpenses(MOCK_EXPENSES);
    setCustomers(MOCK_CUSTOMERS);
    setLoans(MOCK_LOANS);
  };

  const updateRates = async (newRates) => {
    const formatted = newRates.map(r => ({ currency: r.currency, rate_to_usd: parseFloat(r.rate_to_usd) }));
    setRates(formatted);
    updateLocalMock('forex_rates', formatted);
    return { success: true };
  };

  const applyLocalBalanceChanges = (txn) => {
    const updatedWallets = wallets.map(w => {
      let balance = w.balance;
      const isSource = w.id === txn.source_wallet_id;
      const isDest = w.id === txn.dest_wallet_id;
      const isFee = txn.fee > 0 && w.id === txn.fee_wallet_id;
      const txnType = txn.type || 'exchange';

      if (txnType === 'exchange') {
        if (isSource) balance -= parseFloat(txn.source_amount);
        if (isDest) balance += parseFloat(txn.dest_amount);
      } else if (txnType === 'deposit') {
        if (isDest) balance += parseFloat(txn.dest_amount);
      } else if (txnType === 'withdrawal') {
        if (isSource) balance -= parseFloat(txn.source_amount);
      }

      if (isFee) balance -= parseFloat(txn.fee);
      return { ...w, balance };
    });
    setWallets(updatedWallets);
    updateLocalMock('forex_wallets', updatedWallets);
  };

  const addTransaction = async (txn) => {
    const txnWithStatus = { ...txn, status: txn.status || 'completed' };

    if (isUsingMock || user?.isDemo) {
      const newTxn = { id: makeId('t'), ...txnWithStatus, timestamp: new Date().toISOString() };
      const updatedTxns = [newTxn, ...transactions];
      setTransactions(updatedTxns);
      updateLocalMock('forex_txns', updatedTxns);
      if (newTxn.status === 'completed') applyLocalBalanceChanges(newTxn);
      return { success: true };
    }

    try {
      const body = {
        customerId: txn.customer_id || null,
        sourceWalletId: txn.source_wallet_id,
        destWalletId: txn.dest_wallet_id,
        sourceAmount: txn.source_amount,
        destAmount: txn.dest_amount,
        exchangeRate: txn.exchange_rate,
        fee: txn.fee || 0,
        feeWalletId: txn.fee_wallet_id || null,
        profitUsd: txn.profit_usd || 0,
        type: txn.type || 'exchange',
        status: txn.status || 'completed',
        transactionId: txn.transaction_id || null,
        receiptText: txn.receipt_text || null,
        note: txn.note || null,
        metadata: txn.metadata || {},
      };
      await transactionApi.create(body);
      await fetchData(true);
      return { success: true };
    } catch (err) {
      console.error('Error saving transaction:', err);
      return { success: false, error: err.message };
    }
  };

  const confirmDraft = async (draftId, updatedData = {}) => {
    if (isUsingMock || user?.isDemo) {
      let confirmedTxn = null;
      const updatedTxns = transactions.map(t => {
        if (t.id === draftId) {
          confirmedTxn = { ...t, ...updatedData, status: 'completed' };
          return confirmedTxn;
        }
        return t;
      });
      if (!confirmedTxn) return { success: false, error: 'Brouillon introuvable' };
      setTransactions(updatedTxns);
      updateLocalMock('forex_txns', updatedTxns);
      applyLocalBalanceChanges(confirmedTxn);
      return { success: true };
    }

    try {
      await transactionApi.confirm(draftId);
      await fetchData(true);
      return { success: true };
    } catch (err) {
      console.error('Error confirming draft:', err);
      return { success: false, error: err.message };
    }
  };

  const deleteDraft = async (draftId) => {
    if (isUsingMock || user?.isDemo) {
      const updated = transactions.filter(t => t.id !== draftId);
      setTransactions(updated);
      updateLocalMock('forex_txns', updated);
      return { success: true };
    }
    return { success: false, error: 'Delete draft not implemented in API yet' };
  };

  const createWallet = async (wallet) => {
    const formattedWallet = { ...wallet, balance: parseFloat(wallet.balance) || 0, is_active: wallet.is_active !== undefined ? wallet.is_active : true };

    if (isUsingMock || user?.isDemo) {
      const newWallet = { id: makeId('w'), ...formattedWallet, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      const updatedWallets = [...wallets, newWallet];
      setWallets(updatedWallets);
      updateLocalMock('forex_wallets', updatedWallets);
      return { success: true, data: newWallet };
    }

    try {
      await walletApi.create({
        name: wallet.name,
        currencyCode: wallet.currency,
        type: wallet.type || 'cash',
        balance: wallet.balance,
        provider: wallet.provider,
        accountNumber: wallet.account_number,
      });
      await fetchData(true);
      return { success: true };
    } catch (err) {
      console.error('Error creating wallet:', err);
      return { success: false, error: err.message };
    }
  };

  const updateWallet = async (walletId, updates) => {
    if (isUsingMock || user?.isDemo) {
      const updated = wallets.map(w => w.id === walletId ? { ...w, ...updates, updated_at: new Date().toISOString() } : w);
      setWallets(updated);
      updateLocalMock('forex_wallets', updated);
      return { success: true };
    }

    try {
      const body = {};
      if (updates.name !== undefined) body.name = updates.name;
      if (updates.currency !== undefined) body.currencyCode = updates.currency;
      if (updates.type !== undefined) body.type = updates.type;
      if (updates.balance !== undefined) body.balance = parseFloat(updates.balance);
      if (updates.provider !== undefined) body.provider = updates.provider;
      if (updates.account_number !== undefined) body.accountNumber = updates.account_number;
      await walletApi.update(walletId, body);
      await fetchData(true);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const deleteWallet = async (walletId) => {
    if (isUsingMock || user?.isDemo) {
      const updated = wallets.filter(w => w.id !== walletId);
      setWallets(updated);
      updateLocalMock('forex_wallets', updated);
      return { success: true };
    }
    try {
      await walletApi.delete(walletId);
      await fetchData(true);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const adjustWalletBalance = async (walletId, amount) => {
    const wallet = wallets.find(w => w.id === walletId);
    if (!wallet) return { success: false, error: 'Wallet not found' };
    return updateWallet(walletId, { balance: wallet.balance + parseFloat(amount) });
  };

  const addExpense = async (expense) => {
    if (isUsingMock || user?.isDemo) {
      const newExpense = { id: makeId('e'), ...expense, timestamp: new Date().toISOString() };
      const updated = [newExpense, ...expenses];
      setExpenses(updated);
      updateLocalMock('forex_expenses', updated);
      const updatedWallets = wallets.map(w => w.id === expense.wallet_id ? { ...w, balance: w.balance - parseFloat(expense.amount) } : w);
      setWallets(updatedWallets);
      updateLocalMock('forex_wallets', updatedWallets);
      return { success: true };
    }
    try {
      await expenseApi.create({
        walletId: expense.wallet_id,
        amount: expense.amount,
        isBusiness: expense.is_business,
        category: expense.category,
        note: expense.note,
      });
      await fetchData(true);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const createCustomer = async (customer) => {
    if (isUsingMock || user?.isDemo) {
      const newCustomer = { id: makeId('c'), ...customer, created_at: new Date().toISOString() };
      const updated = [...customers, newCustomer];
      setCustomers(updated);
      updateLocalMock('forex_customers', updated);
      return { success: true, data: newCustomer };
    }
    try {
      await customerApi.create(customer);
      await fetchData(true);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const updateCustomer = async (customerId, updates) => {
    if (isUsingMock || user?.isDemo) {
      const updated = customers.map(c => c.id === customerId ? { ...c, ...updates } : c);
      setCustomers(updated);
      updateLocalMock('forex_customers', updated);
      return { success: true };
    }
    try {
      await customerApi.update(customerId, updates);
      await fetchData(true);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const findOrCreateCustomer = async (name, phone) => {
    const existing = customers.find(c => c.name === name && c.phone === phone);
    if (existing) return { success: true, data: existing };
    return createCustomer({ name, phone });
  };

  const createLoan = async (loan) => {
    if (isUsingMock || user?.isDemo) {
      const newLoan = { id: makeId('l'), ...loan, status: 'pending', created_at: new Date().toISOString() };
      const updated = [...loans, newLoan];
      setLoans(updated);
      updateLocalMock('forex_loans', updated);
      const updatedWallets = wallets.map(w => w.id === loan.wallet_id ? { ...w, balance: w.balance - parseFloat(loan.amount) } : w);
      setWallets(updatedWallets);
      updateLocalMock('forex_wallets', updatedWallets);
      return { success: true, data: newLoan };
    }
    try {
      await loanApi.create({
        customerId: loan.customer_id,
        walletId: loan.wallet_id,
        amount: loan.amount,
        currencyCode: loan.currency,
        interestRate: loan.interest_rate,
        dueDate: loan.due_date,
        note: loan.note,
      });
      await fetchData(true);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const updateLoanStatus = async (loanId, newStatus) => {
    if (isUsingMock || user?.isDemo) {
      let targetLoan = null;
      const updatedLoans = loans.map(l => {
        if (l.id === loanId) { targetLoan = { ...l, status: newStatus }; return targetLoan; }
        return l;
      });
      if (!targetLoan) return { success: false, error: 'Loan not found' };
      setLoans(updatedLoans);
      updateLocalMock('forex_loans', updatedLoans);
      if (newStatus === 'paid') {
        const repayAmount = parseFloat(targetLoan.amount) * (1 + parseFloat(targetLoan.interest_rate) / 100);
        const updatedWallets = wallets.map(w => w.id === targetLoan.wallet_id ? { ...w, balance: w.balance + repayAmount } : w);
        setWallets(updatedWallets);
        updateLocalMock('forex_wallets', updatedWallets);
      }
      return { success: true };
    }
    try {
      await loanApi.update(loanId, { status: newStatus });
      await fetchData(true);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const convertToUSDValue = (amount, currency) => convertToUSD(amount, currency, rates);

  const getNetWorthUSD = () => {
    const walletsTotal = wallets.reduce((acc, w) => acc + convertToUSDValue(w.balance, w.currency), 0);
    const loansTotal = loans
      .filter(l => l.status === 'pending' || l.status === 'overdue')
      .reduce((acc, l) => acc + calculateLoanRepaymentUSD(parseFloat(l.amount), l.currency, l.interest_rate, rates), 0);
    return walletsTotal + loansTotal;
  };

  const getOutstandingLoansUSD = () => {
    return loans
      .filter(l => l.status === 'pending' || l.status === 'overdue')
      .reduce((acc, l) => acc + calculateLoanRepaymentUSD(parseFloat(l.amount), l.currency, l.interest_rate, rates), 0);
  };

  const getDrafts = () => transactions.filter(t => t.status === 'draft');
  const getCompletedTransactions = () => transactions.filter(t => t.status === 'completed');

  const getTodayStats = () => {
    const today = new Date().toISOString().split('T')[0];
    const completedTxns = getCompletedTransactions();
    const todayTxns = completedTxns.filter(t => t.timestamp && t.timestamp.startsWith(today));
    const volumeUSD = todayTxns.reduce((acc, t) => acc + convertToUSDValue(parseFloat(t.source_amount) || 0, wallets.find(w => w.id === t.source_wallet_id)?.currency || 'USD'), 0);
    const profitUSD = todayTxns.reduce((acc, t) => acc + (parseFloat(t.profit_usd) || 0), 0);
    const todayExp = expenses.filter(e => e.timestamp && e.timestamp.startsWith(today));
    const bizExpenseUSD = todayExp.filter(e => e.is_business).reduce((acc, e) => acc + convertToUSDValue(parseFloat(e.amount) || 0, wallets.find(w => w.id === e.wallet_id)?.currency || 'USD'), 0);
    const persExpenseUSD = todayExp.filter(e => !e.is_business).reduce((acc, e) => acc + convertToUSDValue(parseFloat(e.amount) || 0, wallets.find(w => w.id === e.wallet_id)?.currency || 'USD'), 0);
    return {
      volumeUSD,
      profitUSD,
      bizExpenseUSD,
      persExpenseUSD,
      netProfitUSD: profitUSD - bizExpenseUSD
    };
  };
  return (
    <AppContext.Provider value={{
      wallets, rates, transactions, expenses, customers, loans,
      employees, setEmployees, transfers, setTransfers, subscriptions, setSubscriptions,
      tickets, setTickets, remoteOrders, setRemoteOrders,
      loading, isUsingMock, user, authChecked,
      signUp, signIn, signInWithGoogle, logOut, loginAsDemo,
      addTransaction, addExpense, updateRates,
      convertToUSD: convertToUSDValue,
      getNetWorthUSD, getOutstandingLoansUSD,
      getDrafts, getCompletedTransactions,
      confirmDraft, deleteDraft,
      createWallet, updateWallet, deleteWallet, adjustWalletBalance,
      createCustomer, updateCustomer, findOrCreateCustomer,
      createLoan, updateLoanStatus,
      refreshData: fetchData, resetMockData, getTodayStats,
      switchAgency, createAgency, userAgencies, setUserAgencies,
      language, setLanguage
    }}>
      {children}
    </AppContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useApp = () => useContext(AppContext);
