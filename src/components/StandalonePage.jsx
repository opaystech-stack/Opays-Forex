// StandalonePage — conteneur des pages rendues HORS de l'AppShell
// (Page_Paiement, Page_Acces_Restreint, garde d'agence suspendue).
//
// Ces pages sont montées directement par le routeur, sans le wrapper
// `.app-container`/`.page-content` qui applique le Theme_Clair et le padding.
// Sans ce conteneur, elles s'affichaient sur le fond sombre du body, sans marge
// haute (titre coupe) et avec un titre sombre illisible. StandalonePage retablit
// le Theme_Clair, un padding sur, le defilement vertical et une colonne centree,
// pour une experience coherente avec le reste de l'application.
export default function StandalonePage({ children, maxWidth }) {
  return (
    <div className="standalone-page" style={{ position: 'relative', overflow: 'hidden' }}>
      <div className="floating-spheres">
        <div className="sphere sphere-1"></div>
        <div className="sphere sphere-2"></div>
        <div className="sphere sphere-3"></div>
        <div className="sphere sphere-4"></div>
      </div>
      <div
        className="standalone-page__inner"
        style={{ position: 'relative', zIndex: 1, ...(maxWidth ? { maxWidth: `${maxWidth}px` } : {}) }}
      >
        {children}
      </div>
    </div>
  );
}
