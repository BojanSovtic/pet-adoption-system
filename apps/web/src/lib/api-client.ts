import axios from 'axios';
import type { ApiErrorResponse, ValidationIssue } from '@pet-adoption/models';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly details: ValidationIssue[] = [],
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

const isApiErrorResponse = (data: unknown): data is ApiErrorResponse =>
  typeof data === 'object' &&
  data !== null &&
  'code' in data &&
  typeof data.code === 'string';

/**
 * Turns a failed request into an `ApiError` with the API's error code.
 * Cancelled requests (e.g. by TanStack Query) keep their own error type so
 * they are still recognised as cancellations.
 */
export const toApiError = (error: unknown): unknown => {
  if (axios.isCancel(error) || !axios.isAxiosError(error)) {
    return error;
  }

  // No response at all: offline, CORS, DNS.
  if (!error.response) {
    return new ApiError(0, 'NETWORK_ERROR');
  }

  const { status, data } = error.response;

  return isApiErrorResponse(data)
    ? new ApiError(status, data.code, data.details)
    : new ApiError(status, 'INTERNAL_SERVER_ERROR');
};

/**
 * The one HTTP client for the API. Axios sets `Content-Type: application/json`
 * for object bodies, none for GETs, and lets the browser set the multipart
 * boundary for `FormData`.
 */
export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  // Send the HttpOnly session cookie to the API (a different port, so a
  // different origin). JavaScript never reads the cookie itself.
  withCredentials: true,
});

// Every failure reaches the app as an `ApiError`. Reactions that need app
// state (signing out on 401, toasts, retries) live in app/query-client.ts.
http.interceptors.response.use(
  (response) => response,
  (error: unknown) => Promise.reject(toApiError(error)),
);
