type Source = Readonly<Record<string, string | undefined>>;

export const STORAGE_DRIVERS = ['local', 'cloudinary'] as const;
export type StorageDriver = (typeof STORAGE_DRIVERS)[number];

export type CloudinaryConfig = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
};

/**
 * Where pet photos are stored, from `STORAGE_DRIVER`:
 * - `local` (default): files on the API's disk (UPLOADS_DIR), served by the
 *   API under /uploads. Needs a persistent disk.
 * - `cloudinary`: Cloudinary's media storage and CDN (storage/
 *   cloudinary-file-storage.ts), for hosts whose disk is wiped on restart.
 */
export const readStorageDriver = (
  source: Source = process.env,
): StorageDriver => {
  const value = source.STORAGE_DRIVER?.trim();

  if (!value) {
    return 'local';
  }

  if (!(STORAGE_DRIVERS as readonly string[]).includes(value)) {
    throw new Error(
      `STORAGE_DRIVER must be one of ${STORAGE_DRIVERS.join(', ')} (got ${value})`,
    );
  }

  return value as StorageDriver;
};

// Formats of the values the Cloudinary console shows. Checked at startup so a
// pasted value with a stray space or quote fails here, not on the first
// upload. Error messages name the variable, never the value.
const CLOUD_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const API_KEY = /^\d+$/;
const API_SECRET = /^[\x21-\x7e]{16,}$/;

const required = (source: Source, name: string, format: RegExp): string => {
  const value = source[name];

  if (!value) {
    throw new Error(`${name} is required when STORAGE_DRIVER=cloudinary`);
  }

  if (!format.test(value)) {
    throw new Error(
      `${name} is malformed (copy it again from the Cloudinary console, without quotes or spaces)`,
    );
  }

  return value;
};

/** The Cloudinary account settings; read only when that driver is selected. */
export const readCloudinaryConfig = (
  source: Source = process.env,
): CloudinaryConfig => ({
  cloudName: required(source, 'CLOUDINARY_CLOUD_NAME', CLOUD_NAME),
  apiKey: required(source, 'CLOUDINARY_API_KEY', API_KEY),
  apiSecret: required(source, 'CLOUDINARY_API_SECRET', API_SECRET),
});
