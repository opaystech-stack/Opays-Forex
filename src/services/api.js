const API_BASE = (() => {
  const candidates = [
    import.meta.env.VITE_API_URL,
    import.meta.env.VITE_PUBLIC_API_URL,
    typeof window !== 'undefined' ? `${window.location.origin}/api` : null,
  ];
  for (const c of candidates) {
    if (c) return c.replace(/\/$/, '');
  }
  return '/api';
})();

async function api(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    // On préserve le statut HTTP sur l'erreur afin que la couche d'accès aux
    // données (isRlsDenied) distingue un refus d'accès (401/403) d'une simple
    // erreur réseau, comme avec PostgREST/Supabase.
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const apiClient = {
  get: (path) => api(path, { method: 'GET' }),
  post: (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => api(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (path) => api(path, { method: 'DELETE' }),
};

export const authApi = {
  register: (body) => apiClient.post('/auth/register', body),
  login: (body) => apiClient.post('/auth/login', body),
  me: () => apiClient.get('/auth/me'),
  logout: () => apiClient.post('/auth/logout', {}),
  googleLogin: (accessToken) => apiClient.post('/auth/google-login', { accessToken }),
};

export const dashboardApi = {
  summary: () => apiClient.get('/dashboard/summary'),
};

export const walletApi = {
  list: () => apiClient.get('/wallets'),
  create: (body) => apiClient.post('/wallets', body),
  update: (id, body) => apiClient.put(`/wallets/${id}`, body),
  delete: (id) => apiClient.delete(`/wallets/${id}`),
};

export const transactionApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiClient.get(`/transactions?${qs}`);
  },
  create: (body) => apiClient.post('/transactions', body),
  confirm: (id) => apiClient.post(`/transactions/${id}/confirm`, {}),
};

export const customerApi = {
  list: () => apiClient.get('/customers'),
  create: (body) => apiClient.post('/customers', body),
  update: (id, body) => apiClient.put(`/customers/${id}`, body),
  delete: (id) => apiClient.delete(`/customers/${id}`),
};

export const employeeApi = {
  list: () => apiClient.get('/employees'),
  create: (body) => apiClient.post('/employees', body),
  update: (id, body) => apiClient.put(`/employees/${id}`, body),
  delete: (id) => apiClient.delete(`/employees/${id}`),
};

export const transferApi = {
  list: () => apiClient.get('/transfers'),
  create: (body) => apiClient.post('/transfers', body),
  complete: (id) => apiClient.post(`/transfers/${id}/complete`, {}),
};

export const subscriptionApi = {
  list: () => apiClient.get('/subscriptions'),
  create: (body) => apiClient.post('/subscriptions', body),
  update: (id, body) => apiClient.put(`/subscriptions/${id}`, body),
};

export const ticketApi = {
  list: () => apiClient.get('/tickets'),
  create: (body) => apiClient.post('/tickets', body),
  update: (id, body) => apiClient.put(`/tickets/${id}`, body),
};

export const remoteOrderApi = {
  list: () => apiClient.get('/remote-orders'),
  create: (body) => apiClient.post('/remote-orders', body),
  update: (id, body) => apiClient.put(`/remote-orders/${id}`, body),
};

export const expenseApi = {
  list: () => apiClient.get('/expenses'),
  create: (body) => apiClient.post('/expenses', body),
};

export const loanApi = {
  list: () => apiClient.get('/loans'),
  create: (body) => apiClient.post('/loans', body),
  update: (id, body) => apiClient.put(`/loans/${id}`, body),
};

export const debtApi = {
  list: () => apiClient.get('/debts'),
  create: (body) => apiClient.post('/debts', body),
  updateStatus: (id, status) => apiClient.put(`/debts/${id}/status`, { status }),
};

export const rateApi = {
  list: () => apiClient.get('/rates'),
  upsert: (rates) => apiClient.put('/rates', { rates }),
};

export const templateApi = {
  list: () => apiClient.get('/templates'),
  create: (body) => apiClient.post('/templates', body),
  update: (id, body) => apiClient.put(`/templates/${id}`, body),
  delete: (id) => apiClient.delete(`/templates/${id}`),
};

export const reminderApi = {
  list: () => apiClient.get('/reminders'),
  create: (body) => apiClient.post('/reminders', body),
};

export const moduleApi = {
  states: () => apiClient.get('/modules/states'),
  entitlements: () => apiClient.get('/modules/entitlements'),
  setState: (moduleKey, enabled) => apiClient.put('/modules/states', { module_key: moduleKey, enabled }),
};

export const flightApi = {
  list: () => apiClient.get('/flight-bookings'),
  create: (body) => apiClient.post('/flight-bookings', body),
};

// Upload multipart (L4) : ne passe pas par apiClient (Content-Type JSON).
export const uploadApi = {
  async upload(file, kind = 'receipt') {
    const form = new FormData();
    form.append('kind', kind);
    form.append('file', file);
    const res = await fetch(`${API_BASE}/uploads`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.error || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  },
  previewUrl: (id) => `${API_BASE}/uploads/${id}`,
};

export const orderLinkApi = {
  list: () => apiClient.get('/order-links'),
  create: (expiresInHours = 24) => apiClient.post('/order-links', { expiresInHours }),
  revoke: (id) => apiClient.put(`/order-links/${id}/revoke`, {}),
};

export const transferMethodApi = {
  list: () => apiClient.get('/transfer-methods'),
  create: (body) => apiClient.post('/transfer-methods', body),
  update: (id, body) => apiClient.put(`/transfer-methods/${id}`, body),
  delete: (id) => apiClient.delete(`/transfer-methods/${id}`),
};

export const subscriptionProviderApi = {
  list: () => apiClient.get('/subscription-providers'),
  create: (body) => apiClient.post('/subscription-providers', body),
  delete: (id) => apiClient.delete(`/subscription-providers/${id}`),
};

export const invitationApi = {
  list: () => apiClient.get('/invitations'),
  create: (body) => apiClient.post('/invitations', body),
  revoke: (id) => apiClient.put(`/invitations/${id}/revoke`, {}),
};

export const agencyApi = {
  list: () => apiClient.get('/agencies'),
  mine: () => apiClient.get('/agencies/mine'),
  updateMine: (body) => apiClient.put('/agencies/mine', body),
  myList: () => apiClient.get('/agencies/my-list'),
};

export const userApi = {
  switchAgency: (agencyId) => apiClient.put('/auth/switch-agency', { agencyId }),
  createAgency: (name) => apiClient.post('/auth/create-agency', { name }),
};
