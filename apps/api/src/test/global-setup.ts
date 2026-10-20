import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string;
  }
}

let replSet: MongoMemoryReplSet | undefined;

/**
 * Starts a throwaway single-node MongoDB replica set for the whole test run.
 * A replica set (not a standalone server) is required for transactions, and
 * this works on any machine without touching a local MongoDB installation.
 * The MongoDB binary is downloaded and cached on the first run.
 */
export const setup = async (project: TestProject): Promise<void> => {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });

  project.provide('mongoUri', replSet.getUri('pet-adoption-test'));
};

export const teardown = async (): Promise<void> => {
  await replSet?.stop();
};
