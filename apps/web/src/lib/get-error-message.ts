import { i18n } from '../i18n/config';
import { ApiError } from './api-client';

/**
 * Translates an error into a user-facing message using its API error code.
 * Falls back to `fallback` (or the generic unexpected error) for unknown codes
 * and non-API errors.
 */
export const getErrorMessage = (error: unknown, fallback?: string): string => {
  const defaultValue = fallback ?? i18n.t('common:unexpectedError');

  if (error instanceof ApiError) {
    return i18n.t(`common:errors.${error.code}`, { defaultValue });
  }

  return defaultValue;
};

/**
 * Groups backend validation issues by top-level field name
 * (`imageUrls.0` → `imageUrls`), keeping the first message per field.
 */
export const getFieldErrors = (error: unknown): Record<string, string> => {
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION_FAILED') {
    return {};
  }

  const fieldErrors: Record<string, string> = {};

  for (const issue of error.details) {
    const [field] = issue.field.split('.');

    if (field && !fieldErrors[field]) {
      fieldErrors[field] = i18n.t(`common:validation.${issue.code}`, {
        defaultValue: i18n.t('common:validation.invalid'),
      });
    }
  }

  return fieldErrors;
};
