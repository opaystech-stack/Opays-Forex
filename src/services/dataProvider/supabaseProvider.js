// Implémentation `supabase` de la couche d'accès aux données.
//
// Enveloppe le client Supabase derrière la même interface que `apiProvider`,
// afin que la sélection de backend soit symétrique. Les branches historiques de
// AppContext continuent d'utiliser `supabase` directement (non-régression) ;
// ce provider expose l'interface commune pour les chemins déjà migrés (auth,
// wallets, transactions) et l'évolution future (lots L2/L3).

import { supabase } from '../supabase';

export const supabaseProvider = {
  client: supabase,
  auth: {
    async getSession() {
      if (!supabase) return null;
      const { data } = await supabase.auth.getSession();
      return data?.session?.user ?? null;
    },
    async signIn(email, password) {
      if (!supabase) return { success: false, error: 'Supabase non configuré', user: null };
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { success: false, error: error.message, user: null };
      return { success: true, user: data?.user ?? null, error: null };
    },
    async signUp(email, password, metadata = {}) {
      if (!supabase) return { success: false, error: 'Supabase non configuré', user: null };
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: metadata },
      });
      if (error) return { success: false, error: error.message, user: null };
      return { success: true, user: data?.user ?? null, error: null };
    },
    async signOut() {
      if (!supabase) return { success: true };
      await supabase.auth.signOut();
      return { success: true };
    },
  },
  wallets: {
    async list() {
      const { data, error } = await supabase.from('wallets').select('*').order('name');
      if (error) throw error;
      return data || [];
    },
  },
  transactions: {
    async list() {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('timestamp', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  },
};
