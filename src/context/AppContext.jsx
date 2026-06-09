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
];

const MOCK_RATES = [
  { currency: 'UGX', rate_to_usd: 3750.00 },
  { currency: 'KES', rate_to_usd: 130.00 },
  { currency: 'CDF', rate_to_usd: 2500.00 },
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

      setWallets(localWallets ? JSON.parse(localWallets) : MOCK_WALLETS);
      setRates(localRates ? JSON.parse(localRates) : MOCK_RATES);
      setTransactions(localTxns ? JSON.parse(localTxns) : MOCK_TRANSACTIONS);
      setExpenses(localExp ? JSON.parse(localExp) : MOCK_EXPENSES);
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
      const [wRes, rRes, tRes, eRes] = await Promise.all([
        supabase.from('wallets').select('*').order('name'),
        supabase.from('exchange_rates').select('*').order('date', { ascending: false }),
        supabase.from('transactions').select('*').order('timestamp', { ascending: false }),
        supabase.from('expenses').select('*').order('timestamp', { ascending: false })
      ]);

      if (wRes.error) throw wRes.error;
      setWallets(wRes.data || []);
      setRates(rRes.data || []);
      setTransactions(tRes.data || []);
      setExpenses(eRes.data || []);
      setIsUsingMock(false);
    } catch (error) {
      console.error('Error fetching Supabase data, falling back to local mock data:', error);
      setIsUsingMock(true);
      // Fallback
      setWallets(MOCK_WALLETS);
      setRates(MOCK_RATES);
      setTransactions(MOCK_TRANSACTIONS);
      setExpenses(MOCK_EXPENSES);
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
      const { data, error } = await supabase.auth.signUp({ email, password });
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
          if (w.id === txn.source_wallet_id) {
            return { ...w, balance: w.balance - parseFloat(txn.source_amount) };
          }
          if (w.id === txn.dest_wallet_id) {
            return { ...w, balance: w.balance + parseFloat(txn.dest_amount) };
          }
          if (txn.fee > 0 && w.id === txn.fee_wallet_id) {
            return { ...w, balance: w.balance - parseFloat(txn.fee) };
          }
          return w;
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
        if (w.id === confirmedTxn.source_wallet_id) {
          return { ...w, balance: w.balance - parseFloat(confirmedTxn.source_amount) };
        }
        if (w.id === confirmedTxn.dest_wallet_id) {
          return { ...w, balance: w.balance + parseFloat(confirmedTxn.dest_amount) };
        }
        if (confirmedTxn.fee > 0 && w.id === confirmedTxn.fee_wallet_id) {
          return { ...w, balance: w.balance - parseFloat(confirmedTxn.fee) };
        }
        return w;
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
      setWallets(MOCK_WALLETS);
      setRates(MOCK_RATES);
      setTransactions(MOCK_TRANSACTIONS);
      setExpenses(MOCK_EXPENSES);
    }
  };

  // Helper: Convert any wallet amount to USD
  const convertToUSD = (amount, currency) => {
    if (currency === 'USD') return amount;
    const rate = rates.find(r => r.currency === currency);
    if (!rate || rate.rate_to_usd === 0) return 0;
    return amount / rate.rate_to_usd;
  };

  // Helper: Calculate total net worth in USD (only from wallets, not drafts)
  const getNetWorthUSD = () => {
    return wallets.reduce((acc, w) => acc + convertToUSD(w.balance, w.currency), 0);
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
      getDrafts,
      getCompletedTransactions,
      confirmDraft,
      deleteDraft,
      refreshData: fetchData,
      resetMockData
    }}>
      {children}
    </AppContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useApp = () => useContext(AppContext);
