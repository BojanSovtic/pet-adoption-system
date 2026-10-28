import { env } from '../config/env';
import type { FileStorage } from './file-storage';
import { createLocalFileStorage } from './local-file-storage';

// Local disk for now. For deployment to a host without a persistent disk,
// add an object-storage implementation of `FileStorage` and select it here.
export const storage: FileStorage = createLocalFileStorage({
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
    console.error(`[ storage ] Could not delete ${key}`, error);
  }
};
