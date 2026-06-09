import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';

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

export const AppProvider = ({ children }) => {
  const [wallets, setWallets] = useState([]);
  const [rates, setRates] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [isUsingMock, setIsUsingMock] = useState(false);
  const [user, setUser] = useState(null);

  // Check if Supabase credentials are valid
  const hasCredentials = 
    import.meta.env.VITE_SUPABASE_URL && 
    import.meta.env.VITE_SUPABASE_ANON_KEY &&
    supabase !== null;

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) {
      setLoading(true);
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

      setWallets(localWallets ? JSON.parse(localWallets) : MOCK_WALLETS);
      setRates(localRates ? JSON.parse(localRates) : MOCK_RATES);
      setTransactions(localTxns ? JSON.parse(localTxns) : MOCK_TRANSACTIONS);
      setExpenses(localExp ? JSON.parse(localExp) : MOCK_EXPENSES);
      setCustomers(localCust ? JSON.parse(localCust) : MOCK_CUSTOMERS);
      setLoans(localLoans ? JSON.parse(localLoans) : MOCK_LOANS);
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
      setWallets(wRes.data || []);
      setRates(rRes.data || []);
      setTransactions(tRes.data || []);
      setExpenses(eRes.data || []);
      setCustomers(cRes.data || []);
      setLoans(lRes.data || []);
      setIsUsingMock(false);
    } catch (error) {
      console.error('Error fetching Supabase data, falling back to local mock data:', error);
      setIsUsingMock(true);
      // Fallback
      setWallets(MOCK_WALLETS);
      setRates(MOCK_RATES);
      setTransactions(MOCK_TRANSACTIONS);
      setExpenses(MOCK_EXPENSES);
      setCustomers(MOCK_CUSTOMERS);
      setLoans(MOCK_LOANS);
    } finally {
      setLoading(false);
    }
  }, [hasCredentials, authChecked, user]);

  // Listen to Supabase Auth Changes
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!supabase) {
      setAuthChecked(true);
      setLoading(false);
      return;
    }

    // Get active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthChecked(true);
    });

    // Listen to changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthChecked(true);
    });
    /* eslint-enable react-hooks/set-state-in-effect */

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // Sign up with email/password
  const signUp = async (email, password) => {
    if (!supabase) return { success: false, error: 'Supabase non configuré' };
    try {
      const { data, error } = await supabase.auth.signUp({ 
        email, 
        password,
        options: {
          emailRedirectTo: window.location.origin
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
    if (!supabase) return { success: false, error: 'Supabase non configuré' };
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
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
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  // Update localStorage helper if using mock data
  const updateLocalMock = (key, data) => {
    if (isUsingMock) {
      localStorage.setItem(key, JSON.stringify(data));
    }
  };

  // Add a new transaction (always with status = 'completed' by default)
  const addTransaction = async (txn) => {
    const txnWithStatus = { ...txn, status: txn.status || 'completed' };

    if (isUsingMock) {
      const newTxn = { id: 't_' + Date.now(), ...txnWithStatus, timestamp: new Date().toISOString() };
      const updatedTxns = [newTxn, ...transactions];
      setTransactions(updatedTxns);
      updateLocalMock('forex_txns', updatedTxns);

      // Only update wallet balances if this is a completed transaction
      if (newTxn.status === 'completed') {
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

          if (isFee) {
            balance -= parseFloat(txn.fee);
          }

          return { ...w, balance };
        });
        setWallets(updatedWallets);
        updateLocalMock('forex_wallets', updatedWallets);
      }
      return { success: true };
    }

    try {
      const { data, error } = await supabase.from('transactions').insert([txnWithStatus]).select();
      if (error) throw error;
      // Trigger refresh to load updated wallets & transactions from db
      await fetchData();
      return { success: true, data };
    } catch (err) {
      console.error('Error saving transaction:', err);
      return { success: false, error: err.message };
    }
  };

  // Confirm a draft transaction (change status from 'draft' to 'completed')
  const confirmDraft = async (draftId, updatedData = {}) => {
    if (isUsingMock) {
      let confirmedTxn = null;
      const updatedTxns = transactions.map(t => {
        if (t.id === draftId) {
          confirmedTxn = { ...t, ...updatedData, status: 'completed' };
          return confirmedTxn;
        }
        return t;
      });

      if (!confirmedTxn) {
        return { success: false, error: 'Brouillon introuvable' };
      }

      setTransactions(updatedTxns);
      updateLocalMock('forex_txns', updatedTxns);

      // Now apply wallet balance changes
      const updatedWallets = wallets.map(w => {
        let balance = w.balance;
        const isSource = w.id === confirmedTxn.source_wallet_id;
        const isDest = w.id === confirmedTxn.dest_wallet_id;
        const isFee = confirmedTxn.fee > 0 && w.id === confirmedTxn.fee_wallet_id;

        const txnType = confirmedTxn.type || 'exchange';

        if (txnType === 'exchange') {
          if (isSource) balance -= parseFloat(confirmedTxn.source_amount);
          if (isDest) balance += parseFloat(confirmedTxn.dest_amount);
        } else if (txnType === 'deposit') {
          if (isDest) balance += parseFloat(confirmedTxn.dest_amount);
        } else if (txnType === 'withdrawal') {
          if (isSource) balance -= parseFloat(confirmedTxn.source_amount);
        }

        if (isFee) {
          balance -= parseFloat(confirmedTxn.fee);
        }

        return { ...w, balance };
      });
      setWallets(updatedWallets);
      updateLocalMock('forex_wallets', updatedWallets);
      return { success: true };
    }

    try {
      const { data, error } = await supabase
        .from('transactions')
        .update({ ...updatedData, status: 'completed' })
        .eq('id', draftId)
        .select();
      if (error) throw error;
      await fetchData();
      return { success: true, data };
    } catch (err) {
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
      console.error('Error creating wallet:', err);
      return { success: false, error: err.message };
    }
  };

  // Update an existing wallet
  const updateWallet = async (id, updates) => {
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
      console.error('Error saving expense:', err);
      return { success: false, error: err.message };
    }
  };

  // Save exchange rates for the day
  const updateRates = async (newRates) => {
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
      setWallets(MOCK_WALLETS);
      setRates(MOCK_RATES);
      setTransactions(MOCK_TRANSACTIONS);
      setExpenses(MOCK_EXPENSES);
      setCustomers(MOCK_CUSTOMERS);
      setLoans(MOCK_LOANS);
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
      console.error('Error updating customer:', err);
      return { success: false, error: err.message };
    }
  };

  // Find or create customer by name/phone (auto-detect from OCR)
  const findOrCreateCustomer = async ({ name, phone }) => {
    if (!name && !phone) return { success: false, error: 'Nom ou téléphone requis' };

    // Search existing customers
    const existing = customers.find(c => {
      if (phone && c.phone && c.phone.replace(/\s/g, '') === phone.replace(/\s/g, '')) return true;
      if (name && c.name && c.name.toLowerCase().trim() === name.toLowerCase().trim()) return true;
      return false;
    });

    if (existing) {
      return { success: true, data: existing, isNew: false };
    }

    // Create new customer
    const res = await createCustomer({ name: name || 'Client inconnu', phone: phone || null });
    if (res.success) {
      return { success: true, data: res.data, isNew: true };
    }
    return res;
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

      if (!targetLoan) return { success: false, error: 'Prêt introuvable' };

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
      console.error('Error updating loan status:', err);
      return { success: false, error: err.message };
    }
  };

  // Helper: Convert any wallet amount to USD
  const convertToUSD = (amount, currency) => {
    if (currency === 'USD') return amount;
    const rate = rates.find(r => r.currency === currency);
    if (!rate || rate.rate_to_usd === 0) return 0;
    return amount / rate.rate_to_usd;
  };

  // Helper: Calculate total net worth in USD (wallets + active loans as recoverable assets)
  const getNetWorthUSD = () => {
    const walletsTotal = wallets.reduce((acc, w) => acc + convertToUSD(w.balance, w.currency), 0);
    const loansTotal = loans
      .filter(l => l.status === 'pending' || l.status === 'overdue')
      .reduce((acc, l) => acc + convertToUSD(parseFloat(l.amount) * (1 + parseFloat(l.interest_rate) / 100), l.currency), 0);
    return walletsTotal + loansTotal;
  };

  // Helper: Get total outstanding loans in USD
  const getOutstandingLoansUSD = () => {
    return loans
      .filter(l => l.status === 'pending' || l.status === 'overdue')
      .reduce((acc, l) => acc + convertToUSD(parseFloat(l.amount) * (1 + parseFloat(l.interest_rate) / 100), l.currency), 0);
  };

  // Helper: Get pending draft transactions
  const getDrafts = () => {
    return transactions.filter(t => t.status === 'draft');
  };

  // Helper: Get completed transactions only
  const getCompletedTransactions = () => {
    return transactions.filter(t => t.status === 'completed');
  };

  return (
    <AppContext.Provider value={{
      wallets,
      rates,
      transactions,
      expenses,
      customers,
      loans,
      loading,
      isUsingMock,
      user,
      signUp,
      signIn,
      signInWithGoogle,
      logOut,
      loginAsDemo,
      addTransaction,
      addExpense,
      updateRates,
      convertToUSD,
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
      createLoan,
      updateLoanStatus,
      refreshData: fetchData,
      resetMockData
    }}>
      {children}
    </AppContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useApp = () => useContext(AppContext);
