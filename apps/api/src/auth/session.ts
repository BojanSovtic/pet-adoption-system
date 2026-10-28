import MongoStore from 'connect-mongo';
import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import session from 'express-session';
import mongoose from 'mongoose';

import { env } from '../config/env';

declare module 'express-session' {
  interface SessionData {
    userId: string;
  }
}

// Any request type works, whatever its typed params/body.
type SessionRequest = Pick<Request, 'session'>;

const SESSION_COOKIE_NAME = 'sid';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const cookieOptions: CookieOptions = {
  // Not readable from JavaScript, so XSS cannot steal the session id.
  httpOnly: true,
  // Sent on same-site requests and top-level navigations, but not on
  // cross-site POST/PUT/DELETE requests (first line of CSRF defense).
  sameSite: 'lax',
  // HTTPS only in production; local development runs on plain http.
  secure: env.isProduction,
  path: '/',
};

type MongoClient = ReturnType<typeof mongoose.connection.getClient>;

// The app is created before the database connects (see main.ts), so the store
// waits for Mongoose's connection instead of opening a second one.
// (`connection.asPromise()` resolves immediately if `connect()` wasn't called.)
const getMongoClient = (): Promise<MongoClient> => {
  const { connection } = mongoose;

  if (connection.readyState === mongoose.ConnectionStates.connected) {
    return Promise.resolve(connection.getClient());
  }

  return new Promise((resolve) => {
    connection.once('connected', () => resolve(connection.getClient()));
  });
};

export const sessionMiddleware: RequestHandler = session({
  name: SESSION_COOKIE_NAME,
  secret: env.sessionSecret,
  // Only write sessions that changed, and create none for anonymous visitors.
  resave: false,
  saveUninitialized: false,
  cookie: { ...cookieOptions, maxAge: SESSION_MAX_AGE_MS },
  store: MongoStore.create({
    clientPromise: getMongoClient(),
    collectionName: 'sessions',
    ttl: SESSION_MAX_AGE_MS / 1000,
  }),
});

/**
 * Starts an application session for an already-authenticated user. It is
 * independent of how the user signed in (password today, OAuth later).
 */
export const startUserSession = (
  req: SessionRequest,
  userId: string,
): Promise<void> =>
  new Promise((resolve, reject) => {
    // A new session id after sign-in prevents session fixation.
    req.session.regenerate((regenerateError) => {
      if (regenerateError) {
        reject(regenerateError);
        return;
      }

      req.session.userId = userId;
      req.session.save((saveError) =>
        saveError ? reject(saveError) : resolve(),
      );
    });
  });

/** Deletes the session from the store and clears the cookie. */
export const endUserSession = (
  req: SessionRequest,
  res: Response,
): Promise<void> =>
  new Promise((resolve, reject) => {
    req.session.destroy((error) => {
      if (error) {
        reject(error);
        return;
      }

      res.clearCookie(SESSION_COOKIE_NAME, cookieOptions);
      resolve();
    });
  });
