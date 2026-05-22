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
  const stored = localStorage.getItem(LANG_STORAGE_KEY);
  if (stored && SUPPORTED_LANGS.includes(stored as AppLanguage)) {
    return stored as AppLanguage;
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
