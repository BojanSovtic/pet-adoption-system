import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { app } from './app';
import { env } from './config/env';
import {
  PROXY_CLIENT_IP_HEADER,
  PROXY_SECRET_HEADER,
} from './middleware/require-proxy-secret';

const { SECRET } = vi.hoisted(() => ({
  SECRET: 'proxy-secret-for-tests-0123456789abcdef',
}));

// The real app, configured as in the managed deployment: only requests that
// carry the proxy secret are served. (Each spec file has its own module
// registry, so other files keep the unconfigured env.) vi.mock is hoisted
// above the imports.
vi.mock('./config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./config/env')>();

  return { env: { ...actual.env, proxySecret: SECRET } };
});

const countSessions = () =>
  mongoose.connection.collection('sessions').countDocuments();

const AUTH_ATTEMPTS_PER_IP = 20;

/** Through the proxy: the secret and the client IP the proxy saw. */
const viaProxy = (clientIp = '198.51.100.7') => ({
  [PROXY_SECRET_HEADER]: SECRET,
  [PROXY_CLIENT_IP_HEADER]: clientIp,
});

const invalidRegistration = { email: 'invalid', name: '', password: '' };

describe('app with PROXY_SECRET', () => {
  it('uses the configured secret', () => {
    expect(env.proxySecret).toBe(SECRET);
  });

  it('serves the liveness probe without the secret', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('keeps readiness behind the secret', async () => {
    const direct = await request(app).get('/api/ready');
    const proxied = await request(app).get('/api/ready').set(viaProxy());

    expect(direct.status).toBe(403);
    expect(direct.body).toEqual({ code: 'PROXY_REQUIRED' });
    expect(proxied.status).toBe(200);
    expect(proxied.body).toEqual({ status: 'ok' });
  });

  it('refuses direct requests before sessions: no cookie, no stored session', async () => {
    const before = await countSessions();
    const response = await request(app).post('/api/auth/register').send({
      email: 'direct@example.com',
      name: 'Direct',
      password: 'correct horse battery',
    });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ code: 'PROXY_REQUIRED' });
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(await countSessions()).toBe(before);
  });

  it('refuses direct requests before the rate limits, so they use no budget', async () => {
    for (let attempt = 0; attempt < AUTH_ATTEMPTS_PER_IP + 5; attempt++) {
      const response = await request(app)
        .post('/api/auth/register')
        .send(invalidRegistration);
      expect(response.status).toBe(403);
      expect(response.headers['ratelimit']).toBeUndefined();
    }

    const proxied = await request(app)
      .post('/api/auth/register')
      .set(viaProxy())
      .send(invalidRegistration);

    expect(proxied.status).toBe(400);
  });

  it('rate-limits per client IP sent by the proxy, whatever X-Forwarded-For says', async () => {
    for (let attempt = 0; attempt < AUTH_ATTEMPTS_PER_IP; attempt++) {
      const response = await request(app)
        .post('/api/auth/register')
        .set(viaProxy('198.51.100.7'))
        // A forged header changes nothing: trust proxy is off here, and
        // the proxy's value replaces the client IP anyway.
        .set('X-Forwarded-For', `203.0.113.${attempt}`)
        .send(invalidRegistration);
      expect(response.status).toBe(400);
    }

    const blocked = await request(app)
      .post('/api/auth/register')
      .set(viaProxy('198.51.100.7'))
      .send(invalidRegistration);
    const otherClient = await request(app)
      .post('/api/auth/register')
      .set(viaProxy('198.51.100.8'))
      .send(invalidRegistration);

    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ code: 'RATE_LIMITED' });
    expect(otherClient.status).toBe(400);
  });

  it('keeps the CSRF origin check behind the proxy', async () => {
    const response = await request(app)
      .post('/api/auth/logout')
      .set(viaProxy())
      .set('Origin', 'https://evil.example');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ code: 'UNTRUSTED_ORIGIN' });
  });

  it('signs in through the proxy with the usual session cookie', async () => {
    const agent = request.agent(app);
    const registered = await agent
      .post('/api/auth/register')
      .set(viaProxy())
      .set('Origin', env.corsOrigin)
      .send({
        email: 'proxied@example.com',
        name: 'Proxied',
        password: 'correct horse battery',
      });

    expect(registered.status).toBe(201);
    expect(String(registered.headers['set-cookie'])).toMatch(
      /sid=.*HttpOnly.*SameSite=Lax/i,
    );

    const me = await agent.get('/api/auth/me').set(viaProxy());
    const meDirect = await agent.get('/api/auth/me');

    expect(me.status).toBe(200);
    expect(me.body.email).toBe('proxied@example.com');
    // A valid cookie alone is not enough without the proxy.
    expect(meDirect.status).toBe(403);
  });

  it('answers unknown routes behind the proxy with the usual JSON 404', async () => {
    const response = await request(app).get('/api/nope').set(viaProxy());

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ code: 'ROUTE_NOT_FOUND' });
  });
});
