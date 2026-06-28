// Sélecteur de backend de données (Lot L0).
//
// Le flag `VITE_DATA_BACKEND` choisit l'implémentation :
//   - 'api'      → API Fastify (apiProvider)
//   - 'supabase' → Supabase Cloud (supabaseProvider)
//   - 'mock'     → données locales/localStorage (géré directement par AppContext)
//
// Défaut RÉTRO-COMPATIBLE (zéro régression) : si le flag est absent/inconnu,
// on retombe sur 'supabase' lorsque les clés Supabase sont présentes, sinon
// sur 'mock'. C'est exactement le comportement antérieur de l'application.

import { apiProvider } from './apiProvider';
import { supabaseProvider } from './supabaseProvider';

const VALID_BACKENDS = new Set(['api', 'supabase', 'mock']);

export function getDataBackend() {
  const flag = import.meta.env.VITE_DATA_BACKEND;
  if (typeof flag === 'string' && VALID_BACKENDS.has(flag)) {
    return flag;
  }
  if (import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY) {
    return 'supabase';
  }
  return 'mock';
}

export const providers = {
  api: apiProvider,
  supabase: supabaseProvider,
};

// Retourne le provider réseau pour le backend donné, ou `null` pour 'mock'
// (le mode démo est servi par les données locales de AppContext).
export function getDataProvider(backend = getDataBackend()) {
  return providers[backend] || null;
}

export { apiProvider, supabaseProvider };
