// Résolution de l'URL de la passerelle WhatsApp d'envoi — fonction pure.
//
// La logique d'envoi (fonction Edge `whatsapp-send`) peut disposer d'une URL
// de passerelle dédiée à l'envoi, ou se replier sur l'URL partagée/entrante.
// Cette résolution est isolée ici en fonction pure afin d'être testable
// indépendamment (Propriété 17).
//
// Feature: whatsapp-client-reminders

/**
 * Indique si une valeur d'URL est « définie et non vide ».
 * Les valeurs `null`/`undefined`, les non-chaînes et les chaînes ne
 * contenant que des espaces sont considérées comme absentes.
 *
 * @param {*} url
 * @returns {boolean}
 */
const isPresent = (url) => typeof url === 'string' && url.trim() !== '';

/**
 * Résout l'URL de passerelle à utiliser pour l'envoi WhatsApp.
 *
 * Règle (Exigences 12.2, 12.3) :
 *   - si l'URL d'envoi dédiée (`sendUrl`) est définie et non vide,
 *     l'URL résolue est `sendUrl` ;
 *   - sinon, l'URL résolue est l'URL partagée/entrante (`sharedUrl`) ;
 *   - si aucune des deux n'est définie, retourne `undefined`.
 *
 * Fonction pure : aucun effet de bord, aucune lecture d'environnement.
 *
 * @param {string|null|undefined} sendUrl URL de passerelle d'envoi dédiée
 * @param {string|null|undefined} sharedUrl URL de passerelle partagée/entrante
 * @returns {string|undefined} l'URL résolue, ou `undefined` si aucune n'est définie
 */
export const resolveGatewayUrl = (sendUrl, sharedUrl) => {
  if (isPresent(sendUrl)) return sendUrl;
  if (isPresent(sharedUrl)) return sharedUrl;
  return undefined;
};
