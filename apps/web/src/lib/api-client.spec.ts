import axios from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, http } from './api-client';
import { failWithNetworkError, respondWith } from './testing/mock-http-adapter';

const originalAdapter = http.defaults.adapter;

const useAdapter = (adapter: ReturnType<typeof respondWith>) => {
  const mock = vi.fn(adapter);
  http.defaults.adapter = mock;
  return mock;
};

const catchError = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise;
  } catch (error) {
    return error;
  }

  throw new Error('Expected the request to fail');
};

describe('http (axios instance)', () => {
  afterEach(() => {
    http.defaults.adapter = originalAdapter;
  });

  it('sends the session cookie and returns the response data', async () => {
    const adapter = useAdapter(respondWith(200, [{ name: 'Milo' }]));

    const { data } = await http.get('/pets');

    expect(data).toEqual([{ name: 'Milo' }]);
    expect(adapter.mock.calls[0][0]).toMatchObject({
      url: '/pets',
      withCredentials: true,
    });
  });

  it('leaves undefined params out of the URL', () => {
    expect(
      http.getUri({
        url: '/pets',
        params: { search: 'milo', species: undefined, page: 2 },
      }),
    ).toMatch(/\/pets\?search=milo&page=2$/);
  });

  it('serializes object bodies as JSON', async () => {
    const adapter = useAdapter(respondWith(201, {}));

    await http.post('/pets', { name: 'Milo' });

    const config = adapter.mock.calls[0][0];
    expect(config.data).toBe('{"name":"Milo"}');
    expect(config.headers['Content-Type']).toContain('application/json');
  });

  it('turns an API error response into an ApiError', async () => {
    useAdapter(respondWith(404, { code: 'PET_NOT_FOUND' }));

    const error = await catchError(http.get('/pets/1'));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 404,
      code: 'PET_NOT_FOUND',
      details: [],
    });
  });

  it('keeps validation details', async () => {
    const details = [{ field: 'name', code: 'too_small' }];
    useAdapter(respondWith(400, { code: 'VALIDATION_FAILED', details }));

    const error = await catchError(http.post('/pets', {}));

    expect(error).toMatchObject({ code: 'VALIDATION_FAILED', details });
  });

  it('falls back to INTERNAL_SERVER_ERROR for an unexpected error body', async () => {
    useAdapter(respondWith(502, '<html>Bad gateway</html>'));

    const error = await catchError(http.get('/pets'));

    expect(error).toMatchObject({ status: 502, code: 'INTERNAL_SERVER_ERROR' });
  });

  it('turns a missing response into NETWORK_ERROR', async () => {
    useAdapter(failWithNetworkError);

    const error = await catchError(http.get('/pets'));

    expect(error).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('leaves cancelled requests as cancellations', async () => {
    useAdapter(respondWith(200, []));
    const controller = new AbortController();
    controller.abort();

    const error = await catchError(
      http.get('/pets', { signal: controller.signal }),
    );

    expect(error).not.toBeInstanceOf(ApiError);
    expect(axios.isCancel(error)).toBe(true);
  });

  it('resolves 204 No Content', async () => {
    useAdapter(respondWith(204));

    await expect(http.delete('/pets/1')).resolves.toMatchObject({
      status: 204,
    });
  });
});
