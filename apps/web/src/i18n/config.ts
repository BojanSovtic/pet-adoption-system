import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import enCommon from './locales/en/common.json';
import enPets from './locales/en/pets.json';
import srCommon from './locales/sr/common.json';
import srPets from './locales/sr/pets.json';

export const resources = {
  en: {
    common: enCommon,
    pets: enPets,
  },
  sr: {
    common: srCommon,
    pets: srPets,
  },
} as const;

i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: ['common', 'pets'],
  interpolation: {
    escapeValue: false,
  },
});

export { i18n };
