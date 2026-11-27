import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { captureLogs } from '../../test/log-capture';
import {
  createOutboxEmailSender,
  type OutboxEmail,
} from './outbox-email-sender';

const from = { address: 'no-reply@example.com', name: 'Pet Adoption' };
const message = {
  to: 'milo@example.com',
  subject: 'Confirm your email',
  text: 'Open https://pets.example.org/verify#token=secret-token',
  html: '<a href="https://pets.example.org/verify#token=secret-token">Confirm</a>',
};
const now = () => new Date('2026-11-27T10:15:30.123Z');

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'outbox-spec-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('createOutboxEmailSender', () => {
  it('writes one JSON file per email, creating the directory', async () => {
    const directory = path.join(root, 'nested', 'outbox');
    const sender = createOutboxEmailSender({ directory, from, now });

    const { id } = await sender.send(message);

    expect(await readdir(directory)).toEqual([`${id}.json`]);

    const email = JSON.parse(
      await readFile(path.join(directory, `${id}.json`), 'utf8'),
    ) as OutboxEmail;

    expect(email).toEqual({
      id,
      createdAt: '2026-11-27T10:15:30.123Z',
      from,
      ...message,
    });
  });

  it('names files by time and a random id only', async () => {
    const sender = createOutboxEmailSender({ directory: root, from, now });

    const first = await sender.send(message);
    const second = await sender.send(message);

    for (const { id } of [first, second]) {
      expect(id).toMatch(
        /^2026-11-27T10-15-30-123Z-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(id).not.toContain('milo');
    }

    expect(first.id).not.toBe(second.id);
    expect((await readdir(root)).sort()).toEqual(
      [`${first.id}.json`, `${second.id}.json`].sort(),
    );
  });

  it('leaves no temporary file behind', async () => {
    const sender = createOutboxEmailSender({ directory: root, from, now });

    await sender.send(message);

    expect((await readdir(root)).some((name) => name.endsWith('.tmp'))).toBe(
      false,
    );
  });

  it.skipIf(process.platform === 'win32')(
    'makes the file readable by its owner only',
    async () => {
      const sender = createOutboxEmailSender({ directory: root, from, now });

      const { id } = await sender.send(message);
      const { mode } = await stat(path.join(root, `${id}.json`));

      expect(mode & 0o777).toBe(0o600);
    },
  );

  it('writes no logs', async () => {
    const logs = captureLogs();

    try {
      await createOutboxEmailSender({ directory: root, from, now }).send(
        message,
      );
    } finally {
      logs.restore();
    }

    expect(logs.entries).toEqual([]);
  });
});
