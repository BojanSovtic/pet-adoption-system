import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import enApplications from './locales/en/applications.json';
import enAuth from './locales/en/auth.json';
import enCommon from './locales/en/common.json';
import enPets from './locales/en/pets.json';
import srApplications from './locales/sr/applications.json';
import srAuth from './locales/sr/auth.json';
import srCommon from './locales/sr/common.json';
import srPets from './locales/sr/pets.json';

export const resources = {
  en: {
    applications: enApplications,
    auth: enAuth,
    common: enCommon,
    pets: enPets,
  },
  sr: {
    applications: srApplications,
    auth: srAuth,
    common: srCommon,
    pets: srPets,
  },
} as const;

export const SUPPORTED_LANGUAGES = ['en', 'sr'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

const LANGUAGE_STORAGE_KEY = 'language';

const isLanguage = (value: unknown): value is Language =>
  SUPPORTED_LANGUAGES.includes(value as Language);

// Storage can be unavailable (private mode, blocked site data); the app then
// simply starts in English and doesn't remember the choice.
const readStoredLanguage = (): Language => {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);

    return isLanguage(stored) ? stored : 'en';
  } catch {
    return 'en';
  }
};

const rememberLanguage = (language: string) => {
  // Screen readers and the browser's own UI use the page language.
  document.documentElement.lang = language;

  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Not remembered; the current page still switches.
  }
};

i18n.on('languageChanged', rememberLanguage);

i18n.use(initReactI18next).init({
  resources,
  lng: readStoredLanguage(),
  fallbackLng: 'en',
  supportedLngs: [...SUPPORTED_LANGUAGES],
  defaultNS: 'common',
  ns: ['common', 'pets', 'auth', 'applications'],
  interpolation: {
    escapeValue: false,
  },
});

export { i18n };
