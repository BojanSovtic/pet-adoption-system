import { describe, expect, it } from 'vitest';

import {
  createCloudinaryFileStorage,
  signCloudinaryParams,
} from './cloudinary-file-storage';

const CONFIG = {
  cloudName: 'demo',
  apiKey: '123456789012345',
  apiSecret: 'test-api-secret-0123456789',
};
const NOW_MS = 1_700_000_000_123;
const TIMESTAMP = '1700000000';

type Call = { url: string; method?: string; form: FormData };

/**
 * A stand-in for `fetch` that records each request and answers with the
 * given responses in order. Nothing reaches the network.
 */
const fakeFetch = (...responses: Array<Response | Error>) => {
  const calls: Call[] = [];
  const impl = (async (
    input: Parameters<typeof fetch>[0],
    init?: RequestInit,
  ) => {
    calls.push({
      url: String(input),
      method: init?.method,
      form: init?.body as FormData,
    });
    const next = responses.shift();

    if (!next) {
      throw new Error('unexpected request');
    }

    if (next instanceof Error) {
      throw next;
    }

    return next;
  }) as typeof fetch;

  return { impl, calls };
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const createStorage = (fetchImpl: typeof fetch) =>
  createCloudinaryFileStorage({
    ...CONFIG,
    fetch: fetchImpl,
    now: () => NOW_MS,
  });

const fields = (form: FormData) =>
  Object.fromEntries(
    [...form.entries()].filter(([, value]) => typeof value === 'string'),
  );

describe('signCloudinaryParams', () => {
  // The examples from https://cloudinary.com/documentation/authentication_signatures
  it('matches the documented examples', () => {
    expect(signCloudinaryParams({ timestamp: '1315060510' }, 'abcd')).toBe(
      'a21ad0f63beb4de2e5575204b79ab90bffb02c10',
    );
    expect(
      signCloudinaryParams(
        {
          timestamp: '1315060510',
          public_id: 'sample_image',
          eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop',
        },
        'abcd',
      ),
    ).toBe('bfd09f95f331f558cbd1320e67aa8d488770583e');
  });

  it('does not depend on the order the parameters are given in', () => {
    expect(signCloudinaryParams({ b: '2', a: '1' }, 's')).toBe(
      signCloudinaryParams({ a: '1', b: '2' }, 's'),
    );
  });
});

describe('createCloudinaryFileStorage', () => {
  describe('save', () => {
    it('uploads a signed request with the public id and the photo bytes', async () => {
      const { impl, calls } = fakeFetch(
        json(200, { public_id: 'pets/abc-123', format: 'jpg' }),
      );

      await createStorage(impl).save(
        'pets/abc-123.jpg',
        Buffer.from('JPEG-BYTES'),
        'image/jpeg',
      );

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe(
        'https://api.cloudinary.com/v1_1/demo/image/upload',
      );
      expect(calls[0].method).toBe('POST');

      const sent = fields(calls[0].form);
      expect(sent).toEqual({
        overwrite: 'false',
        public_id: 'pets/abc-123',
        timestamp: TIMESTAMP,
        api_key: CONFIG.apiKey,
        signature: signCloudinaryParams(
          {
            overwrite: 'false',
            public_id: 'pets/abc-123',
            timestamp: TIMESTAMP,
          },
          CONFIG.apiSecret,
        ),
      });
      // The secret is used for the signature only, never sent.
      expect(JSON.stringify(sent)).not.toContain(CONFIG.apiSecret);

      const file = calls[0].form.get('file') as Blob;
      expect(file.type).toBe('image/jpeg');
      expect(Buffer.from(await file.arrayBuffer()).toString()).toBe(
        'JPEG-BYTES',
      );
    });

    it('fails on an error response without exposing the signature or secret', async () => {
      const { impl, calls } = fakeFetch(
        json(401, { error: { message: 'Invalid Signature' } }),
      );

      const error = await createStorage(impl)
        .save('pets/abc.png', Buffer.from('x'), 'image/png')
        .catch((caught: Error) => caught);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(
        'Cloudinary upload failed: HTTP 401: Invalid Signature',
      );

      const signature = String(calls[0].form.get('signature'));
      expect((error as Error).message).not.toContain(signature);
      expect((error as Error).message).not.toContain(CONFIG.apiSecret);
    });

    it('fails on a response that is not JSON', async () => {
      const { impl } = fakeFetch(new Response('<html>', { status: 502 }));

      await expect(
        createStorage(impl).save('pets/abc.png', Buffer.from('x'), 'image/png'),
      ).rejects.toThrow('Cloudinary upload failed: HTTP 502');
    });

    it('fails on a network error or timeout', async () => {
      const timeout = new DOMException('timed out', 'TimeoutError');
      const { impl } = fakeFetch(timeout);

      await expect(
        createStorage(impl).save('pets/abc.png', Buffer.from('x'), 'image/png'),
      ).rejects.toThrow('Cloudinary upload failed: TimeoutError');
    });

    it.each([
      ['a different public id', { public_id: 'pets/other', format: 'png' }],
      ['a different format', { public_id: 'pets/abc', format: 'jpg' }],
      [
        'an existing photo',
        { public_id: 'pets/abc', format: 'png', existing: true },
      ],
    ])('fails when Cloudinary reports %s', async (label, body) => {
      const { impl } = fakeFetch(json(200, body));

      await expect(
        createStorage(impl).save('pets/abc.png', Buffer.from('x'), 'image/png'),
      ).rejects.toThrow(/Cloudinary upload failed/);
    });

    it.each(['../etc/passwd.png', 'pets/abc', 'pets/ABC.png', 'pets/a b.png'])(
      'refuses an unsafe key (%j) without a request',
      async (key) => {
        const { impl, calls } = fakeFetch();

        await expect(
          createStorage(impl).save(key, Buffer.from('x'), 'image/png'),
        ).rejects.toThrow(/Unsafe storage key/);
        expect(calls).toHaveLength(0);
      },
    );
  });

  describe('delete', () => {
    it('sends a signed destroy request that also clears the CDN cache', async () => {
      const { impl, calls } = fakeFetch(json(200, { result: 'ok' }));

      await createStorage(impl).delete('pets/abc-123.webp');

      expect(calls[0].url).toBe(
        'https://api.cloudinary.com/v1_1/demo/image/destroy',
      );
      expect(fields(calls[0].form)).toEqual({
        invalidate: 'true',
        public_id: 'pets/abc-123',
        timestamp: TIMESTAMP,
        api_key: CONFIG.apiKey,
        signature: signCloudinaryParams(
          {
            invalidate: 'true',
            public_id: 'pets/abc-123',
            timestamp: TIMESTAMP,
          },
          CONFIG.apiSecret,
        ),
      });
      expect(calls[0].form.get('file')).toBeNull();
    });

    it('treats a missing photo as deleted', async () => {
      const { impl } = fakeFetch(json(200, { result: 'not found' }));

      await expect(
        createStorage(impl).delete('pets/abc.jpg'),
      ).resolves.toBeUndefined();
    });

    it('fails on an unexpected result or an error response', async () => {
      const { impl } = fakeFetch(
        json(200, { result: 'error' }),
        json(500, { error: { message: 'boom' } }),
      );
      const storage = createStorage(impl);

      await expect(storage.delete('pets/abc.jpg')).rejects.toThrow(
        'Cloudinary destroy failed: unexpected result',
      );
      await expect(storage.delete('pets/abc.jpg')).rejects.toThrow(
        'Cloudinary destroy failed: HTTP 500: boom',
      );
    });
  });

  describe('publicUrl', () => {
    it('is the CDN URL of the original photo, without transformations', () => {
      const { impl, calls } = fakeFetch();

      expect(createStorage(impl).publicUrl('pets/abc-123.jpg')).toBe(
        'https://res.cloudinary.com/demo/image/upload/pets/abc-123.jpg',
      );
      expect(calls).toHaveLength(0);
    });
  });
});
