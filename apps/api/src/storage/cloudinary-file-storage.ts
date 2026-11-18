import { createHash } from 'node:crypto';

import type { CloudinaryConfig } from '../config/storage-config';
import { assertSafeStorageKey, type FileStorage } from './file-storage';

const API_BASE = 'https://api.cloudinary.com/v1_1';
const DELIVERY_BASE = 'https://res.cloudinary.com';
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Cloudinary's request signature: the parameters (except file, cloud_name,
 * resource_type and api_key) sorted by name, joined as `name=value` with `&`,
 * the API secret appended without a separator, SHA-1, hex. Valid for one
 * hour from `timestamp`. https://cloudinary.com/documentation/authentication_signatures
 */
export const signCloudinaryParams = (
  params: Readonly<Record<string, string>>,
  apiSecret: string,
): string => {
  const serialized = Object.keys(params)
    .sort()
    .map((name) => `${name}=${params[name]}`)
    .join('&');

  return createHash('sha1')
    .update(serialized + apiSecret)
    .digest('hex');
};

/**
 * A storage key ("pets/<uuid>.jpg") as Cloudinary's public id and format.
 * The public id must not contain the extension: Cloudinary would keep it as
 * part of the id and deliver "pets/<uuid>.jpg.jpg".
 */
const splitKey = (key: string): { publicId: string; format: string } => {
  assertSafeStorageKey(key);
  const dot = key.lastIndexOf('.');

  return { publicId: key.slice(0, dot), format: key.slice(dot + 1) };
};

type CloudinaryResponse = {
  public_id?: unknown;
  format?: unknown;
  result?: unknown;
  existing?: unknown;
  error?: { message?: unknown };
};

/** Fails without the request's parameters: they include the signature. */
class CloudinaryRequestError extends Error {
  constructor(operation: string, detail: string) {
    super(`Cloudinary ${operation} failed: ${detail}`);
    this.name = 'CloudinaryRequestError';
  }
}

export type CloudinaryStorageOptions = CloudinaryConfig & {
  /** Replaceable in tests; the real network is never used there. */
  fetch?: typeof fetch;
  /** Milliseconds since the epoch; replaceable in tests. */
  now?: () => number;
};

/**
 * Photos in Cloudinary, uploaded with signed requests from the API (the API
 * secret never leaves the server) and delivered from Cloudinary's CDN in
 * their original format, without transformations. The photos were already
 * validated and re-encoded by `processPetImage`, so Cloudinary only stores
 * them; the database keeps the same keys as with local storage.
 */
export const createCloudinaryFileStorage = ({
  cloudName,
  apiKey,
  apiSecret,
  // Looked up per request, so a test can stub the global.
  fetch: fetchImpl = (input, init) => fetch(input, init),
  now = Date.now,
}: CloudinaryStorageOptions): FileStorage => {
  const post = async (
    operation: 'upload' | 'destroy',
    params: Record<string, string>,
    file?: Blob,
  ): Promise<CloudinaryResponse> => {
    const signed = {
      ...params,
      timestamp: String(Math.floor(now() / 1000)),
    };
    const form = new FormData();

    for (const [name, value] of Object.entries(signed)) {
      form.append(name, value);
    }

    form.append('api_key', apiKey);
    form.append('signature', signCloudinaryParams(signed, apiSecret));

    if (file) {
      form.append('file', file, 'photo');
    }

    let response: Response;

    try {
      response = await fetchImpl(
        `${API_BASE}/${cloudName}/image/${operation}`,
        {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );
    } catch (error) {
      throw new CloudinaryRequestError(
        operation,
        error instanceof Error ? error.name : 'network error',
      );
    }

    const body = (await response
      .json()
      .catch(() => ({}))) as CloudinaryResponse;

    if (!response.ok) {
      const message =
        typeof body.error?.message === 'string'
          ? `: ${body.error.message}`
          : '';

      throw new CloudinaryRequestError(
        operation,
        `HTTP ${response.status}${message}`,
      );
    }

    return body;
  };

  return {
    save: async (key, data, contentType) => {
      const { publicId, format } = splitKey(key);
      const body = await post(
        'upload',
        // Keys are random and never reused; never replace an existing photo.
        { overwrite: 'false', public_id: publicId },
        new Blob([new Uint8Array(data)], { type: contentType }),
      );

      // The delivery URL is built from the key, so the stored photo must have
      // exactly that id and format (a different format would make Cloudinary
      // convert on delivery). The caller removes the key if this throws.
      if (body.existing === true) {
        throw new CloudinaryRequestError(
          'upload',
          'the public id already exists',
        );
      }

      if (body.public_id !== publicId || body.format !== format) {
        throw new CloudinaryRequestError(
          'upload',
          'the stored id or format differs from the key',
        );
      }
    },

    delete: async (key) => {
      const { publicId } = splitKey(key);
      // `invalidate`: also drop cached copies from the CDN.
      const body = await post('destroy', {
        invalidate: 'true',
        public_id: publicId,
      });

      // A missing photo is not an error (FileStorage contract).
      if (body.result !== 'ok' && body.result !== 'not found') {
        throw new CloudinaryRequestError('destroy', 'unexpected result');
      }
    },

    // `<public id>.<format>` is the key itself. Like local storage, this
    // doesn't validate: it only builds a URL for a key read from the database.
    publicUrl: (key) => `${DELIVERY_BASE}/${cloudName}/image/upload/${key}`,
  };
};
