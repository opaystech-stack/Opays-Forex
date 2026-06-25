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
    throw new Error(data?.error || `HTTP ${res.status}`);
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

export const agencyApi = {
  mine: () => apiClient.get('/agencies/mine'),
  updateMine: (body) => apiClient.put('/agencies/mine', body),
};
