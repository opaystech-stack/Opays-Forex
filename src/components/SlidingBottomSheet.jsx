import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

export default function SlidingBottomSheet({
  isOpen,
  onClose,
  title,
  children,
  isMobile = true,
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Empêche le défilement du body lorsque le bottom sheet est ouvert en plein écran sur mobile
  useEffect(() => {
    if (isOpen && isMobile) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, isMobile]);

  // Réinitialiser la hauteur lors de la réouverture
  useEffect(() => {
    if (isOpen) {
      setIsExpanded(false);
    }
  }, [isOpen]);

  if (!isMobile) {
    return (
      <div className="desktop-sheet-container">
        {title && (
          <div className="desktop-sheet-header">
            <h2 className="desktop-sheet-title">{title}</h2>
          </div>
        )}
        <div className="desktop-sheet-content">
          {children}
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop avec un flou léger et transition d'opacité */}
          <motion.div
            className="bottom-sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Panneau glissant */}
          <motion.div
            className="bottom-sheet-container"
            initial={{ y: '100%' }}
            animate={{ y: 0, height: isExpanded ? '85vh' : '45vh' }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.1, bottom: 0.5 }}
            onDragEnd={(event, info) => {
              // Si l'utilisateur glisse vers le bas de plus de 120px, on ferme
              if (info.offset.y > 120) {
                onClose();
              } else if (info.offset.y < -50) {
                // Glissement vers le haut expand le bottom sheet
                setIsExpanded(true);
              } else if (info.offset.y > 50) {
                // Glissement vers le bas collapse le bottom sheet
                setIsExpanded(false);
              }
            }}
            style={{
              height: isExpanded ? '85vh' : '45vh',
            }}
          >
            {/* Poignée tactile de drag */}
            <div 
              className="bottom-sheet-drag-handle-area" 
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              style={{ cursor: 'pointer' }}
            >
              <div className="bottom-sheet-drag-handle" />
            </div>

            {/* En-tête */}
            <div className="bottom-sheet-header">
              <h3 className="bottom-sheet-title">{title}</h3>
              <button
                type="button"
                className="bottom-sheet-close-btn"
                onClick={onClose}
                aria-label="Fermer le panneau"
              >
                <X size={18} />
              </button>
            </div>

            {/* Zone de contenu scrollable */}
            <div className="bottom-sheet-scroll-content">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
