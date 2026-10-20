import type { ApiErrorResponse, ValidationIssue } from '@pet-adoption/models';

const API_URL = import.meta.env.VITE_API_URL;

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

const parseErrorResponse = async (
  response: Response,
): Promise<ApiErrorResponse | null> => {
  const body: unknown = await response.json().catch(() => null);

  if (
    typeof body === 'object' &&
    body !== null &&
    'code' in body &&
    typeof body.code === 'string'
  ) {
    return body as ApiErrorResponse;
  }

  return null;
};

export type ApiClientOptions = RequestInit & {
  /** Added as a query string; `undefined` and empty values are left out. */
  searchParams?: Record<string, string | number | undefined>;
};

const toQueryString = (
  searchParams: ApiClientOptions['searchParams'],
): string => {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (value !== undefined && value !== '') {
      params.set(key, String(value));
    }
  }

  const query = params.toString();

  return query ? `?${query}` : '';
};

export const apiClient = async <T>(
  path: string,
  { searchParams, headers, ...options }: ApiClientOptions = {},
): Promise<T> => {
  let response: Response;

  try {
    response = await fetch(`${API_URL}${path}${toQueryString(searchParams)}`, {
      // Send the HttpOnly session cookie to the API (a different port, so a
      // different origin). JavaScript never reads the cookie itself.
      credentials: 'include',
      ...options,
      headers: {
        // Only JSON (string) bodies need this. On a GET it would make the
        // browser send an extra CORS preflight first, and for FormData the
        // browser must set "multipart/form-data" with its boundary itself.
        ...(typeof options.body === 'string' && {
          'Content-Type': 'application/json',
        }),
        ...headers,
      },
    });
  } catch {
    // fetch only rejects when no response was received (offline, CORS, DNS).
    throw new ApiError(0, 'NETWORK_ERROR');
  }

  if (!response.ok) {
    const error = await parseErrorResponse(response);

    throw new ApiError(
      response.status,
      error?.code ?? 'INTERNAL_SERVER_ERROR',
      error?.details,
    );
  }

  // 204 No Content (e.g. DELETE) has no body to parse.
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
};
