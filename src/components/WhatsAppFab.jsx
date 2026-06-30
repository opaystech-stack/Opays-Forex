import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageCircle } from 'lucide-react';
import { motion } from 'framer-motion';

// Un ancêtre « transformé » (transform / perspective / filter / will-change)
// crée un bloc conteneur pour `position: fixed`, ce qui réancre le FAB sur le
// parent au lieu du viewport. On détecte ce cas pour pouvoir l'éviter.
function isTransformed(el) {
  if (!el || el.nodeType !== 1) return false;
  const inline = el.style || {};
  let cs = {};
  try { cs = window.getComputedStyle(el) || {}; } catch { cs = {}; }
  const read = (prop) =>
    (inline[prop] && inline[prop] !== 'none' ? inline[prop] : (cs[prop] || 'none'));
  const transform = read('transform');
  const perspective = read('perspective');
  const filter = read('filter');
  const willChange = read('willChange') || '';
  return (
    (transform && transform !== 'none') ||
    (perspective && perspective !== 'none') ||
    (filter && filter !== 'none') ||
    /transform|perspective|filter/.test(willChange)
  );
}

// Cherche l'ancêtre le PLUS PROCHE de la position d'origine dont la chaîne
// jusqu'à <body> ne contient AUCUN ancêtre transformé : `position: fixed` y est
// donc bien ancré au viewport. À défaut, on retombe sur <body>.
function findPortalTarget(node) {
  if (typeof document === 'undefined' || !document.body) return null;
  const body = document.body;
  const chain = [];
  let el = node ? node.parentElement : null;
  while (el) {
    chain.push(el);
    if (el === body) break;
    el = el.parentElement;
  }
  if (chain.length === 0) return body;

  // On descend depuis <body> vers la position d'origine : la cible « sûre » est
  // l'élément le plus profond avant de rencontrer un ancêtre transformé.
  let target = body;
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const candidate = chain[i];
    if (isTransformed(candidate)) break;
    target = candidate;
  }
  return target;
}

export default function WhatsAppFab({ pendingCount = 0, onClick }) {
  const anchorRef = useRef(null);
  const [target, setTarget] = useState(null);

  useLayoutEffect(() => {
    if (pendingCount === 0) return;
    setTarget(findPortalTarget(anchorRef.current));
  }, [pendingCount]);

  if (pendingCount === 0) return null;

  const fab = (
    <motion.button
      type="button"
      className="whatsapp-fab"
      onClick={onClick}
      aria-label={`${pendingCount} brouillons à valider`}
      title="Brouillons WhatsApp à valider"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.95 }}
    >
      <MessageCircle size={24} />

      {/* Badge de notification du nombre de brouillons */}
      <span className="whatsapp-fab-badge">
        {pendingCount}
      </span>
    </motion.button>
  );

  return (
    <>
      {/* Ancre invisible : sert à localiser l'ancêtre non transformé le plus
          proche, vers lequel le FAB est porté (portail) pour rester ancré au
          viewport (bas à droite) même sous un conteneur `motion`/transformé. */}
      <span ref={anchorRef} aria-hidden="true" style={{ display: 'none' }} />
      {target ? createPortal(fab, target) : null}
    </>
  );
}
