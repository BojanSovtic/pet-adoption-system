import { AxiosError, type AxiosAdapter, type AxiosResponse } from 'axios';

/**
 * Fake transports for the `http` instance in tests (`http.defaults.adapter`).
 * Interceptors still run, so tests exercise the real error handling. Like
 * axios's built-in adapters, non-2xx responses reject with an `AxiosError`.
 */
export const respondWith =
  (status: number, data: unknown = ''): AxiosAdapter =>
  async (config) => {
    const response: AxiosResponse = {
      status,
      statusText: '',
      data,
      headers: {},
      config,
    };

    if (status >= 200 && status < 300) {
      return response;
    }

    throw new AxiosError(
      `Request failed with status code ${status}`,
      AxiosError.ERR_BAD_RESPONSE,
      config,
      null,
      response,
    );
  };

/** No response at all, as when the browser is offline or CORS blocks it. */
export const failWithNetworkError: AxiosAdapter = async (config) => {
  throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config, null);
};
