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
      className="inline-flex h-8 min-w-[2.25rem] items-center justify-center rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold tracking-wide text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
      aria-label={active === 'en' ? 'Cambiar a español' : 'Switch to English'}
    >
      {active === 'en' ? 'ES' : 'EN'}
    </button>
  );
}
