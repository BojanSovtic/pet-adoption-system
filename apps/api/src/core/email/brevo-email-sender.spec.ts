import { describe, expect, it, vi } from 'vitest';

import { serializeError } from '../logging/logger';
import { captureLogs } from '../../test/log-capture';
import { createBrevoEmailSender } from './brevo-email-sender';
import { EmailDeliveryError } from './email-sender';

const API_KEY = 'xkeysib-test-key-0123456789abcdef';
const from = { address: 'no-reply@pets.example.org', name: 'Pet Adoption' };
const message = {
  to: 'milo@example.com',
  subject: 'Confirm your email',
  text: 'Open https://pets.example.org/verify#token=secret-token',
  html: '<a href="https://pets.example.org/verify#token=secret-token">Confirm</a>',
};

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/** A fetch that never answers, but rejects like the real one when aborted. */
const hangingFetch: typeof fetch = (input, init) =>
  new Promise((resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
  });

const sendWith = (fetchImpl: typeof fetch, timeoutMs?: number) =>
  createBrevoEmailSender({
    apiKey: API_KEY,
    from,
    fetch: fetchImpl,
    timeoutMs,
  }).send(message);

/** Runs `send`, returns the error it rejected with. */
const failureOf = async (send: Promise<unknown>): Promise<unknown> => {
  try {
    await send;
  } catch (error) {
    return error;
  }

  throw new Error('expected the send to fail');
};

/** No secret, recipient or content in the error or anything logged. */
const expectNothingSensitive = (text: string) => {
  for (const secret of [
    API_KEY,
    message.to,
    'secret-token',
    message.subject,
    'Readable message from Brevo',
  ]) {
    expect(text).not.toContain(secret);
  }
};

describe('createBrevoEmailSender', () => {
  it('sends one request to the transactional email endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse(201, { messageId: '<20261127.1@smtp-relay.brevo.com>' }),
    );

    const receipt = await sendWith(fetchMock);

    expect(receipt).toEqual({ id: '<20261127.1@smtp-relay.brevo.com>' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];

    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': API_KEY,
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init?.body))).toEqual({
      sender: { name: 'Pet Adoption', email: 'no-reply@pets.example.org' },
      to: [{ email: 'milo@example.com' }],
      subject: message.subject,
      htmlContent: message.html,
      textContent: message.text,
    });
  });

  it('still succeeds when the response has no message id', async () => {
    expect(
      await sendWith(async () => new Response(null, { status: 201 })),
    ).toEqual({ id: 'unknown' });
  });

  it('reports a rejection with the status and Brevo error code only', async () => {
    const error = await failureOf(
      sendWith(async () =>
        jsonResponse(400, {
          code: 'unauthorized',
          message: `Readable message from Brevo about ${message.to}`,
        }),
      ),
    );

    expect(error).toBeInstanceOf(EmailDeliveryError);
    expect(error).toMatchObject({
      failure: 'rejected',
      status: 400,
      providerCode: 'unauthorized',
    });
    expect((error as Error).message).toBe(
      'Brevo did not accept the email: rejected, HTTP 400, unauthorized',
    );
    expectNothingSensitive(JSON.stringify(serializeError(error)));
  });

  it('drops an unexpected error code instead of reporting it', async () => {
    const error = await failureOf(
      sendWith(async () => jsonResponse(500, { code: message.to })),
    );

    expect(error).toMatchObject({ status: 500, providerCode: undefined });
    expectNothingSensitive((error as Error).message);
  });

  it('handles a rejection without a JSON body', async () => {
    const error = await failureOf(
      sendWith(
        async () => new Response('<html>Bad gateway</html>', { status: 502 }),
      ),
    );

    expect(error).toMatchObject({ failure: 'rejected', status: 502 });
  });

  it('reports a network failure without its details', async () => {
    const error = await failureOf(
      sendWith(async () => {
        throw new TypeError(`fetch failed for ${message.to}`);
      }),
    );

    expect(error).toBeInstanceOf(EmailDeliveryError);
    expect(error).toMatchObject({ failure: 'network', status: undefined });
    expectNothingSensitive(JSON.stringify(serializeError(error)));
  });

  it('gives up after the timeout', async () => {
    const error = await failureOf(sendWith(hangingFetch, 20));

    expect(error).toBeInstanceOf(EmailDeliveryError);
    expect(error).toMatchObject({ failure: 'timeout' });
  });

  it('writes no logs, whether it succeeds or fails', async () => {
    const logs = captureLogs();

    try {
      await sendWith(async () => jsonResponse(201, { messageId: 'id-1' }));
      await failureOf(sendWith(async () => jsonResponse(400, { code: 'x' })));
      await failureOf(sendWith(hangingFetch, 20));
    } finally {
      logs.restore();
    }

    expect(logs.entries).toEqual([]);
  });
});
