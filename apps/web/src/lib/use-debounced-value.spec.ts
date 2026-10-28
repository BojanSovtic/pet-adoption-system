import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDebouncedValue } from './use-debounced-value';

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('only updates after the value stops changing', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'm' } },
    );

    rerender({ value: 'mi' });
    act(() => vi.advanceTimersByTime(200));
    rerender({ value: 'mil' });
    act(() => vi.advanceTimersByTime(200));

    // 400 ms have passed, but never 300 ms without a change.
    expect(result.current).toBe('m');

    act(() => vi.advanceTimersByTime(100));

    expect(result.current).toBe('mil');
  });
});
