import { Globe } from 'lucide-react';
import { useEffect, useState } from 'react';
import i18n from '@/i18n';

const LANG_STORAGE_KEY = 'lang';

export function LanguageToggle() {
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
      className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-[var(--pb-border)] bg-[var(--pb-surface)] px-2.5 text-[12px] font-semibold tracking-wide text-[var(--pb-charcoal)] transition-colors hover:bg-[var(--pb-olive-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pb-olive)]"
      aria-label={active === 'en' ? 'Switch to Spanish' : 'Cambiar a inglés'}
      title={active === 'en' ? 'Language: English (click for Spanish)' : 'Idioma: español (clic para inglés)'}
    >
      {/* Muestra el idioma activo (no el destino) para evitar confusión en revisión visual. */}
      <Globe className="h-3.5 w-3.5 opacity-70" aria-hidden />
      {active === 'en' ? 'EN' : 'ES'}
    </button>
  );
}
