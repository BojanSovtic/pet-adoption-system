import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { app } from '../app';
import { PetModel } from '../pets/pet.model';
import { createSignedInAgent } from '../test/auth-test-helpers';
import { env } from './env';
import { readTrustProxy, TRUST_PROXY_MAX_HOPS } from './trust-proxy';

describe('readTrustProxy', () => {
  it.each([undefined, '', '   '])(
    'trusts no proxy when unset (%j) outside production',
    (value) => {
      expect(readTrustProxy({ TRUST_PROXY: value })).toBe(false);
      expect(
        readTrustProxy({ TRUST_PROXY: value, NODE_ENV: 'development' }),
      ).toBe(false);
    },
  );

  it.each([undefined, ''])('is required in production (%j)', (value) => {
    expect(() =>
      readTrustProxy({ TRUST_PROXY: value, NODE_ENV: 'production' }),
    ).toThrow(/TRUST_PROXY is required when NODE_ENV=production/);
  });

  it.each([
    ['false', false],
    ['1', 1],
    [' 2 ', 2],
    [String(TRUST_PROXY_MAX_HOPS), TRUST_PROXY_MAX_HOPS],
    ['loopback', ['loopback']],
    ['uniquelocal, linklocal', ['uniquelocal', 'linklocal']],
    [
      '10.0.0.5, 172.16.0.0/12, ::1, fd00::/8',
      ['10.0.0.5', '172.16.0.0/12', '::1', 'fd00::/8'],
    ],
  ])('accepts %j', (value, expected) => {
    expect(readTrustProxy({ TRUST_PROXY: value })).toEqual(expected);
    // The same value in production too: it is set explicitly.
    expect(
      readTrustProxy({ TRUST_PROXY: value, NODE_ENV: 'production' }),
    ).toEqual(expected);
  });

  it.each([
    ['true', /must not be "true"/],
    ['0', /hop count must be/],
    [String(TRUST_PROXY_MAX_HOPS + 1), /hop count must be/],
    ['-1', /invalid entries: -1/],
    ['1.5', /invalid entries: 1.5/],
    ['yes', /invalid entries: yes/],
    ['0.0.0.0/0', /invalid entries: 0.0.0.0\/0/],
    ['::/0', /invalid entries: ::\/0/],
    ['10.0.0.0/33', /invalid entries/],
    ['10.0.0.0/8/1', /invalid entries/],
    ['300.1.1.1', /invalid entries: 300.1.1.1/],
    ['10.0.0.1,', /invalid entries/],
    ['1, loopback', /invalid entries: 1/],
    ['localhost', /invalid entries: localhost/],
  ])('refuses %j', (value, message) => {
    expect(() => readTrustProxy({ TRUST_PROXY: value })).toThrow(message);
    expect(() =>
      readTrustProxy({ TRUST_PROXY: value, NODE_ENV: 'production' }),
    ).toThrow(message);
  });

  it('returns only values Express accepts', () => {
    for (const value of ['false', '1', 'loopback', '10.0.0.5, fd00::/8']) {
      expect(() =>
        express().set('trust proxy', readTrustProxy({ TRUST_PROXY: value })),
      ).not.toThrow();
    }
  });

  it('is what the app uses (no proxy trusted in the test environment)', () => {
    expect(env.trustProxy).toBe(false);
    expect(app.get('trust proxy')).toBe(false);
  });
});

/**
 * The trust boundary, through the real app and its rate limiters. Supertest
 * connects from loopback, so "the proxy" is 127.0.0.1 (or ::1). A real proxy
 * appends the address it received the request from to X-Forwarded-For, so a
 * forged value always ends up to the left of the real client address.
 *
 * The per-IP sign-in/registration limit (20 per window) is the probe:
 * registration attempts with an invalid body count against it and are
 * otherwise harmless (400).
 */
describe('trusted proxy and per-IP rate limits', () => {
  const AUTH_ATTEMPTS_PER_IP = 20;

  const useTrustProxy = (value: string) => {
    app.set('trust proxy', readTrustProxy({ TRUST_PROXY: value }));
  };

  const attemptRegistration = (forwardedFor: string) =>
    request(app)
      .post('/api/auth/register')
      .set('X-Forwarded-For', forwardedFor)
      .send({ email: 'invalid', name: '', password: '' });

  afterEach(() => {
    app.set('trust proxy', env.trustProxy);
  });

  it.each(['1', 'loopback'])(
    'TRUST_PROXY=%s: rate-limits the real client behind the proxy, whatever it forges',
    async (setting) => {
      useTrustProxy(setting);

      // One client (198.51.100.7) forges a new address on every request;
      // the proxy appends the real one.
      for (let attempt = 0; attempt < AUTH_ATTEMPTS_PER_IP; attempt++) {
        const response = await attemptRegistration(
          `203.0.113.${attempt}, 198.51.100.7`,
        );
        expect(response.status).toBe(400);
      }

      const blocked = await attemptRegistration('203.0.113.99, 198.51.100.7');
      expect(blocked.status).toBe(429);
      expect(blocked.body).toEqual({ code: 'RATE_LIMITED' });

      // Another client behind the same proxy has its own budget: users are
      // told apart by their address, not all counted as the proxy.
      const otherClient = await attemptRegistration('198.51.100.8');
      expect(otherClient.status).toBe(400);
    },
  );

  it('ignores X-Forwarded-For from an address that is not a trusted proxy', async () => {
    // Only 10.0.0.5 is trusted; this client connects directly (from
    // loopback), as if it had bypassed the proxy.
    useTrustProxy('10.0.0.5');

    for (let attempt = 0; attempt < AUTH_ATTEMPTS_PER_IP; attempt++) {
      const response = await attemptRegistration(`203.0.113.${attempt}`);
      expect(response.status).toBe(400);
    }

    // A fresh forged address doesn't give a fresh budget: the limit is on
    // the connecting address.
    const blocked = await attemptRegistration('198.51.100.200');
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ code: 'RATE_LIMITED' });
  });

  it('keeps per-user limits per account when the client address changes', async () => {
    useTrustProxy('1');
    const owner = await createSignedInAgent();
    const PET_CREATE_BURST = 10;

    for (let index = 0; index < PET_CREATE_BURST; index++) {
      const response = await owner.agent
        .post('/api/pets')
        .set('X-Forwarded-For', `198.51.100.${index + 1}`)
        .send({
          name: `Pet ${index}`,
          species: 'dog',
          age: 2,
          description: 'A pet.',
        });
      expect(response.status).toBe(201);
    }

    const blocked = await owner.agent
      .post('/api/pets')
      .set('X-Forwarded-For', '198.51.100.250')
      .send({
        name: 'One more',
        species: 'dog',
        age: 2,
        description: 'A pet.',
      });

    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ code: 'RATE_LIMITED' });
    expect(await PetModel.countDocuments()).toBe(PET_CREATE_BURST);
  });
});
