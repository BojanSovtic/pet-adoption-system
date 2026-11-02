import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, inject, vi } from 'vitest';

import { app } from './app';
import { isDatabaseReady } from './config/database';

afterEach(() => {
  vi.restoreAllMocks();
});

/** Fails the test if the error handler logged an unexpected error. */
const spyOnUnexpectedErrors = () =>
  vi.spyOn(console, 'error').mockImplementation(() => undefined);

describe('GET /api/health', () => {
  it('returns a healthy status', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
    });
  });
});

describe('GET /api/ready', () => {
  const database = () => {
    if (!mongoose.connection.db) {
      throw new Error('The test database is not connected');
    }

    return mongoose.connection.db;
  };

  it('is ready when MongoDB answers', async () => {
    const response = await request(app).get('/api/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('returns 503 without details when the ping fails', async () => {
    const consoleError = spyOnUnexpectedErrors();
    vi.spyOn(database(), 'command').mockRejectedValueOnce(
      new Error(
        'connect ECONNREFUSED mongodb://admin:s3cret@db.internal:27017',
      ),
    );

    const response = await request(app).get('/api/ready');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ code: 'DATABASE_UNAVAILABLE' });
    expect(response.text).not.toMatch(/s3cret|db\.internal|ECONNREFUSED/);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('returns 503 when the connection is not open', async () => {
    const ping = vi.spyOn(database(), 'command');
    // `readyState` is a getter on Mongoose's Connection prototype. An own
    // property shadows it, and deleting that property restores it (a getter
    // spy here wasn't restored reliably between tests).
    Object.defineProperty(mongoose.connection, 'readyState', {
      configurable: true,
      get: () => mongoose.ConnectionStates.disconnected,
    });

    try {
      const response = await request(app).get('/api/ready');

      expect(response.status).toBe(503);
      expect(response.body).toEqual({ code: 'DATABASE_UNAVAILABLE' });
      expect(ping).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(mongoose.connection, 'readyState');
    }

    expect(mongoose.connection.readyState).toBe(
      mongoose.ConnectionStates.connected,
    );
  });

  it('is not ready when the ping does not answer in time', async () => {
    const ping = vi
      .spyOn(database(), 'command')
      .mockReturnValueOnce(new Promise(() => undefined));

    await expect(isDatabaseReady(20)).resolves.toBe(false);
    expect(ping).toHaveBeenCalledWith({ ping: 1 });
  });

  it('is ready again once the ping succeeds', async () => {
    vi.spyOn(database(), 'command').mockRejectedValueOnce(new Error('down'));

    expect((await request(app).get('/api/ready')).status).toBe(503);
    expect((await request(app).get('/api/ready')).status).toBe(200);
  });
});

describe('request body errors', () => {
  it('rejects a body over the size limit with 413, not 500', async () => {
    const consoleError = spyOnUnexpectedErrors();

    // express.json() allows 100 kB by default.
    const response = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(
        JSON.stringify({
          email: 'a@example.com',
          password: 'x'.repeat(200_000),
        }),
      );

    expect(response.status).toBe(413);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({ code: 'PAYLOAD_TOO_LARGE' });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON with 400', async () => {
    const consoleError = spyOnUnexpectedErrors();

    const response = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ code: 'INVALID_JSON' });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('rejects an unsupported content encoding with 415', async () => {
    const consoleError = spyOnUnexpectedErrors();

    const response = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'compress')
      .send('{}');

    expect(response.status).toBe(415);
    expect(response.body).toEqual({ code: 'UNSUPPORTED_ENCODING' });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('rejects an unsupported charset with 415', async () => {
    const consoleError = spyOnUnexpectedErrors();

    const response = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json; charset=klingon')
      .send('{}');

    expect(response.status).toBe(415);
    expect(response.body).toEqual({ code: 'UNSUPPORTED_ENCODING' });
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe('unknown API routes', () => {
  it.each([
    ['GET', '/api/does-not-exist'],
    ['GET', '/api'],
    ['POST', '/api/pets/123/unknown-action'],
    ['DELETE', '/api/auth/unknown'],
  ] as const)('%s %s returns a JSON 404', async (method, url) => {
    const response =
      await request(app)[method.toLowerCase() as 'get' | 'post' | 'delete'](
        url,
      );

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({ code: 'ROUTE_NOT_FOUND' });
  });

  it('keeps the specific not-found codes of existing routes', async () => {
    const response = await request(app).get(
      '/api/pets/64b7f0c2a1b2c3d4e5f60718',
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ code: 'PET_NOT_FOUND' });
  });
});

describe('security headers', () => {
  it('sends API security headers and hides the framework', async () => {
    const response = await request(app).get('/api/health');

    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['content-security-policy']).toBe(
      "default-src 'none';frame-ancestors 'none'",
    );
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['cross-origin-resource-policy']).toBe(
      'same-origin',
    );
    expect(response.headers['cross-origin-opener-policy']).toBe('same-origin');
    // Left to the TLS-terminating proxy (see app.ts).
    expect(response.headers['strict-transport-security']).toBeUndefined();
  });

  it('sends the headers on error responses too', async () => {
    const response = await request(app).get('/api/does-not-exist');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('lets the web app embed uploaded photos from another origin', async () => {
    const uploadsDir = inject('uploadsDir');
    await mkdir(path.join(uploadsDir, 'pets'), { recursive: true });
    await writeFile(
      path.join(uploadsDir, 'pets', 'photo.png'),
      'not really a png',
    );

    const response = await request(app).get('/uploads/pets/photo.png');

    expect(response.status).toBe(200);
    expect(response.headers['cross-origin-resource-policy']).toBe(
      'cross-origin',
    );
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});
