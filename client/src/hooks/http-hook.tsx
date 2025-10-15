import { useState, useCallback, useRef, useEffect } from "react";

type SendRequestFunction = (
  url: string,
  method?: "GET" | "POST" | "PATCH" | "DELETE" | "PUT",
  body?: string | FormData | null,
  headers?: Record<string, string>
) => Promise<any>;

interface HttpHook {
  isLoading: boolean;
  error: string | null;
  sendRequest: SendRequestFunction;
  clearError: () => void;
}

export default function useHttp(): HttpHook {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const activeHttpRequests = useRef<AbortController[]>([]);

  const sendRequest: SendRequestFunction = useCallback(
    async (url, method = "GET", body = null, headers = {}) => {
      setIsLoading(true);

      const httpAbortController = new AbortController();
      activeHttpRequests.current.push(httpAbortController);

      try {
        const response = await fetch(url, {
          method,
          headers,
          body,
          signal: httpAbortController.signal,
        });

        activeHttpRequests.current = activeHttpRequests.current.filter(
          (controller) => controller !== httpAbortController
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "An unknown error occurred.");
        }

        setIsLoading(false);
        return data;
      } catch (err: any) {
        setIsLoading(false);

        if (err.name === "AbortError") {
          return undefined;
        }

        setError(err.message || "Request failed.");
        throw err;
      }
    },
    []
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      activeHttpRequests.current.forEach((abortController) =>
        abortController.abort()
      );
    };
  }, []);

  return { isLoading, error, sendRequest, clearError };
}
