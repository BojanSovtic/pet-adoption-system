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

export const apiClient = async <T>(
  path: string,
  options?: RequestInit,
): Promise<T> => {
  let response: Response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      // Send the HttpOnly session cookie to the API (a different port, so a
      // different origin). JavaScript never reads the cookie itself.
      credentials: 'include',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
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
