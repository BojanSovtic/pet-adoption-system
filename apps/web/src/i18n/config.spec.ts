import { describe, expect, it } from 'vitest';

import { i18n } from './config';

describe('i18n config', () => {
  it('pluralizes pet age in English', () => {
    const t = i18n.getFixedT('en', 'pets');

    expect(t('age', { count: 1 })).toBe('1 year');
    expect(t('age', { count: 3 })).toBe('3 years');
  });

  it('pluralizes pet age in Serbian', () => {
    const t = i18n.getFixedT('sr', 'pets');

    expect(t('age', { count: 1 })).toBe('1 godina');
    expect(t('age', { count: 3 })).toBe('3 godine');
    expect(t('age', { count: 5 })).toBe('5 godina');
    expect(t('age', { count: 22 })).toBe('22 godine');
  });

  it.each(['en', 'sr'])('defines the global unexpected error in %s', (lng) => {
    expect(i18n.exists('common:unexpectedError', { lng })).toBe(true);
  });
});
