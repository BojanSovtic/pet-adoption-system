import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { inject } from 'vitest';

/**
 * Files currently stored under `folder` in the test uploads directory (see
 * global-setup.ts). A folder that doesn't exist yet means no files.
 */
export const listStoredFiles = async (folder: string): Promise<string[]> => {
  try {
    return await readdir(path.join(inject('uploadsDir'), folder));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    throw error;
  }
};
