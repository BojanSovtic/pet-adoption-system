import express from 'express';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, vi } from 'vitest';

const fsMocks = vi.hoisted(() => ({ failRename: false }));

// Lets a test make the final rename fail, as a full disk or crash would.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();

  return {
    ...actual,
    rename: async (...args: Parameters<typeof actual.rename>) => {
      if (fsMocks.failRename) {
        throw new Error('simulated disk failure');
      }

      return actual.rename(...args);
    },
  };
});

import { createLocalFileStorage, serveLocalFiles } from './local-file-storage';

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'pet-storage-'));
});

afterEach(async () => {
  fsMocks.failRename = false;
  await rm(directory, { recursive: true, force: true });
});

const createStorage = () =>
  createLocalFileStorage({ directory, baseUrl: 'http://api/uploads' });

describe('createLocalFileStorage', () => {
  it('writes the file under its key and leaves no temporary file', async () => {
    await createStorage().save('pets/a.png', Buffer.from('data'), 'image/png');

    expect(await readdir(path.join(directory, 'pets'))).toEqual(['a.png']);
    expect(await readFile(path.join(directory, 'pets', 'a.png'), 'utf8')).toBe(
      'data',
    );
  });

  it('leaves nothing behind if the write fails', async () => {
    fsMocks.failRename = true;

    await expect(
      createStorage().save('pets/a.png', Buffer.from('data'), 'image/png'),
    ).rejects.toThrow('simulated disk failure');

    expect(await readdir(path.join(directory, 'pets'))).toEqual([]);
  });
});

describe('serveLocalFiles', () => {
  it('never serves dot-files such as in-progress writes', async () => {
    const app = express().use('/uploads', serveLocalFiles(directory));
    await createStorage().save('pets/a.png', Buffer.from('data'), 'image/png');
    await writeFile(
      path.join(directory, 'pets', '.partial.tmp'),
      'IN-PROGRESS-BYTES',
    );

    const stored = await request(app).get('/uploads/pets/a.png');
    const partial = await request(app).get('/uploads/pets/.partial.tmp');

    expect(stored.status).toBe(200);
    expect(partial.status).not.toBe(200);
    expect(partial.text).not.toContain('IN-PROGRESS-BYTES');
  });
});
