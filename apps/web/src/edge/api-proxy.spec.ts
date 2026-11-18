// @vitest-environment node
// Runs on the Workers runtime in production; Node's fetch, Request and
// Response follow the same standard.
import { describe, expect, it } from 'vitest';

import {
  PROXY_CLIENT_IP_HEADER,
  PROXY_SECRET_HEADER,
  proxyApiRequest,
  type ApiProxyEnv,
} from './api-proxy';

const ENV: ApiProxyEnv = {
  API_ORIGIN: 'https://api.example.onrender.com',
  PROXY_SECRET: 'proxy-secret-for-tests-0123456789abcdef',
};
const SITE = 'https://pets.example.pages.dev';

type Forwarded = { url: string; init: RequestInit; headers: Headers };

/** A stand-in for the API: records what the proxy sent, answers `reply`. */
const fakeApi = (reply: () => Response | Promise<Response>) => {
  const forwarded: Forwarded[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    forwarded.push({
      url: String(input),
      init: init ?? {},
      headers: new Headers(init?.headers),
    });

    return reply();
  }) as typeof fetch;

  return { impl, forwarded };
};

const ok = () => Response.json({ status: 'ok' });

describe('proxyApiRequest', () => {
  it('forwards method, path, query, body, cookies and Origin to the API', async () => {
    const api = fakeApi(async () => new Response(null, { status: 204 }));
    const request = new Request(`${SITE}/api/pets/123/images?x=1&y=two`, {
      method: 'POST',
      headers: {
        Cookie: 'sid=abc',
        Origin: SITE,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Milo' }),
    });

    const response = await proxyApiRequest(request, ENV, api.impl);

    expect(response.status).toBe(204);
    expect(api.forwarded).toHaveLength(1);
    const [sent] = api.forwarded;
    expect(sent.url).toBe(
      'https://api.example.onrender.com/api/pets/123/images?x=1&y=two',
    );
    expect(sent.init.method).toBe('POST');
    expect(sent.headers.get('Cookie')).toBe('sid=abc');
    // The API's CSRF check compares this with CORS_ORIGIN (the site).
    expect(sent.headers.get('Origin')).toBe(SITE);
    expect(sent.headers.get('Content-Type')).toBe('application/json');
    // Streamed, not read into memory first.
    expect(sent.init.body).toBeInstanceOf(ReadableStream);
    expect(await new Response(sent.init.body).text()).toBe('{"name":"Milo"}');
  });

  it('sends no body for GET and HEAD', async () => {
    const api = fakeApi(ok);

    await proxyApiRequest(new Request(`${SITE}/api/pets`), ENV, api.impl);
    await proxyApiRequest(
      new Request(`${SITE}/api/pets`, { method: 'HEAD' }),
      ENV,
      api.impl,
    );

    expect(api.forwarded.map((sent) => sent.init.body)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it('adds the secret and the client IP from Cloudflare, replacing forged values', async () => {
    const api = fakeApi(ok);
    const request = new Request(`${SITE}/api/auth/login`, {
      method: 'POST',
      headers: {
        'CF-Connecting-IP': '198.51.100.7',
        [PROXY_SECRET_HEADER]: 'forged-secret',
        [PROXY_CLIENT_IP_HEADER]: '203.0.113.1',
        'X-Forwarded-For': '203.0.113.2',
        'X-Real-IP': '203.0.113.3',
        Forwarded: 'for=203.0.113.4',
        'True-Client-IP': '203.0.113.5',
      },
      body: '{}',
    });

    await proxyApiRequest(request, ENV, api.impl);

    const { headers } = api.forwarded[0];
    expect(headers.get(PROXY_SECRET_HEADER)).toBe(ENV.PROXY_SECRET);
    expect(headers.get(PROXY_CLIENT_IP_HEADER)).toBe('198.51.100.7');
    for (const name of [
      'X-Forwarded-For',
      'X-Real-IP',
      'Forwarded',
      'True-Client-IP',
      'CF-Connecting-IP',
    ]) {
      expect(headers.get(name)).toBeNull();
    }
  });

  it('never takes the client IP from the client', async () => {
    const api = fakeApi(ok);
    const request = new Request(`${SITE}/api/pets`, {
      headers: { [PROXY_CLIENT_IP_HEADER]: '203.0.113.1' },
    });

    await proxyApiRequest(request, ENV, api.impl);

    expect(api.forwarded[0].headers.get(PROXY_CLIENT_IP_HEADER)).toBeNull();
  });

  it('does not follow redirects and returns them unchanged', async () => {
    const api = fakeApi(
      () =>
        new Response(null, {
          status: 302,
          headers: { Location: 'https://elsewhere.example/' },
        }),
    );

    const response = await proxyApiRequest(
      new Request(`${SITE}/api/pets`),
      ENV,
      api.impl,
    );

    expect(api.forwarded[0].init.redirect).toBe('manual');
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('https://elsewhere.example/');
  });

  it('returns the API response as is, including every Set-Cookie', async () => {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    headers.append(
      'Set-Cookie',
      'sid=new; Path=/; HttpOnly; Secure; SameSite=Lax',
    );
    headers.append('Set-Cookie', 'other=1; Path=/');
    headers.set('RateLimit', 'limit=20, remaining=19');
    const api = fakeApi(
      () =>
        new Response(JSON.stringify({ code: 'RATE_LIMITED' }), {
          status: 429,
          statusText: 'Too Many Requests',
          headers,
        }),
    );

    const response = await proxyApiRequest(
      new Request(`${SITE}/api/auth/login`, { method: 'POST', body: '{}' }),
      ENV,
      api.impl,
    );

    expect(response.status).toBe(429);
    expect(response.statusText).toBe('Too Many Requests');
    expect(response.headers.getSetCookie()).toEqual([
      'sid=new; Path=/; HttpOnly; Secure; SameSite=Lax',
      'other=1; Path=/',
    ]);
    expect(response.headers.get('RateLimit')).toBe('limit=20, remaining=19');
    expect(await response.json()).toEqual({ code: 'RATE_LIMITED' });
  });

  it('answers 502 SERVICE_UNAVAILABLE when the API cannot be reached', async () => {
    const api = fakeApi(() => {
      throw new TypeError('fetch failed');
    });

    const response = await proxyApiRequest(
      new Request(`${SITE}/api/pets`),
      ENV,
      api.impl,
    );

    expect(response.status).toBe(502);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ code: 'SERVICE_UNAVAILABLE' });
  });

  it.each<[string, ApiProxyEnv]>([
    ['no API origin', { PROXY_SECRET: ENV.PROXY_SECRET }],
    ['an http API origin', { ...ENV, API_ORIGIN: 'http://api.example.com' }],
    [
      'an API origin with a path',
      { ...ENV, API_ORIGIN: 'https://api.example.com/api' },
    ],
    ['a malformed API origin', { ...ENV, API_ORIGIN: 'not a url' }],
    ['no secret', { API_ORIGIN: ENV.API_ORIGIN }],
    ['a short secret', { ...ENV, PROXY_SECRET: 'short' }],
  ])('fails closed with %s, forwarding nothing', async (label, env) => {
    const api = fakeApi(ok);
    const errors: unknown[][] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => errors.push(args);

    try {
      const response = await proxyApiRequest(
        new Request(`${SITE}/api/pets`),
        env,
        api.impl,
      );

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ code: 'INTERNAL_SERVER_ERROR' });
      expect(api.forwarded).toHaveLength(0);
      expect(JSON.stringify(errors)).not.toContain(ENV.PROXY_SECRET);
    } finally {
      console.error = originalError;
    }
  });

  it('accepts an API origin with a trailing slash', async () => {
    const api = fakeApi(ok);

    await proxyApiRequest(
      new Request(`${SITE}/api/health`),
      { ...ENV, API_ORIGIN: `${ENV.API_ORIGIN}/` },
      api.impl,
    );

    expect(api.forwarded[0].url).toBe(`${ENV.API_ORIGIN}/api/health`);
  });

  it('never sends the secret back to the browser', async () => {
    const api = fakeApi(ok);

    const response = await proxyApiRequest(
      new Request(`${SITE}/api/pets`),
      ENV,
      api.impl,
    );

    expect(JSON.stringify([...response.headers])).not.toContain(
      ENV.PROXY_SECRET,
    );
    expect(await response.text()).not.toContain(ENV.PROXY_SECRET);
  });
});
