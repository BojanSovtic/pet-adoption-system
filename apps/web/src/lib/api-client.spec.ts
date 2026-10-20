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
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('sends a JSON Content-Type only with JSON bodies', async () => {
    // A response body can only be read once, so each call gets a new one.
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse({}, 200)),
    );
    vi.stubGlobal('fetch', fetchMock);

    await apiClient('/pets');
    await apiClient('/pets', { method: 'POST', body: '{}' });
    await apiClient('/pets/1/image', { method: 'PUT', body: new FormData() });

    // GET: none, so no CORS preflight.
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({});
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toEqual({
      'Content-Type': 'application/json',
    });
    // FormData: the browser sets multipart/form-data with its boundary.
    expect(fetchMock.mock.calls[2]?.[1]?.headers).toEqual({});
  });

  it('adds search params, leaving out empty values', async () => {
    const fetchMock = mockFetch(jsonResponse({}, 200));

    await apiClient('/pets', {
      searchParams: {
        search: 'milo bo',
        species: undefined,
        page: 2,
        status: '',
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/pets\?search=milo\+bo&page=2$/),
      expect.anything(),
    );
  });

  it('returns undefined for 204 No Content', async () => {
    mockFetch(new Response(null, { status: 204 }));

    await expect(
      apiClient('/pets/1', { method: 'DELETE' }),
    ).resolves.toBeUndefined();
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
