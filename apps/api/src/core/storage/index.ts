import { env } from '../config/env';
import { logger, serializeError } from '../logging/logger';
import { createCloudinaryFileStorage } from './cloudinary-file-storage';
import type { FileStorage } from './file-storage';
import { createLocalFileStorage } from './local-file-storage';

// Selected by STORAGE_DRIVER (config/storage-config.ts): local disk by
// default; Cloudinary for hosts without a persistent disk.
export const storage: FileStorage = env.cloudinary
  ? createCloudinaryFileStorage(env.cloudinary)
  : createLocalFileStorage({
      directory: env.uploadsDir,
      baseUrl: env.uploadsBaseUrl,
    });

/**
 * Deletes a file without failing the request: by the time this runs, the
 * database no longer points to it. A failure leaves an orphaned file, which
 * is logged.
 */
export const deleteStoredFileQuietly = async (key: string): Promise<void> => {
  try {
    await storage.delete(key);
  } catch (error) {
    logger.error('could not delete a stored file', {
      key,
      err: serializeError(error),
    });
  }
};
