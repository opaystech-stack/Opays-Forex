// Mappers de contrat — Option A : l'application consomme du `snake_case`.
//
// L'API Fastify (api/routes/*) renvoie du `camelCase` (cf. mapWallet,
// mapTransaction). Ces mappers convertissent les réponses en `snake_case`
// attendu par les pages/composants React, et inversement pour les corps de
// requête. Fonctions PURES, sans effet de bord.

// Conversion générique profonde des clés camelCase -> snake_case.
// Sûre pour les entités « plates » (customers, expenses, loans, transactions).
export function keysToSnake(value) {
  if (Array.isArray(value)) return value.map(keysToSnake);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [
        key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`),
        keysToSnake(val),
      ])
    );
  }
  return value;
}

// --- Wallets -------------------------------------------------------------
// Le front consomme `currency` (cf. MOCK_WALLETS, CurrencySelect) alors que
// l'API expose `currencyCode`. On expose les deux pour robustesse.
export function toSnakeWallet(w = {}) {
  return {
    ...keysToSnake(w),
    currency: w.currency ?? w.currencyCode ?? null,
  };
}

export function toCamelWalletInput(w = {}) {
  return {
    name: w.name,
    currencyCode: w.currency ?? w.currency_code,
    type: w.type ?? 'cash',
    balance: w.balance === undefined || w.balance === null ? 0 : Number(w.balance),
    provider: w.provider ?? undefined,
    accountNumber: w.account_number ?? undefined,
  };
}

// --- Transactions --------------------------------------------------------
// keysToSnake suffit (sourceWalletId -> source_wallet_id, profitUsd ->
// profit_usd, etc.). Helper explicite pour la lisibilité côté appelant.
export function toSnakeTxn(t = {}) {
  return keysToSnake(t);
}

export function toCamelTxnInput(t = {}) {
  return {
    customerId: t.customer_id ?? null,
    sourceWalletId: t.source_wallet_id,
    destWalletId: t.dest_wallet_id,
    sourceAmount: Number(t.source_amount),
    destAmount: Number(t.dest_amount),
    exchangeRate: Number(t.exchange_rate),
    fee: t.fee === undefined || t.fee === null ? 0 : Number(t.fee),
    feeWalletId: t.fee_wallet_id ?? null,
    profitUsd: t.profit_usd === undefined || t.profit_usd === null ? 0 : Number(t.profit_usd),
    type: t.type ?? 'exchange',
    status: t.status ?? 'completed',
    transactionId: t.transaction_id ?? null,
    receiptText: t.receipt_text ?? null,
    note: t.note ?? null,
    metadata: t.metadata ?? {},
  };
}

// --- Utilisateur ---------------------------------------------------------
// L'API renvoie { id, email, role, agencyId, ... } ; le front utilise
// `agency_id` (cohérence snake_case) et `id`.
export function toAppUser(u) {
  if (!u || typeof u !== 'object') return null;
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    agency_id: u.agencyId ?? u.agency_id ?? null,
    first_name: u.firstName ?? u.first_name ?? null,
    last_name: u.lastName ?? u.last_name ?? null,
    is_active: u.isActive ?? u.is_active ?? true,
    isActive: u.isActive ?? u.is_active ?? true,
    // --- auth-access-mobile-fixes (Z4) ----------------------------------
    // Le verdict d'accès et la base d'essai sont calculés CÔTÉ SERVEUR et
    // exposés via /api/auth/me ; on les préserve ici pour que `loadProfile`
    // puisse refléter le verdict serveur (non falsifiable côté client).
    createdAt: u.createdAt ?? u.created_at ?? null,
    accessGranted:
      typeof u.accessGranted === 'boolean' ? u.accessGranted : undefined,
    trialActive: typeof u.trialActive === 'boolean' ? u.trialActive : undefined,
    trialEndsAt: u.trialEndsAt ?? null,
    paidAccess: typeof u.paidAccess === 'boolean' ? u.paidAccess : undefined,
  };
}
