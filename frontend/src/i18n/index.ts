import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import enCommon from './locales/en/common.json';
import esCommon from './locales/es/common.json';

const LANG_STORAGE_KEY = 'lang';
const SUPPORTED_LANGS = ['es', 'en'] as const;

export type AppLanguage = (typeof SUPPORTED_LANGS)[number];

function readStoredLanguage(): AppLanguage {
  if (typeof window === 'undefined') {
    return 'es';
  }
  const stored =
    localStorage.getItem(LANG_STORAGE_KEY) ||
    localStorage.getItem('i18nextLng') ||
    localStorage.getItem('ps_lang');
  if (stored) {
    const normalized = stored.toLowerCase().startsWith('en') ? 'en' : stored.toLowerCase().startsWith('es') ? 'es' : null;
    if (normalized && SUPPORTED_LANGS.includes(normalized)) {
      // Normalizar a la clave canónica del app.
      localStorage.setItem(LANG_STORAGE_KEY, normalized);
      return normalized;
    }
  }
  return 'es';
}

void i18n.use(initReactI18next).init({
  resources: {
    es: { common: esCommon },
    en: { common: enCommon },
  },
  lng: readStoredLanguage(),
  fallbackLng: 'es',
  supportedLngs: [...SUPPORTED_LANGS],
  defaultNS: 'common',
  ns: ['common'],
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
