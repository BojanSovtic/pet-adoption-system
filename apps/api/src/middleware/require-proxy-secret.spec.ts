import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { errorHandler } from './error-handler';
import {
  PROXY_CLIENT_IP_HEADER,
  PROXY_SECRET_HEADER,
  requireProxySecret,
} from './require-proxy-secret';

const SECRET = 'proxy-secret-for-tests-0123456789abcdef';

/** A minimal app that reports which client IP the handlers would see. */
const createApp = (secret: string | null) =>
  express()
    .use(requireProxySecret(secret))
    .get('/api/health', (req, res) => {
      res.json({ status: 'ok' });
    })
    .all('/api/*', (req, res) => {
      res.json({ ip: req.ip });
    })
    .use(errorHandler);

describe('requireProxySecret', () => {
  describe('with a secret', () => {
    const app = createApp(SECRET);

    it('refuses a request without the header', async () => {
      const response = await request(app).get('/api/pets');

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ code: 'PROXY_REQUIRED' });
    });

    it.each([
      ['a wrong value', 'wrong'],
      ['a value of the same length', SECRET.replace(/.$/, 'X')],
      ['a prefix of the secret', SECRET.slice(0, -1)],
      ['the secret with extra characters', `${SECRET}0`],
      ['an empty value', ''],
    ])('refuses %s', async (label, value) => {
      const response = await request(app)
        .post('/api/pets')
        .set(PROXY_SECRET_HEADER, value);

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ code: 'PROXY_REQUIRED' });
    });

    it('refuses the header sent twice (Node joins repeats with a comma)', async () => {
      const response = await request(app)
        .get('/api/pets')
        .set(PROXY_SECRET_HEADER, `${SECRET}, ${SECRET}`);

      expect(response.status).toBe(403);
    });

    it('never echoes the secret', async () => {
      const response = await request(app)
        .get('/api/pets')
        .set(PROXY_SECRET_HEADER, 'wrong');

      expect(response.text).not.toContain(SECRET);
      expect(JSON.stringify(response.headers)).not.toContain(SECRET);
    });

    it('lets a request with the right secret through', async () => {
      const response = await request(app)
        .delete('/api/pets/1')
        .set(PROXY_SECRET_HEADER, SECRET);

      expect(response.status).toBe(200);
    });

    it.each(['get', 'head'] as const)(
      'exempts only the liveness probe (%s /api/health)',
      async (method) => {
        const response = await request(app)[method]('/api/health');

        expect(response.status).toBe(200);
      },
    );

    it.each([
      ['GET', '/api/ready'],
      ['GET', '/api/health/extra'],
      ['GET', '/api/healthz'],
      ['GET', '/uploads/pets/a.jpg'],
      ['POST', '/api/health'],
    ])('does not exempt %s %s', async (method, path) => {
      const response =
        await request(app)[method.toLowerCase() as 'get' | 'post'](path);

      expect(response.status).toBe(403);
    });

    it('uses the client IP sent by the proxy', async () => {
      const response = await request(app)
        .get('/api/pets')
        .set(PROXY_SECRET_HEADER, SECRET)
        .set(PROXY_CLIENT_IP_HEADER, '198.51.100.7');

      expect(response.body).toEqual({ ip: '198.51.100.7' });
    });

    it('accepts an IPv6 client IP', async () => {
      const response = await request(app)
        .get('/api/pets')
        .set(PROXY_SECRET_HEADER, SECRET)
        .set(PROXY_CLIENT_IP_HEADER, '2001:db8::1');

      expect(response.body).toEqual({ ip: '2001:db8::1' });
    });

    it.each(['not-an-ip', '198.51.100.7, 203.0.113.1', ''])(
      'ignores a malformed client IP (%j)',
      async (value) => {
        const response = await request(app)
          .get('/api/pets')
          .set(PROXY_SECRET_HEADER, SECRET)
          .set(PROXY_CLIENT_IP_HEADER, value);

        expect(response.body.ip).not.toBe(value);
        expect(response.body.ip).toMatch(/127\.0\.0\.1|::1/);
      },
    );
  });

  describe('without a secret (development, QA, E2E, Caddy)', () => {
    const app = createApp(null);

    it('lets every request through', async () => {
      expect((await request(app).get('/api/pets')).status).toBe(200);
      expect((await request(app).post('/api/pets')).status).toBe(200);
      expect((await request(app).get('/api/health')).status).toBe(200);
    });

    it('ignores the client IP header, so clients cannot choose their IP', async () => {
      const response = await request(app)
        .get('/api/pets')
        .set(PROXY_CLIENT_IP_HEADER, '198.51.100.7');

      expect(response.body.ip).toMatch(/127\.0\.0\.1|::1/);
    });
  });
});
