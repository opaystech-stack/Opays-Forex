// Mock Supabase client — toutes les méthodes retournent des promesses vides.
// Utilisé quand VITE_DATA_BACKEND=mock. Le backend API (Fastify :3001)
// gère la persistance réelle en production.

const noopResolve = (data = {}) => Promise.resolve({ data, error: null });
const emptyArray = () => noopResolve([]);
const emptyRecord = () => noopResolve({});

// Build a chainable query builder
function query() {
  return {
    select: () => ({
      order: () => emptyArray(),
      eq: () => ({ single: () => emptyRecord(), order: () => emptyArray() }),
      limit: () => emptyArray(),
      maybeSingle: () => emptyRecord(),
    }),
    insert: () => ({ select: () => noopResolve({}) }),
    update: () => ({ eq: () => ({ select: () => noopResolve({}) }) }),
    delete: () => ({ eq: () => noopResolve({}) }),
    upsert: () => ({ select: () => noopResolve({}) }),
  };
}

const mock = {
  from: () => query(),
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
    from: () => ({
      upload: () => Promise.resolve({ error: null }),
      getPublicUrl: () => ({ data: { publicUrl: '' } }),
      remove: () => Promise.resolve({ error: null }),
    }),
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