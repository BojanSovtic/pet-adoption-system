import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, http } from '../../../lib/api-client';
import { respondWith } from '../../../lib/testing/mock-http-adapter';
import { getCurrentUser } from './get-current-user';

const originalAdapter = http.defaults.adapter;

describe('getCurrentUser', () => {
  afterEach(() => {
    http.defaults.adapter = originalAdapter;
  });

  it('returns the user when signed in and sends the session cookie', async () => {
    const user = { _id: '1', email: 'milo@example.com', name: 'Milo' };
    const adapter = vi.fn(respondWith(200, user));
    http.defaults.adapter = adapter;

    await expect(getCurrentUser()).resolves.toEqual(user);
    expect(adapter.mock.calls[0][0]).toMatchObject({
      url: '/auth/me',
      withCredentials: true,
    });
  });

  it('returns null when there is no session', async () => {
    http.defaults.adapter = respondWith(401, { code: 'UNAUTHENTICATED' });

    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it('rethrows other errors', async () => {
    http.defaults.adapter = respondWith(500, { code: 'INTERNAL_SERVER_ERROR' });

    await expect(getCurrentUser()).rejects.toBeInstanceOf(ApiError);
  });
});
