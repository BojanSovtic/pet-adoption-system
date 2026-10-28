// Serbian texts use the Latin script; plain "sr" would format in Cyrillic.
const toDateLocale = (language: string) =>
  language === 'sr' ? 'sr-Latn' : language;

/** A date (ISO string from the API) in the interface language, e.g. "26/10/2026". */
export const formatDate = (isoDate: string, language: string): string =>
  new Date(isoDate).toLocaleDateString(toDateLocale(language));
