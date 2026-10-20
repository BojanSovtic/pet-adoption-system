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

i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: ['common', 'pets', 'auth', 'applications'],
  interpolation: {
    escapeValue: false,
  },
});

export { i18n };
