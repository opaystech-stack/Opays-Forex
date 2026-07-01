// Mock Supabase client universel — un Proxy qui capture TOUS les appels
// et retourne des promesses vides pour éviter tout crash JS.
// Utilisé quand VITE_DATA_BACKEND=mock.
//
// v2: Gère explicitement .insert(), .select(), .update(), .delete(),
// .upsert(), .eq(), .single(), .order(), .limit(), .maybeSingle()
// et retourne des objets chainables qui résolvent en { data, error }.

const noopResolve = (data) => Promise.resolve({ data: data ?? null, error: null });

// Construit un objet chainable de type QueryBuilder Supabase.
// Chaque méthode retourne  pour le chaînage, et les terminaux
// (.then, .select, .maybeSingle, .single) résolvent en { data, error }.
function createQueryBuilder(initialData = null) {
  const builder = {
    _data: initialData,
    _filters: [],
    _orderBy: null,
    _limit: null,
    _single: false,
    _maybeSingle: false,

    // Filtres
    eq: function (col, val) {
      this._filters.push({ op: 'eq', col, val });
      return this;
    },
    neq: function (col, val) {
      this._filters.push({ op: 'neq', col, val });
      return this;
    },
    gt: function (col, val) { return this; },
    gte: function (col, val) { return this; },
    lt: function (col, val) { return this; },
    lte: function (col, val) { return this; },
    like: function (col, val) { return this; },
    ilike: function (col, val) { return this; },
    is: function (col, val) { return this; },
    in: function (col, vals) { return this; },
    contains: function (col, val) { return this; },
    containedBy: function (col, val) { return this; },
    rangeGt: function (col, from, to) { return this; },
    rangeGte: function (col, from, to) { return this; },
    rangeLt: function (col, from, to) { return this; },
    rangeLte: function (col, from, to) { return this; },
    rangeAdjacent: function (col, from, to) { return this; },
    overlaps: function (col, vals) { return this; },
    textSearch: function (col, query, config) { return this; },
    filter: function (col, operator, val) { return this; },
    not: function (col, operator, val) { return this; },
    or: function (filters) { return this; },
    and: function (filters) { return this; },

    // Tri et limite
    order: function (col, opts) {
      this._orderBy = { col, ascending: opts?.ascending !== false };
      return this;
    },
    limit: function (n) {
      this._limit = n;
      return this;
    },
    range: function (from, to) { return this; },
    abortSignal: function (signal) { return this; },

    // Sélection
    select: function (columns) {
      const self = this;
      const result = this._data !== null
        ? (Array.isArray(this._data) ? this._data : [this._data])
        : [];
      const promise = Promise.resolve({ data: result, error: null, count: null, status: 200, statusText: 'OK' });
      if (this._single) {
        return Promise.resolve({ data: result[0] || null, error: null });
      }
      if (this._maybeSingle) {
        return Promise.resolve({ data: result[0] || null, error: null });
      }
      return promise;
    },

    // Insertion
    insert: function (values, opts) {
      const data = Array.isArray(values) ? values : [values];
      this._data = data;
      return this;
    },

    // Mise à jour
    update: function (values) {
      this._data = values;
      return this;
    },

    // Suppression
    delete: function () {
      this._data = null;
      return this;
    },

    // Upsert
    upsert: function (values, opts) {
      const data = Array.isArray(values) ? values : [values];
      this._data = data;
      return this;
    },

    // Résultats uniques
    single: function () {
      this._single = true;
      return this;
    },
    maybeSingle: function () {
      this._maybeSingle = true;
      return this;
    },

    // Comptage
    count: function (opts) {
      return Promise.resolve({ data: null, error: null, count: 0 });
    },

    // Pour compatibilité Promise (then/catch/finally)
    then: function (onFulfilled, onRejected) {
      const result = this._data !== null
        ? (Array.isArray(this._data) ? this._data : [this._data])
        : [];
      const promise = Promise.resolve({ data: result, error: null });
      return promise.then(onFulfilled, onRejected);
    },
    catch: function (onRejected) {
      return Promise.resolve({ data: null, error: null }).catch(onRejected);
    },
    finally: function (onFinally) {
      return Promise.resolve({ data: null, error: null }).finally(onFinally);
    },
  };

  // Rendre thenable pour que  fonctionne
  // même sans .select() explicite.
  builder.then = builder.then.bind(builder);
  builder.catch = builder.catch.bind(builder);
  builder.finally = builder.finally.bind(builder);

  return builder;
}

// Proxy magique : toute propriété/méthode appelée retourne un nouveau Proxy
// chainable qui finit par une promesse résolue vide.
function createMockProxy() {
  return new Proxy(noopResolve([]), {
    get(target, prop) {
      if (prop === 'then' || prop === 'catch' || prop === 'finally') {
        return target[prop];
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
  from: () => createQueryBuilder(),
  auth: {
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signUp: () => Promise.resolve({ data: { user: null, session: null }, error: null }),
    signInWithPassword: () => Promise.resolve({ data: { user: null, session: null }, error: null }),
    signInWithOAuth: () => Promise.resolve({ data: {}, error: null }),
    signOut: () => Promise.resolve({ error: null }),
    resetPasswordForEmail: () => Promise.resolve({ error: null }),
    getUser: () => Promise.resolve({ data: { user: null }, error: null }),
    updateUser: () => Promise.resolve({ data: { user: null }, error: null }),
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
  rpc: (fn, params) => Promise.resolve({ data: null, error: null }),
};

export const supabase = mock;
