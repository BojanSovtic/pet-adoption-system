import { describe, expect, it } from 'vitest';

import { currentUserQueryKey } from '../features/auth/api/get-current-user';
import { ApiError } from '../lib/api-client';
import { queryClient, shouldRetry } from './query-client';

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

describe('session expiry handling', () => {
  it('marks the user as signed out when a request is unauthenticated', async () => {
    queryClient.setQueryData(currentUserQueryKey, { _id: '1', name: 'Milo' });

    await queryClient
      .fetchQuery({
        queryKey: ['protected'],
        queryFn: () => Promise.reject(new ApiError(401, 'UNAUTHENTICATED')),
      })
      .catch(() => undefined);

    expect(queryClient.getQueryData(currentUserQueryKey)).toBeNull();
  });

  it('keeps the user for other errors', async () => {
    const user = { _id: '1', name: 'Milo' };
    queryClient.setQueryData(currentUserQueryKey, user);

    await queryClient
      .fetchQuery({
        queryKey: ['other'],
        queryFn: () => Promise.reject(new ApiError(404, 'PET_NOT_FOUND')),
      })
      .catch(() => undefined);

    expect(queryClient.getQueryData(currentUserQueryKey)).toEqual(user);
  });
});
