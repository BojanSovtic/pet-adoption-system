import net from 'node:net';
import type { AddressInfo } from 'node:net';
import express from 'express';

import { listen } from './listen';

const HOST = '127.0.0.1';

/** Occupies a free port on HOST and returns it with a way to release it. */
const occupyPort = async () => {
  const blocker = net.createServer();
  await new Promise<void>((resolve) => blocker.listen(0, HOST, resolve));

  return {
    port: (blocker.address() as AddressInfo).port,
    release: () => new Promise((resolve) => blocker.close(resolve)),
  };
};

describe('listen', () => {
  it('resolves with a listening server', async () => {
    const server = await listen(express(), 0, HOST);

    expect(server.listening).toBe(true);
    await new Promise((resolve) => server.close(resolve));
  });

  it('rejects with a clear message when the port is already in use', async () => {
    const { port, release } = await occupyPort();

    try {
      await expect(listen(express(), port, HOST)).rejects.toThrow(
        `Port ${port} on ${HOST} is already in use`,
      );
    } finally {
      await release();
    }
  });
});
