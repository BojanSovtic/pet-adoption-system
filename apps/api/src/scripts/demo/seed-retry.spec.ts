import {
  ApiUnreachableError,
  decideRetry,
  RETRY_LIMITS,
  retryAfterMs,
  sendWithRetry,
  UncertainOutcomeError,
  waitUntilReady,
} from './seed-retry';

const PET = 'aaaaaaaaaaaaaaaaaaaaaaaa';

const response = (status: number, headers: Record<string, string> = {}) =>
  new Response(status === 204 ? null : '{}', { status, headers });

/** A `send` that plays back these results (an Error means no response). */
const scripted = (results: Array<number | Error | Response>) => {
  const send = vi.fn(async () => {
    const next = results.shift();

    if (next === undefined) {
      throw new Error('no more scripted results');
    }

    if (next instanceof Error) {
      throw next;
    }

    return typeof next === 'number' ? response(next) : next;
  });

  return send;
};

const noWait = vi.fn(async () => undefined);

beforeEach(() => {
  noWait.mockClear();
});

describe('retryAfterMs', () => {
  it('reads a number of seconds', () => {
    expect(retryAfterMs('7')).toBe(7_000);
    expect(retryAfterMs(' 0 ')).toBe(0);
  });

  it('ignores anything else', () => {
    expect(retryAfterMs(null)).toBeNull();
    expect(retryAfterMs('Wed, 21 Oct 2026 07:28:00 GMT')).toBeNull();
    expect(retryAfterMs('-1')).toBeNull();
  });
});

describe('decideRetry', () => {
  const noResponse = { kind: 'no-response' } as const;
  const status = (code: number, retryAfter: string | null = null) =>
    ({ kind: 'response', status: code, retryAfter }) as const;

  it.each([200, 201, 400, 401, 403, 404, 409, 500])(
    'uses HTTP %i as the answer (no retry)',
    (code) => {
      expect(decideRetry('GET', '/pets/mine', status(code), 1)).toEqual({
        action: 'use',
      });
      expect(decideRetry('POST', '/pets', status(code), 1)).toEqual({
        action: 'use',
      });
    },
  );

  it('retries a read or a sign-in after no response or a gateway error, with backoff', () => {
    expect(decideRetry('GET', '/ready', noResponse, 1)).toEqual({
      action: 'retry',
      delayMs: 2_000,
    });
    expect(decideRetry('GET', '/pets/mine', status(503), 2)).toEqual({
      action: 'retry',
      delayMs: 4_000,
    });
    expect(decideRetry('POST', '/auth/login', status(502), 1)).toEqual({
      action: 'retry',
      delayMs: 2_000,
    });
  });

  it('stops retrying after the last try', () => {
    expect(
      decideRetry('GET', '/ready', status(504), RETRY_LIMITS.maxAttempts),
    ).toEqual({ action: 'use' });
  });

  it.each([
    ['POST', '/auth/register'],
    ['POST', '/pets'],
    ['POST', `/pets/${PET}/images`],
    ['POST', `/pets/${PET}/applications`],
    ['POST', `/applications/${PET}/accept`],
  ])(
    'never repeats %s %s without a clear answer: the outcome is uncertain',
    (method, apiPath) => {
      for (const outcome of [
        noResponse,
        status(502),
        status(503),
        status(504),
      ]) {
        expect(decideRetry(method, apiPath, outcome, 1)).toEqual({
          action: 'uncertain',
        });
      }
    },
  );

  it('retries a rate-limited request of any kind after a short Retry-After', () => {
    // A 429 is refused before the request runs, so nothing was changed.
    expect(decideRetry('POST', '/pets', status(429, '5'), 1)).toEqual({
      action: 'retry',
      delayMs: 5_000,
    });
    expect(decideRetry('GET', '/pets/mine', status(429), 1)).toEqual({
      action: 'retry',
      delayMs: 2_000,
    });
  });

  it('leaves a long Retry-After to the caller, and stops after the last try', () => {
    expect(decideRetry('POST', '/auth/login', status(429, '900'), 1)).toEqual({
      action: 'use',
    });
    expect(
      decideRetry(
        'GET',
        '/pets/mine',
        status(429, '1'),
        RETRY_LIMITS.maxAttempts,
      ),
    ).toEqual({ action: 'use' });
  });
});

describe('sendWithRetry', () => {
  it('returns the first clear answer without retrying', async () => {
    const send = scripted([400]);

    expect((await sendWithRetry('POST', '/pets', send, noWait)).status).toBe(
      400,
    );
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('retries a read until it gets an answer', async () => {
    const send = scripted([new TypeError('fetch failed'), 503, 200]);

    expect((await sendWithRetry('GET', '/ready', send, noWait)).status).toBe(
      200,
    );
    expect(send).toHaveBeenCalledTimes(3);
    expect(noWait.mock.calls).toEqual([[2_000], [4_000]]);
  });

  it('gives up on a read after the try limit', async () => {
    const send = scripted([
      new TypeError('fetch failed'),
      new TypeError('fetch failed'),
      new TypeError('fetch failed'),
    ]);

    await expect(sendWithRetry('GET', '/ready', send, noWait)).rejects.toThrow(
      ApiUnreachableError,
    );
    expect(send).toHaveBeenCalledTimes(RETRY_LIMITS.maxAttempts);
  });

  it('sends a change once and reports an uncertain outcome when the answer is lost', async () => {
    for (const lost of [new TypeError('fetch failed'), 502, 504]) {
      const send = scripted([lost, 201]);

      await expect(
        sendWithRetry('POST', `/applications/${PET}/accept`, send, noWait),
      ).rejects.toThrow(UncertainOutcomeError);
      expect(send).toHaveBeenCalledTimes(1);
    }

    expect(noWait).not.toHaveBeenCalled();
  });

  it('repeats a rate-limited change after its Retry-After', async () => {
    const send = scripted([response(429, { 'Retry-After': '3' }), 201]);

    expect((await sendWithRetry('POST', '/pets', send, noWait)).status).toBe(
      201,
    );
    expect(noWait.mock.calls).toEqual([[3_000]]);
  });
});

describe('waitUntilReady', () => {
  /** A clock that advances by each wait. */
  const clock = () => {
    let time = 0;

    return {
      now: () => time,
      wait: vi.fn(async (ms: number) => {
        time += ms;
      }),
    };
  };

  it('returns at once when the API is ready', async () => {
    const { now, wait } = clock();

    await expect(
      waitUntilReady(async () => true, {
        timeoutMs: 60_000,
        intervalMs: 5_000,
        now,
        wait,
      }),
    ).resolves.toBe(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it('keeps checking while the API wakes up', async () => {
    const { now, wait } = clock();
    const probe = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await expect(
      waitUntilReady(probe, {
        timeoutMs: 60_000,
        intervalMs: 5_000,
        now,
        wait,
      }),
    ).resolves.toBe(3);
    expect(wait.mock.calls).toEqual([[5_000], [5_000]]);
  });

  it('gives up after the timeout instead of waiting forever', async () => {
    const { now, wait } = clock();
    const probe = vi.fn(async () => false);

    await expect(
      waitUntilReady(probe, {
        timeoutMs: 20_000,
        intervalMs: 5_000,
        now,
        wait,
      }),
    ).rejects.toThrow('not ready after 20 s (5 checks)');
    expect(probe).toHaveBeenCalledTimes(5);
  });

  it('checks once when there is no wait (local targets)', async () => {
    const { now, wait } = clock();
    const probe = vi.fn(async () => false);

    await expect(
      waitUntilReady(probe, { timeoutMs: 0, intervalMs: 5_000, now, wait }),
    ).rejects.toThrow('The API is not ready.');
    expect(probe).toHaveBeenCalledTimes(1);
  });
});
