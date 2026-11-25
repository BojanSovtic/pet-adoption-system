import { app } from './app';
import { connectDatabase, disconnectDatabase } from './core/config/database';
import { env } from './core/config/env';
import { listen } from './listen';
import { logger, serializeError } from './core/logging/logger';

// Errors nothing caught. Logged as JSON, then the process exits as Node would
// by default, so a supervisor (Docker, the platform) restarts it.
process.on('uncaughtException', (error) => {
  logger.error('uncaught exception', { err: serializeError(error) });
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.error('unhandled promise rejection', { err: serializeError(reason) });
  process.exit(1);
});

const bootstrap = async () => {
  logger.info('starting', {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    logLevel: env.logLevel,
  });

  await connectDatabase(env.mongodbUri);

  // Rejects (e.g. port in use) into the startup error handler below.
  const server = await listen(app, env.port, env.host);
  logger.info('listening', { host: env.host, port: env.port });

  const shutdown = async (signal: string) => {
    logger.info('shutting down', { signal });

    server.close(async () => {
      logger.info('HTTP server closed');

      await disconnectDatabase();

      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
};

bootstrap().catch((error) => {
  logger.error('failed to start', { err: serializeError(error) });
  process.exit(1);
});
