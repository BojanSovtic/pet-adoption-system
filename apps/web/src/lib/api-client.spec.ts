import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiClient } from './api-client';

const mockFetch = (response: Response | Error) => {
  const fetchMock =
    response instanceof Error
      ? vi.fn().mockRejectedValue(response)
      : vi.fn().mockResolvedValue(response);

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
};

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const catchError = async (promise: Promise<unknown>): Promise<ApiError> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) {
      return error;
    }

    throw error;
  }

  throw new Error('Expected the request to fail');
};

describe('apiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the parsed JSON body on success', async () => {
    const fetchMock = mockFetch(jsonResponse([{ name: 'Milo' }], 200));

    await expect(apiClient('/pets')).resolves.toEqual([{ name: 'Milo' }]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/pets$/),
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  it('converts an API error response into an ApiError', async () => {
    mockFetch(jsonResponse({ code: 'PET_NOT_FOUND' }, 404));

    const error = await catchError(apiClient('/pets/1'));

    expect(error.status).toBe(404);
    expect(error.code).toBe('PET_NOT_FOUND');
    expect(error.details).toEqual([]);
  });

  it('keeps validation details', async () => {
    const details = [{ field: 'name', code: 'too_small' }];
    mockFetch(jsonResponse({ code: 'VALIDATION_FAILED', details }, 400));

    const error = await catchError(apiClient('/pets'));

    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details).toEqual(details);
  });

  it('falls back to INTERNAL_SERVER_ERROR for a non-JSON error body', async () => {
    mockFetch(new Response('<html>Bad gateway</html>', { status: 502 }));

    const error = await catchError(apiClient('/pets'));

    expect(error.status).toBe(502);
    expect(error.code).toBe('INTERNAL_SERVER_ERROR');
  });

  it('converts a network failure into NETWORK_ERROR', async () => {
    mockFetch(new TypeError('Failed to fetch'));

    const error = await catchError(apiClient('/pets'));

    expect(error.status).toBe(0);
    expect(error.code).toBe('NETWORK_ERROR');
  });
});
