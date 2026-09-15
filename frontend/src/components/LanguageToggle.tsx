import { ChevronDown, Globe } from 'lucide-react';
import { useEffect, useState } from 'react';
import i18n from '@/i18n';

const LANG_STORAGE_KEY = 'lang';

export function LanguageToggle({
  plain = false,
  showChevron = false,
}: {
  plain?: boolean;
  showChevron?: boolean;
} = {}) {
  const [active, setActive] = useState<'es' | 'en'>(
    i18n.language.startsWith('en') ? 'en' : 'es'
  );

  useEffect(() => {
    const handler = (lng: string) => {
      setActive(lng.startsWith('en') ? 'en' : 'es');
    };
    i18n.on('languageChanged', handler);
    return () => i18n.off('languageChanged', handler);
  }, []);

  const handleClick = () => {
    const next = active === 'en' ? 'es' : 'en';
    void i18n.changeLanguage(next);
    localStorage.setItem(LANG_STORAGE_KEY, next);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={
        plain
          ? 'inline-flex h-9 items-center justify-center gap-1.5 px-1 text-[12px] font-semibold tracking-wide text-[var(--ink)] transition-colors hover:text-[var(--olive-700)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--olive-700)]'
          : 'inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-[var(--stone-300)] bg-[var(--stone-50)] px-2.5 text-[12px] font-semibold tracking-wide text-[var(--ink)] transition-colors hover:bg-[var(--sage-100)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--olive-700)]'
      }
      aria-label={active === 'en' ? 'Switch to Spanish' : 'Cambiar a inglés'}
      title={active === 'en' ? 'Language: English (click for Spanish)' : 'Idioma: español (clic para inglés)'}
    >
      {/* Muestra el idioma activo (no el destino) para evitar confusión en revisión visual. */}
      <Globe className={plain ? 'h-[18px] w-[18px] opacity-75' : 'h-3 w-3 opacity-70'} aria-hidden />
      {active === 'en' ? 'EN' : 'ES'}
      {showChevron ? <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden /> : null}
    </button>
  );
}
