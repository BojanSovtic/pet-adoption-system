import { describe, expect, it } from 'vitest';

import { ApiError } from '../lib/api-client';
import { shouldRetry } from './query-client';

describe('shouldRetry', () => {
  it('does not retry client errors', () => {
    expect(shouldRetry(0, new ApiError(404, 'PET_NOT_FOUND'))).toBe(false);
    expect(shouldRetry(0, new ApiError(400, 'VALIDATION_FAILED'))).toBe(false);
  });

  it('retries network and server errors up to three times', () => {
    const networkError = new ApiError(0, 'NETWORK_ERROR');
    const serverError = new ApiError(500, 'INTERNAL_SERVER_ERROR');

    expect(shouldRetry(0, networkError)).toBe(true);
    expect(shouldRetry(2, serverError)).toBe(true);
    expect(shouldRetry(3, serverError)).toBe(false);
  });
});
