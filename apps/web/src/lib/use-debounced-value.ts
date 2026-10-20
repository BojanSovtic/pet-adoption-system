import { useEffect, useState } from 'react';

/** Returns `value` once it has stopped changing for `delayMs`. */
export const useDebouncedValue = <T>(value: T, delayMs: number): T => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedValue(value), delayMs);

    // A new value cancels the pending update: only the last one wins.
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debouncedValue;
};
