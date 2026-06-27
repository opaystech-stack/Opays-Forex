import { useApp } from '../context/AppContext';
import { useT } from '../i18n';

/**
 * Sélecteur de langue FR/EN réutilisable.
 * variant="dark"  -> charte sombre de la landing
 * variant="light" -> panneau de formulaire clair (auth)
 */
export default function LangToggle({ variant = 'dark', className = '' }) {
  const { language, setLanguage } = useApp();
  const t = useT();
  const current = language || 'fr';

  const isDark = variant === 'dark';
  const base = isDark
    ? 'border-[#1A2642] bg-[rgba(255,255,255,0.02)]'
    : 'border-[#E2E8F0] bg-[#F8FAFC]';

  const activeCls = isDark
    ? 'bg-[#4F46E5] text-white'
    : 'bg-[#4F46E5] text-white';
  const inactiveCls = isDark
    ? 'text-[#94A3B8] hover:text-[#F8FAFC]'
    : 'text-[#64748B] hover:text-[#0F172A]';

  const langs = [
    { code: 'fr', label: t('landing.lang_fr') },
    { code: 'en', label: t('landing.lang_en') },
  ];

  return (
    <div
      role="group"
      aria-label={t('landing.lang_aria')}
      className={`inline-flex items-center gap-0.5 rounded-lg border p-0.5 ${base} ${className}`}
    >
      {langs.map(({ code, label }) => (
        <button
          key={code}
          type="button"
          onClick={() => setLanguage(code)}
          aria-pressed={current === code}
          aria-label={label}
          className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
            current === code ? activeCls : inactiveCls
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
