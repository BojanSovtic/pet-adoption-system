import mongoose, { type ClientSession } from 'mongoose';

import { logger, serializeError } from '../logging/logger';

let watchingConnection = false;
let disconnecting = false;

/**
 * Logs connection changes after startup, so a lost database shows up in the
 * logs even when no request fails. Registered once; never logs the URI.
 */
const watchConnection = (): void => {
  if (watchingConnection) {
    return;
  }

  watchingConnection = true;
  const { connection } = mongoose;

  connection.on('disconnected', () => {
    if (!disconnecting) {
      logger.warn('database disconnected');
    }
  });
  connection.on('reconnected', () => logger.info('database reconnected'));
  connection.on('error', (error: unknown) =>
    logger.error('database connection error', { err: serializeError(error) }),
  );
};

export const connectDatabase = async (uri: string): Promise<void> => {
  watchConnection();
  await mongoose.connect(uri);

  // Adoption decisions use transactions, which a standalone server rejects.
  // Failing at startup is clearer than a 500 on the first acceptance.
  const hello = await mongoose.connection.db?.admin().command({ hello: 1 });

  if (!hello?.setName) {
    throw new Error(
      'MongoDB must run as a replica set (transactions are required). ' +
        'See "Local MongoDB" in docs/progress.md.',
    );
  }

  logger.info('database connected');
};

/** How long the readiness check waits for MongoDB to answer. */
export const DATABASE_READY_TIMEOUT_MS = 2000;

/**
 * Whether the shared Mongoose connection is open and MongoDB answers a ping
 * within `timeoutMs`. Never throws: an error or a timeout means "not ready",
 * and is logged (warn) with the reason; the HTTP response stays bare.
 */
export const isDatabaseReady = async (
  timeoutMs = DATABASE_READY_TIMEOUT_MS,
): Promise<boolean> => {
  const { connection } = mongoose;

  if (
    connection.readyState !== mongoose.ConnectionStates.connected ||
    !connection.db
  ) {
    logger.warn('database not ready', { reason: 'not connected' });
    return false;
  }

  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });

  try {
    const result = await Promise.race([
      connection.db.command({ ping: 1 }).then(() => 'ok' as const),
      timedOut,
    ]);

    if (result === 'timeout') {
      logger.warn('database not ready', {
        reason: 'ping timed out',
        timeoutMs,
      });
      return false;
    }

    return true;
  } catch (error) {
    logger.warn('database not ready', {
      reason: 'ping failed',
      err: serializeError(error),
    });
    return false;
  } finally {
    clearTimeout(timer);
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  disconnecting = true;

  try {
    await mongoose.disconnect();
  } finally {
    disconnecting = false;
  }

  logger.info('database disconnected (shutdown)');
};

/**
 * Runs `work` in a MongoDB transaction: all writes commit together or none do.
 * Pass `{ session }` to every query inside. Transient errors (e.g. a write
 * conflict with a concurrent transaction) make MongoDB retry `work`, so it
 * must not have side effects outside the database.
 */
export const withTransaction = <T>(
  work: (session: ClientSession) => Promise<T>,
): Promise<T> => mongoose.connection.transaction(work);
