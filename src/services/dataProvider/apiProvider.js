// Implémentation `api` de la couche d'accès aux données : s'appuie sur le
// client Fastify (services/api.js) et normalise les E/S en snake_case (Option A).
//
// L'isolation par agence est garantie côté serveur : chaque endpoint applique
// `authenticate` + `requireAgency` et filtre par `agency_id` issu du JWT
// (cookie httpOnly). Le client ne transmet jamais d'`agency_id` : il est
// dérivé de la session, ce qui scelle l'étanchéité inter-agences (R1/R2).

import {
  authApi,
  walletApi,
  transactionApi,
  customerApi,
  expenseApi,
  loanApi,
  debtApi,
  rateApi,
  templateApi,
  reminderApi,
  moduleApi,
  flightApi,
  uploadApi,
  orderLinkApi,
  transferMethodApi,
  subscriptionProviderApi,
  invitationApi,
  employeeApi,
  agencyApi,
  userApi,
} from '../api';
import {
  toSnakeWallet,
  toCamelWalletInput,
  toSnakeTxn,
  toCamelTxnInput,
  toAppUser,
  keysToSnake,
} from './mappers';

// Sentinelle « session indéterminée » (Z1) : renvoyée par `getSession()`
// lorsqu'une erreur RÉSEAU transitoire empêche de trancher l'état de session
// (≠ d'un 401/403 confirmé par le serveur). Le bootstrap de session doit alors
// CONSERVER l'utilisateur courant plutôt que de le déconnecter sur un simple
// aléa réseau (fréquent sur mobile / réseau instable).
export const SESSION_UNKNOWN = Symbol('session-unknown');

export const apiProvider = {
  auth: {
    // Restaure la session courante depuis le cookie JWT.
    //
    // Z1 — Persistance de session : on DISTINGUE un 401/403 confirmé (serveur
    // joignable, utilisateur non authentifié → session effacée) d'une erreur
    // réseau transitoire (`fetch` rejette sans `err.status`, ou 5xx). Une erreur
    // réseau ne DOIT JAMAIS détruire une session valide : on réessaie quelques
    // fois, et en dernier recours on renvoie `SESSION_UNKNOWN` pour que le
    // bootstrap conserve l'état courant (ne pas rediriger vers /login).
    //
    // Note même origine (cookie) : `authApi` cible `VITE_API_URL`, qui DOIT être
    // same-origin avec le front en production pour que le cookie httpOnly `token`
    // (`sameSite: 'lax'`) accompagne `GET /api/auth/me` sur mobile. Voir le
    // commentaire de `API_BASE` dans `src/services/api.js`.
    async getSession() {
      const MAX_ATTEMPTS = 3;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        try {
          const res = await authApi.me();
          return res?.success ? toAppUser(res.user) : null;
        } catch (err) {
          // 401/403 = non authentifié confirmé par le serveur → session effacée.
          if (err?.status === 401 || err?.status === 403) {
            return null;
          }
          // Toute autre erreur (réseau, 5xx) est transitoire : nouvelle tentative.
          if (attempt < MAX_ATTEMPTS) {
            await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
            continue;
          }
          // Réseau toujours indisponible : on ne déconnecte pas l'utilisateur.
          return SESSION_UNKNOWN;
        }
      }
      return SESSION_UNKNOWN;
    },
    async signIn(email, password) {
      const res = await authApi.login({ email, password });
      return {
        success: !!res?.success,
        user: res?.success ? toAppUser(res.user) : null,
        error: res?.error || null,
      };
    },
    async signUp(email, password, metadata = {}) {
      const res = await authApi.register({
        email,
        password,
        firstName: metadata.firstName ?? metadata.first_name,
        lastName: metadata.lastName ?? metadata.last_name,
        agencyName: metadata.agencyName ?? metadata.agency_name ?? metadata.business_name,
      });
      return {
        success: !!res?.success,
        user: res?.success ? toAppUser(res.user) : null,
        error: res?.error || null,
      };
    },
    async signInWithGoogle(accessToken) {
      const res = await authApi.googleLogin(accessToken);
      return {
        success: !!res?.success,
        user: res?.success ? toAppUser(res.user) : null,
        error: res?.error || null,
      };
    },
    async signOut() {
      try {
        await authApi.logout();
      } catch {
        /* déconnexion best-effort : on efface l'état local quoi qu'il arrive */
      }
      return { success: true };
    },
    // Cree une nouvelle agence pour l'utilisateur courant et la rend active
    // (POST /api/auth/create-agency met a jour agency_id + re-emet le cookie).
    async createAgency(name) {
      const res = await userApi.createAgency(name);
      return { success: !!res?.success, error: res?.error || null };
    },
    // Change l'agence active (PUT /api/auth/switch-agency).
    async switchAgency(agencyId) {
      const res = await userApi.switchAgency(agencyId);
      return { success: !!res?.success, error: res?.error || null };
    },
  },

  // Agences de l'utilisateur courant (contexte multi-agences cote API).
  agencies: {
    async mine() {
      const res = await agencyApi.mine();
      return res?.success ? res.data : null;
    },
    async myList() {
      const res = await agencyApi.myList();
      return res?.data || [];
    },
  },

  wallets: {
    async list() {
      const res = await walletApi.list();
      return (res?.data || []).map(toSnakeWallet);
    },
    async create(wallet) {
      const res = await walletApi.create(toCamelWalletInput(wallet));
      return toSnakeWallet(res?.data);
    },
    async update(id, wallet) {
      const res = await walletApi.update(id, toCamelWalletInput(wallet));
      return toSnakeWallet(res?.data);
    },
  },

  transactions: {
    async list(params = { limit: 200 }) {
      const res = await transactionApi.list(params);
      return (res?.data || []).map(toSnakeTxn);
    },
    async create(txn) {
      const res = await transactionApi.create(toCamelTxnInput(txn));
      return toSnakeTxn(res?.data);
    },
    async confirmDraft(id) {
      const res = await transactionApi.confirm(id);
      return toSnakeTxn(res?.data);
    },
  },

  // Lectures secondaires (conversion générique des clés). Le contenu fin sera
  // affiné lors du lot L3 ; la conversion de clés suffit pour ces entités plates.
  customers: {
    async list() {
      const res = await customerApi.list();
      return keysToSnake(res?.data || []);
    },
  },
  expenses: {
    async list() {
      const res = await expenseApi.list();
      return keysToSnake(res?.data || []);
    },
  },
  loans: {
    async list() {
      const res = await loanApi.list();
      return keysToSnake(res?.data || []);
    },
  },

  // --- Lot L3 : entités secondaires (réponses déjà en snake_case côté serveur) ---
  debts: {
    async list() {
      const res = await debtApi.list();
      return res?.data || [];
    },
    async create(debt) {
      const res = await debtApi.create({
        type: debt.type,
        counterparty_name: debt.counterparty_name ?? null,
        amount: Number(debt.amount),
        currency: debt.currency,
        note: debt.note ?? null,
      });
      return res?.data;
    },
    async updateStatus(id, status) {
      const res = await debtApi.updateStatus(id, status);
      return res?.data;
    },
  },

  rates: {
    async list() {
      const res = await rateApi.list();
      return res?.data || [];
    },
    async upsert(rates) {
      await rateApi.upsert(rates);
      return { success: true };
    },
  },

  templates: {
    async list() {
      const res = await templateApi.list();
      return res?.data || [];
    },
    async create(tpl) {
      const res = await templateApi.create({
        name: tpl.name,
        lang: tpl.lang || 'fr',
        scenario: tpl.scenario || 'personalized',
        body: tpl.body,
      });
      return res?.data;
    },
    async update(id, updates) {
      const res = await templateApi.update(id, updates);
      return res?.data;
    },
    async remove(id) {
      await templateApi.delete(id);
      return { success: true };
    },
  },

  reminders: {
    async list() {
      const res = await reminderApi.list();
      return res?.data || [];
    },
    async create(entry) {
      const res = await reminderApi.create(entry);
      return res?.data;
    },
  },

  modules: {
    // Renvoie un dictionnaire { module_key: enabled } attendu par le front.
    async states() {
      const res = await moduleApi.states();
      return (res?.data || []).reduce((acc, r) => ({ ...acc, [r.module_key]: r.enabled === true }), {});
    },
    async entitlements() {
      const res = await moduleApi.entitlements();
      return (res?.data || []).reduce((acc, r) => ({ ...acc, [r.module_key]: r.granted === true }), {});
    },
    async setState(moduleKey, enabled) {
      const res = await moduleApi.setState(moduleKey, enabled);
      return res?.data;
    },
  },

  flightBookings: {
    async list() {
      const res = await flightApi.list();
      return res?.data || [];
    },
    async create(booking) {
      const res = await flightApi.create(booking);
      return res?.data;
    },
  },

  // --- Lot L4 : médias (volume Dokploy via Fastify) ---
  storage: {
    // Téléverse un fichier et renvoie l'enregistrement { id, ... }.
    async upload(file, kind = 'receipt') {
      const res = await uploadApi.upload(file, kind);
      return res?.data;
    },
    // URL d'affichage sécurisée (streaming protégé par cookie + agence).
    previewUrl(id) {
      return uploadApi.previewUrl(id);
    },
  },

  // --- Entités résiduelles (finalisation du retrait de Supabase) ---
  orderLinks: {
    async list() {
      const res = await orderLinkApi.list();
      return res?.data || [];
    },
    async create(expiresInHours = 24) {
      const res = await orderLinkApi.create(expiresInHours);
      return res?.data;
    },
    async revoke(id) {
      const res = await orderLinkApi.revoke(id);
      return res?.data;
    },
  },
  transferMethods: {
    async list() {
      const res = await transferMethodApi.list();
      return res?.data || [];
    },
    async create(body) {
      const res = await transferMethodApi.create(body);
      return res?.data;
    },
    async remove(id) {
      await transferMethodApi.delete(id);
      return { success: true };
    },
  },
  subscriptionProviders: {
    async list() {
      const res = await subscriptionProviderApi.list();
      return res?.data || [];
    },
    async create(body) {
      const res = await subscriptionProviderApi.create(body);
      return res?.data;
    },
    async remove(id) {
      await subscriptionProviderApi.delete(id);
      return { success: true };
    },
  },
  invitations: {
    async list() {
      const res = await invitationApi.list();
      return res?.data || [];
    },
    async create(body) {
      const res = await invitationApi.create(body);
      return res?.data;
    },
    async revoke(id) {
      const res = await invitationApi.revoke(id);
      return res?.data;
    },
  },
  members: {
    async list() {
      const res = await employeeApi.list();
      return res?.data || [];
    },
  },
};
