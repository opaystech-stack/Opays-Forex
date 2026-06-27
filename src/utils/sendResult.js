// Mapping du résultat de la passerelle WhatsApp — fonction pure
//
// Normalise la réponse brute d'un appel à la Passerelle_WhatsApp (OpenWA) en
// un statut succès/échec exploitable par le Service_Envoi et le Service_Relance.
// Aucune dépendance réseau, aucun effet de bord : la même entrée produit
// toujours la même sortie. Partagée entre la logique client et la logique edge.
//
// Feature: whatsapp-client-reminders

/**
 * Mappe la réponse d'un appel à la Passerelle_WhatsApp en statut normalisé.
 *
 * Règle (Exigences 3.4, 3.5, 3.6) : le résultat est un succès **si et seulement
 * si** la réponse HTTP est OK (`httpOk` vrai) **et** un identifiant de message
 * non vide est fourni. Dans tous les autres cas, le résultat est un échec
 * accompagné d'une cause :
 *   - `httpOk` vrai mais identifiant absent/vide → `error:'missing_message_id'` (Ex. 3.5) ;
 *   - HTTP non-OK / passerelle injoignable / timeout → `error` fourni, ou repli
 *     `'gateway_error'` si aucune cause explicite n'est disponible (Ex. 3.6).
 *
 * @param {{ httpOk?: boolean, messageId?: string|null, error?: string|null }} [response]
 * @returns {{ success: boolean, messageId?: string, error?: string }}
 */
export const mapGatewayResponse = ({ httpOk, messageId, error } = {}) => {
  const id = typeof messageId === 'string' ? messageId.trim() : messageId;
  const hasMessageId = id !== null && id !== undefined && id !== '';

  if (httpOk && hasMessageId) {
    return { success: true, messageId: String(id) };
  }

  if (httpOk && !hasMessageId) {
    return { success: false, error: 'missing_message_id' };
  }

  const cause =
    typeof error === 'string' && error.trim() !== ''
      ? error
      : 'gateway_error';
  return { success: false, error: cause };
};
