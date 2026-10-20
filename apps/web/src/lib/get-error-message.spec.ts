import { describe, expect, it } from 'vitest';

import { ApiError } from './api-client';
import { getErrorMessage, getFieldErrors } from './get-error-message';

describe('getErrorMessage', () => {
  it('translates a known API error code', () => {
    expect(getErrorMessage(new ApiError(404, 'PET_NOT_FOUND'))).toBe(
      'The pet could not be found.',
    );
  });

  it('uses the fallback for an unknown code', () => {
    expect(getErrorMessage(new ApiError(418, 'TEAPOT'), 'Fallback')).toBe(
      'Fallback',
    );
  });

  it('uses the generic message for non-API errors', () => {
    expect(getErrorMessage(new Error('boom'))).toBe(
      'Something went wrong. Please try again.',
    );
  });
});

describe('getFieldErrors', () => {
  it('maps validation issues to top-level fields, first issue wins', () => {
    const error = new ApiError(400, 'VALIDATION_FAILED', [
      { field: 'name', code: 'too_small' },
      { field: 'name', code: 'too_big' },
      { field: 'items.0', code: 'invalid_format' },
      { field: 'age', code: 'some_unknown_code' },
    ]);

    expect(getFieldErrors(error)).toEqual({
      name: 'This value is too short or too small.',
      items: 'This value has an invalid format.',
      age: 'This value is invalid.',
    });
  });

  it('returns no field errors for other errors', () => {
    expect(getFieldErrors(new ApiError(404, 'PET_NOT_FOUND'))).toEqual({});
    expect(getFieldErrors(null)).toEqual({});
  });
});
