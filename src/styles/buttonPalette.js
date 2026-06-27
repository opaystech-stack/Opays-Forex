// Palette de boutons — source de vérité unique des couleurs texte/fond par
// variante et par état. Les variables CSS de src/index.css reprennent ces
// mêmes valeurs. Chaque paire respecte un ratio de contraste WCAG 2.1 >= 4,5:1
// (vérifié par le test de propriété P15).

export const BUTTON_PALETTE = [
  // variante: primary
  { variant: 'primary', state: 'active', text: '#FFFFFF', bg: '#4F46E5' },
  { variant: 'primary', state: 'disabled', text: '#475569', bg: '#CBD5E1' },

  // variante: outline (sur carte claire)
  { variant: 'outline', state: 'active', text: '#4338CA', bg: '#FFFFFF' },
  { variant: 'outline', state: 'disabled', text: '#475569', bg: '#F1F5F9' },

  // variante: toggle (groupe de bascule)
  { variant: 'toggle', state: 'inactive', text: '#475569', bg: '#FFFFFF' },
  { variant: 'toggle', state: 'active', text: '#FFFFFF', bg: '#4F46E5' },
  { variant: 'toggle-business', state: 'active', text: '#FFFFFF', bg: '#0E7490' },
  { variant: 'toggle-personal', state: 'active', text: '#FFFFFF', bg: '#C2410C' },

  // variante: danger (déconnexion / suppression)
  { variant: 'danger', state: 'active', text: '#FFFFFF', bg: '#DC2626' },
  { variant: 'danger', state: 'disabled', text: '#475569', bg: '#CBD5E1' },

  // boutons flottants d'en-tête (paramètres / dettes) — texte = icône
  { variant: 'fab', state: 'active', text: '#FFFFFF', bg: '#4F46E5' },
  // bouton « Agent vocal » — réutilise les couleurs des fab existants
  // (settings-fab : #4F46E5 / texte blanc) pour rester dans la Charte_Graphique
  { variant: 'fab', state: 'voice-agent', text: '#FFFFFF', bg: '#4F46E5' },

  // ---------------------------------------------------------------------------
  // Agency Operations Expansion — paires des nouveaux composants/écrans.
  // (Employes, EspaceAdminPlateforme, toggles de modules dans Paramètres,
  //  Transferts, Abonnements, Billets, FormulaireCommande, CommandesDistantes,
  //  VoiceAgentModal étendu, AgencyGate). Chaque paire respecte WCAG 2.1 >= 4,5:1.
  // ---------------------------------------------------------------------------

  // variante: success (confirmation d'une Action_Critique, validation humaine)
  { variant: 'success', state: 'active', text: '#FFFFFF', bg: '#15803D' },
  { variant: 'success', state: 'disabled', text: '#475569', bg: '#CBD5E1' },

  // variante: secondary (actions secondaires des nouveaux formulaires)
  { variant: 'secondary', state: 'active', text: '#1E293B', bg: '#E2E8F0' },
  { variant: 'secondary', state: 'disabled', text: '#475569', bg: '#F1F5F9' },

  // bascule de Module_Fonctionnel (Paramètres) — activé / désactivé / non habilité
  { variant: 'module-toggle', state: 'enabled', text: '#FFFFFF', bg: '#4F46E5' },
  { variant: 'module-toggle', state: 'disabled', text: '#475569', bg: '#E2E8F0' },
  { variant: 'module-toggle', state: 'locked', text: '#475569', bg: '#F1F5F9' },

  // badges d'état (Etat_Agence, Invitation_Collaborateur, Commande_Distante)
  { variant: 'badge-pending', state: 'active', text: '#854D0E', bg: '#FEF9C3' },
  { variant: 'badge-active', state: 'active', text: '#166534', bg: '#DCFCE7' },
  { variant: 'badge-suspended', state: 'active', text: '#991B1B', bg: '#FEE2E2' },
  { variant: 'badge-expired', state: 'active', text: '#475569', bg: '#F1F5F9' },
];

// Convertit un canal sRGB 0..255 en valeur linéaire (WCAG 2.1).
function channelToLinear(value) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// Luminance relative d'une couleur hex (#RRGGBB).
export function relativeLuminance(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return (
    0.2126 * channelToLinear(r) +
    0.7152 * channelToLinear(g) +
    0.0722 * channelToLinear(b)
  );
}

// Ratio de contraste WCAG 2.1 entre deux couleurs hex.
export function contrastRatio(hexA, hexB) {
  const la = relativeLuminance(hexA);
  const lb = relativeLuminance(hexB);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}
