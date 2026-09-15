const API_URL = import.meta.env.VITE_API_URL;

export type ApiErrorResponse = {
  code: string;
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

export const apiClient = async <T>(
  path: string,
  options?: RequestInit,
): Promise<T> => {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = (await response
      .json()
      .catch(() => null)) as ApiErrorResponse | null;

    throw new ApiError(response.status, error?.code ?? 'INTERNAL_SERVER_ERROR');
  }

  return response.json() as Promise<T>;
};
