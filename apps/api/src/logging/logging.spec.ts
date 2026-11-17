import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { app } from '../app';
import { PetModel } from '../pets/pet.model';
import { captureLogs } from '../test/log-capture';
import {
  configureLogger,
  logger,
  readLogLevel,
  serializeError,
} from './logger';
import { getRequestId, runWithRequestContext } from './request-context';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let logs: ReturnType<typeof captureLogs> | undefined;

const capture = (...args: Parameters<typeof captureLogs>) => {
  logs = captureLogs(...args);
  return logs;
};

afterEach(() => {
  vi.restoreAllMocks();
  logs?.restore();
  logs = undefined;
});

const completionFor = (
  entries: ReturnType<typeof captureLogs>['entries'],
  requestId: string,
) =>
  entries.find(
    (entry) =>
      entry.msg === 'request completed' && entry.requestId === requestId,
  );

describe('readLogLevel', () => {
  it.each([undefined, '', '  '])('defaults to info (%j)', (value) => {
    expect(readLogLevel({ LOG_LEVEL: value })).toBe('info');
  });

  it.each(['debug', 'info', 'warn', 'error', 'silent', ' warn '])(
    'accepts %j',
    (value) => {
      expect(readLogLevel({ LOG_LEVEL: value })).toBe(value.trim());
    },
  );

  it.each(['verbose', 'INFO', 'trace', 'fatal', '1', 'warning'])(
    'refuses %j',
    (value) => {
      expect(() => readLogLevel({ LOG_LEVEL: value })).toThrow(
        /LOG_LEVEL must be one of debug, info, warn, error, silent/,
      );
    },
  );
});

describe('logger', () => {
  it('writes one JSON object per entry with level, time and message', () => {
    const { entries } = capture('debug');

    logger.info('hello', { count: 2 });

    expect(entries).toEqual([
      { level: 'info', time: expect.any(String), msg: 'hello', count: 2 },
    ]);
    expect(Number.isNaN(Date.parse(entries[0].time as string))).toBe(false);
  });

  it('drops entries below the configured level', () => {
    const { entries } = capture('warn');

    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    expect(entries.map((entry) => entry.level)).toEqual(['warn', 'error']);
  });

  it('writes nothing when silent', () => {
    const { entries } = capture('silent');

    logger.error('e');

    expect(entries).toEqual([]);
  });

  it('adds the request id from the request context, also after awaits', async () => {
    const { entries } = capture();

    await runWithRequestContext({ requestId: 'req-1' }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      logger.warn('inside');
    });
    logger.warn('outside');

    expect(entries[0]).toMatchObject({ msg: 'inside', requestId: 'req-1' });
    expect(entries[1]).not.toHaveProperty('requestId');
    expect(getRequestId()).toBeUndefined();
  });

  it('restores the previous configuration', () => {
    const outer = capture('debug');
    const lines: string[] = [];
    const restore = configureLogger({ write: (line) => lines.push(line) });

    logger.info('inner');
    restore();
    logger.info('outer');

    expect(lines).toHaveLength(1);
    expect(outer.entries.map((entry) => entry.msg)).toEqual(['outer']);
  });
});

describe('serializeError', () => {
  it('keeps name, message, code, stack and the cause, and nothing else', () => {
    const error = Object.assign(
      new Error('outer', { cause: new TypeError('inner') }),
      { code: 'E_TEST', document: { email: 'someone@example.com' } },
    );

    const fields = serializeError(error);

    expect(fields).toEqual({
      name: 'Error',
      message: 'outer',
      code: 'E_TEST',
      stack: expect.stringContaining('outer'),
      cause: {
        name: 'TypeError',
        message: 'inner',
        stack: expect.stringContaining('inner'),
      },
    });
    expect(JSON.stringify(fields)).not.toContain('someone@example.com');
  });

  it('removes credentials from URLs and values from duplicate-key errors', () => {
    const fields = serializeError(
      new Error(
        'connect failed: mongodb+srv://admin:s3cret@cluster.example.net/db; ' +
          'E11000 duplicate key error collection: app.users index: email_1 ' +
          'dup key: { email: "someone@example.com" }',
      ),
    );
    const text = JSON.stringify(fields);

    expect(text).toContain('mongodb+srv://[redacted]@cluster.example.net');
    expect(text).toContain('index: email_1 dup key: [redacted]');
    expect(text).not.toMatch(/s3cret|admin:|someone@example\.com/);
  });

  it('handles values that are not errors', () => {
    expect(serializeError('plain')).toEqual({ message: 'plain' });
  });
});

describe('request ids and request logs', () => {
  it('gives each request a new server-generated id in X-Request-Id', async () => {
    const first = await request(app).get('/api/health');
    const second = await request(app).get('/api/health');

    expect(first.headers['x-request-id']).toMatch(UUID);
    expect(second.headers['x-request-id']).toMatch(UUID);
    expect(first.headers['x-request-id']).not.toBe(
      second.headers['x-request-id'],
    );
  });

  it('ignores a client-supplied request id', async () => {
    const { text } = capture();

    const response = await request(app)
      .get('/api/pets')
      .set('X-Request-Id', 'client-chosen-id');

    expect(response.headers['x-request-id']).toMatch(UUID);
    expect(text()).not.toContain('client-chosen-id');
  });

  it('logs completion with method, path, status, duration and the id', async () => {
    const { entries, text } = capture();

    const response = await request(app).get(
      '/api/pets?search=private-search-text&species=dog',
    );
    const requestId = response.headers['x-request-id'];

    expect(response.status).toBe(200);
    expect(completionFor(entries, requestId)).toEqual({
      level: 'info',
      time: expect.any(String),
      msg: 'request completed',
      requestId,
      method: 'GET',
      path: '/api/pets',
      status: 200,
      durationMs: expect.any(Number),
    });
    expect(
      completionFor(entries, requestId)?.durationMs,
    ).toBeGreaterThanOrEqual(0);
    // The query string (search text, filters) is not logged.
    expect(text()).not.toContain('private-search-text');
  });

  it('logs client errors at info, with their status', async () => {
    const { entries } = capture();

    const response = await request(app).get('/api/pets/not-an-id');

    expect(response.status).toBe(400);
    expect(
      completionFor(entries, response.headers['x-request-id']),
    ).toMatchObject({
      level: 'info',
      status: 400,
      path: '/api/pets/not-an-id',
    });
    expect(entries.some((entry) => entry.level === 'error')).toBe(false);
  });

  it('logs successful health checks at debug only', async () => {
    const { entries } = capture('info');

    await request(app).get('/api/health');
    await request(app).get('/api/ready');

    expect(entries).toEqual([]);
  });

  it('includes the signed-in user id, never the session', async () => {
    const { entries } = capture();
    const agent = request.agent(app);
    const registered = await agent.post('/api/auth/register').send({
      email: 'logger@example.com',
      name: 'Log Tester',
      password: 'correct horse battery',
    });

    const response = await agent.post('/api/pets').send({
      name: 'Milo',
      species: 'dog',
      age: 3,
      description: 'A friendly dog.',
    });

    expect(response.status).toBe(201);
    expect(
      completionFor(entries, response.headers['x-request-id']),
    ).toMatchObject({
      method: 'POST',
      status: 201,
      userId: registered.body._id,
    });
  });
});

describe('unexpected errors', () => {
  it('are logged as errors with the request id, stack and request line', async () => {
    const { entries } = capture();
    vi.spyOn(PetModel, 'find').mockImplementation(() => {
      throw new Error('boom from a test');
    });

    const response = await request(app).get('/api/pets?search=private-query');
    const requestId = response.headers['x-request-id'];

    // The response contract is unchanged: only the code, no details.
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ code: 'INTERNAL_SERVER_ERROR' });
    expect(response.text).not.toContain('boom');

    const errorEntry = entries.find(
      (entry) => entry.msg === 'unexpected error',
    );
    expect(errorEntry).toMatchObject({
      level: 'error',
      requestId,
      method: 'GET',
      path: '/api/pets',
      err: { name: 'Error', message: 'boom from a test' },
    });
    expect((errorEntry?.err as { stack: string }).stack).toContain(
      'boom from a test',
    );
    expect(completionFor(entries, requestId)).toMatchObject({
      level: 'error',
      status: 500,
    });
    expect(JSON.stringify(entries)).not.toContain('private-query');
  });
});

describe('sensitive data', () => {
  it('never logs passwords, emails, names, cookies, tokens or message text', async () => {
    const { entries, text } = capture('debug');
    const secrets = {
      ownerEmail: 'owner.private@example.com',
      adopterEmail: 'adopter.private@example.com',
      ownerName: 'Ownername Privatesurname',
      password: 'Pa55word-never-logged',
      token: 'bearer-token-never-logged',
      application: 'Application text that stays private',
      message: 'Message text that stays private',
      description: 'Pet description that is not logged',
    };

    const owner = request.agent(app);
    await owner.post('/api/auth/register').send({
      email: secrets.ownerEmail,
      name: secrets.ownerName,
      password: secrets.password,
    });
    const pet = await owner
      .post('/api/pets')
      .set('Authorization', `Bearer ${secrets.token}`)
      .send({
        name: 'Milo',
        species: 'dog',
        age: 3,
        description: secrets.description,
      });

    const adopter = request.agent(app);
    await adopter.post('/api/auth/register').send({
      email: secrets.adopterEmail,
      name: 'Adopter',
      password: secrets.password,
    });
    const signIn = await request(app)
      .post('/api/auth/login')
      .send({ email: secrets.adopterEmail, password: secrets.password });
    const failedSignIn = await request(app)
      .post('/api/auth/login')
      .send({ email: secrets.adopterEmail, password: `${secrets.password}x` });
    const applied = await adopter
      .post(`/api/pets/${pet.body._id}/applications`)
      .send({ message: secrets.application });
    const messaged = await adopter
      .post(`/api/pets/${pet.body._id}/conversations`)
      .send({ body: secrets.message });

    expect([pet.status, signIn.status, failedSignIn.status]).toEqual([
      201, 200, 401,
    ]);
    expect(applied.status).toBe(201);
    expect([200, 201]).toContain(messaged.status);

    const sessionCookie = signIn.headers['set-cookie']?.[0]?.split(';')[0];
    const sessionValue = sessionCookie?.split('=')[1];
    expect(sessionValue).toBeTruthy();

    const output = text();
    // Every request produced a line…
    expect(
      entries.filter((entry) => entry.msg === 'request completed').length,
    ).toBeGreaterThanOrEqual(7);
    // …without any of the secrets or personal data.
    for (const value of [...Object.values(secrets), sessionValue as string]) {
      expect(output).not.toContain(value);
    }
    expect(output).not.toMatch(/"(cookie|authorization|password|email|body)"/i);
  });
});
