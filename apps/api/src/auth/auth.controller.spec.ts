import mongoose from 'mongoose';
import request, { type Response } from 'supertest';

import { app } from '../app';
import { env } from '../config/env';
import { UserModel } from '../users/user.model';

const validUser = {
  email: 'milo@example.com',
  name: 'Milo Owner',
  password: 'correct horse battery',
};

/** Returns the `sid=...` pair from a response's Set-Cookie header, if any. */
const getSessionCookie = (response: Response): string | undefined => {
  const cookies = ([] as string[]).concat(response.headers['set-cookie'] ?? []);

  return cookies.find((cookie) => cookie.startsWith('sid='))?.split(';')[0];
};

const getRawSessionCookie = (response: Response): string | undefined =>
  ([] as string[])
    .concat(response.headers['set-cookie'] ?? [])
    .find((cookie) => cookie.startsWith('sid='));

describe('POST /api/auth/register', () => {
  it('creates a user, signs them in and never returns the password hash', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send(validUser);

    expect(response.status).toBe(201);
    expect(Object.keys(response.body).sort()).toEqual([
      '_id',
      'createdAt',
      'email',
      'name',
      'updatedAt',
    ]);
    expect(response.body).toMatchObject({
      email: validUser.email,
      name: validUser.name,
    });
    expect(getSessionCookie(response)).toBeDefined();
  });

  it('stores an Argon2id hash, not the plaintext password', async () => {
    await request(app).post('/api/auth/register').send(validUser);

    const user = await UserModel.findOne({ email: validUser.email })
      .select('+passwordHash')
      .lean();

    expect(user?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user?.passwordHash).not.toContain(validUser.password);
  });

  it('sets a secure session cookie', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send(validUser);

    const cookie = getRawSessionCookie(response);

    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    // `Secure` is only enabled in production (tests run over plain http).
    expect(cookie).not.toContain('Secure');
  });

  it('normalizes the email address', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, email: '  Milo@Example.COM ' });

    expect(response.status).toBe(201);
    expect(response.body.email).toBe('milo@example.com');
  });

  it('rejects an email that is already registered', async () => {
    await request(app).post('/api/auth/register').send(validUser);

    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, email: 'MILO@example.com' });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ code: 'EMAIL_ALREADY_REGISTERED' });
  });

  it('rejects invalid input', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', name: '', password: 'short' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      code: 'VALIDATION_FAILED',
      details: [
        { field: 'email', code: 'invalid_format' },
        { field: 'name', code: 'too_small' },
        { field: 'password', code: 'too_small' },
      ],
    });
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(validUser);
  });

  it('signs in with valid credentials', async () => {
    const agent = request.agent(app);

    const response = await agent.post('/api/auth/login').send({
      email: validUser.email,
      password: validUser.password,
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ email: validUser.email });
    expect(response.body).not.toHaveProperty('passwordHash');

    const meResponse = await agent.get('/api/auth/me');

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.email).toBe(validUser.email);
  });

  it('issues a new session id on login and invalidates the old one', async () => {
    const registerResponse = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, email: 'luna@example.com' });
    const oldCookie = getSessionCookie(registerResponse);

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .set('Cookie', oldCookie ?? '')
      .send({ email: 'luna@example.com', password: validUser.password });
    const newCookie = getSessionCookie(loginResponse);

    expect(oldCookie).toBeDefined();
    expect(newCookie).toBeDefined();
    expect(newCookie).not.toBe(oldCookie);

    const oldSessionResponse = await request(app)
      .get('/api/auth/me')
      .set('Cookie', oldCookie ?? '');

    expect(oldSessionResponse.status).toBe(401);
  });

  it('rejects a wrong password without creating a session', async () => {
    const response = await request(app).post('/api/auth/login').send({
      email: validUser.email,
      password: 'wrong password',
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ code: 'INVALID_CREDENTIALS' });
    expect(getSessionCookie(response)).toBeUndefined();
  });

  it('gives the same error for an unknown email', async () => {
    const response = await request(app).post('/api/auth/login').send({
      email: 'nobody@example.com',
      password: validUser.password,
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ code: 'INVALID_CREDENTIALS' });
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 without a session', async () => {
    const response = await request(app).get('/api/auth/me');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ code: 'UNAUTHENTICATED' });
  });

  it('returns 401 when the signed-in user no longer exists', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send(validUser);
    await UserModel.deleteMany({});

    const response = await agent.get('/api/auth/me');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ code: 'UNAUTHENTICATED' });
  });
});

describe('POST /api/auth/logout', () => {
  it('destroys the session on the server and clears the cookie', async () => {
    const registerResponse = await request(app)
      .post('/api/auth/register')
      .send(validUser);
    const cookie = getSessionCookie(registerResponse) ?? '';

    const response = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookie);

    expect(response.status).toBe(204);
    expect(getRawSessionCookie(response)).toMatch(/Expires=Thu, 01 Jan 1970/);

    // Replaying the old cookie must not work: the session is gone server-side.
    const meResponse = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookie);

    expect(meResponse.status).toBe(401);
    expect(
      await mongoose.connection.db?.collection('sessions').countDocuments(),
    ).toBe(0);
  });

  it('succeeds without a session', async () => {
    const response = await request(app).post('/api/auth/logout');

    expect(response.status).toBe(204);
  });
});

describe('CSRF and CORS', () => {
  it('rejects state-changing requests from an untrusted origin', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ email: validUser.email, password: validUser.password });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ code: 'UNTRUSTED_ORIGIN' });
  });

  it('allows the trusted origin to send credentials', async () => {
    await request(app).post('/api/auth/register').send(validUser);

    const response = await request(app)
      .post('/api/auth/login')
      .set('Origin', env.corsOrigin)
      .send({ email: validUser.email, password: validUser.password });

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(
      env.corsOrigin,
    );
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });
});

// Each test runs several deliberately slow Argon2id verifications.
describe('rate limiting', { timeout: 20_000 }, () => {
  const loginAs = (email: string, password: string) =>
    request(app).post('/api/auth/login').send({ email, password });

  it('blocks an account after repeated failed logins from one IP', async () => {
    await request(app).post('/api/auth/register').send(validUser);

    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await loginAs(validUser.email, 'wrong password');
      expect(response.status).toBe(401);
    }

    // Even the correct password is rejected until the window passes.
    const blocked = await loginAs(validUser.email, validUser.password);

    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ code: 'RATE_LIMITED' });
    expect(blocked.headers['retry-after']).toBeDefined();

    // The limit is per account: another account from the same IP still works.
    const otherAccount = await loginAs('luna@example.com', 'wrong password');

    expect(otherAccount.status).toBe(401);
  });

  it('does not count successful logins', async () => {
    await request(app).post('/api/auth/register').send(validUser);

    for (let attempt = 0; attempt < 6; attempt++) {
      const response = await loginAs(validUser.email, validUser.password);
      expect(response.status).toBe(200);
    }
  });

  it('caps all sign-in and registration attempts from one IP', async () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'invalid', name: '', password: '' });
      expect(response.status).toBe(400);
    }

    const blocked = await loginAs(validUser.email, validUser.password);

    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ code: 'RATE_LIMITED' });
  });
});
