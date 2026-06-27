import { SUPPORTED_CURRENCIES, hasRate } from '../utils/currencies';
import { useT } from '../i18n';

// Sélecteur de devises réutilisable, alimenté par le registre centralisé.
// - Liste TOUTES les devises supportées, dans l'ordre du registre.
// - Aucune option n'est jamais désactivée (R3.2 : ne jamais empêcher la sélection).
// - Si `rates` est fourni et qu'aucun taux exploitable n'existe pour la devise
//   sélectionnée, un avertissement non bloquant est affiché (R3.4).
export default function CurrencySelect({
  value,
  onChange,
  rates,
  name,
  id,
  ariaLabel,
  className = 'form-control',
}) {
  const t = useT();
  const showWarning = Array.isArray(rates) && value && !hasRate(value, rates);

  return (
    <>
      <select
        className={className}
        value={value}
        onChange={onChange}
        name={name}
        id={id}
        aria-label={ariaLabel}
      >
        {SUPPORTED_CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>
            {t(c.labelKey)}
          </option>
        ))}
      </select>
      {showWarning && (
        <p
          className="currency-missing-rate"
          style={{ fontSize: '11px', color: 'var(--color-orange)', marginTop: '5px' }}
        >
          {t('currency_warning.missing_rate')}
        </p>
      )}
    </>
  );
}
