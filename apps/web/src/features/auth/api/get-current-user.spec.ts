import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../../lib/api-client';
import { getCurrentUser } from './get-current-user';

const stubFetch = (response: Response) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('getCurrentUser', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the user when signed in and sends the session cookie', async () => {
    const user = { _id: '1', email: 'milo@example.com', name: 'Milo' };
    stubFetch(json(user, 200));

    await expect(getCurrentUser()).resolves.toEqual(user);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/auth\/me$/),
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('returns null when there is no session', async () => {
    stubFetch(json({ code: 'UNAUTHENTICATED' }, 401));

    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it('rethrows other errors', async () => {
    stubFetch(json({ code: 'INTERNAL_SERVER_ERROR' }, 500));

    await expect(getCurrentUser()).rejects.toBeInstanceOf(ApiError);
  });
});
