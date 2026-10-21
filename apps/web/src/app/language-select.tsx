import { useTranslation } from 'react-i18next';

import { SUPPORTED_LANGUAGES, type Language } from '../i18n/config';

// Each language is named in itself, so people find their own.
const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  sr: 'Srpski',
};

/** Switches the interface language; the choice is remembered (i18n/config). */
const LanguageSelect = () => {
  const { t, i18n } = useTranslation('common');

  return (
    <select
      aria-label={t('language.label')}
      value={i18n.resolvedLanguage}
      onChange={(event) => void i18n.changeLanguage(event.target.value)}
      className="h-9 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {SUPPORTED_LANGUAGES.map((language) => (
        <option key={language} value={language} lang={language}>
          {LANGUAGE_NAMES[language]}
        </option>
      ))}
    </select>
  );
};

export { LanguageSelect };
