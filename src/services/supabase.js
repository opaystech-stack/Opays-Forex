// Mock Supabase client universel — un Proxy qui capture TOUS les appels
// et retourne des promesses vides pour éviter tout crash JS.
// Utilisé quand VITE_DATA_BACKEND=mock.

const noopResolve = (data) => Promise.resolve({ data: data ?? null, error: null });

// Proxy magique : toute propriété/méthode appelée retourne un nouveau Proxy
// chainable qui finit par une promesse résolue vide.
function createMockProxy() {
  return new Proxy(noopResolve([]), {
    get(target, prop) {
      if (prop === 'then' || prop === 'catch' || prop === 'finally') {
        return target[prop]; // laisser les promesses fonctionner
      }
      if (prop === 'subscribe') {
        return () => ({ unsubscribe: () => {} });
      }
      // Toute autre propriété → retourne un nouveau proxy chainable
      return createMockProxy();
    },
    apply(target, thisArg, args) {
      return createMockProxy();
    },
  });
}

const mock = {
  from: () => createMockProxy(),
  auth: {
    getSession: () => Promise.resolve({ data: { session: null } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signUp: () => Promise.resolve({ data: { user: null, session: null }, error: null }),
    signInWithPassword: () => Promise.resolve({ data: { user: null, session: null }, error: null }),
    signInWithOAuth: () => Promise.resolve({ data: {}, error: null }),
    signOut: () => Promise.resolve({ error: null }),
    resetPasswordForEmail: () => Promise.resolve({ error: null }),
  },
  storage: {
    from: () => createMockProxy(),
  },
  functions: {
    invoke: () => Promise.resolve({ data: null, error: null }),
  },
  channel: () => ({
    on: () => ({ subscribe: () => {} }),
    unsubscribe: () => {},
  }),
};

export const supabase = mock;