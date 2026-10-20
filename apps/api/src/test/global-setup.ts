import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string;
    uploadsDir: string;
  }
}

let replSet: MongoMemoryReplSet | undefined;
let uploadsDir: string | undefined;

/**
 * Starts a throwaway single-node MongoDB replica set for the whole test run.
 * A replica set (not a standalone server) is required for transactions, and
 * this works on any machine without touching a local MongoDB installation.
 * The MongoDB binary is downloaded and cached on the first run.
 *
 * Uploaded files go to a temporary directory, never to apps/api/uploads.
 */
export const setup = async (project: TestProject): Promise<void> => {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  uploadsDir = await mkdtemp(path.join(tmpdir(), 'pet-adoption-uploads-'));

  project.provide('mongoUri', replSet.getUri('pet-adoption-test'));
  project.provide('uploadsDir', uploadsDir);
};

export const teardown = async (): Promise<void> => {
  await replSet?.stop();

  if (uploadsDir) {
    await rm(uploadsDir, { recursive: true, force: true });
  }
};
