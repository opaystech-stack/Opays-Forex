import { useT } from '../i18n';
import LogoIcon from './LogoIcon';

// BrandHeader : bloc d'identité de marque (logo + nom) positionné au-dessus
// des champs de formulaire des pages publiques. Purement présentiel : aucune
// logique métier. Le nom de marque provient de l'i18n (app.title) lorsque la
// prop `title` n'est pas fournie ; aucun libellé n'est codé en dur.
export default function BrandHeader({ title, subtitle }) {
  const t = useT();
  const brandName = title || t('app.title');

  return (
    <div className="brand-header">
      <LogoIcon className="brand-header__mark" />
      <span className="brand-header__name">{brandName}</span>
      {subtitle ? <span className="brand-header__subtitle">{subtitle}</span> : null}
    </div>
  );
}
