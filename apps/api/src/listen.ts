import type { Server } from 'node:http';
import type { Express } from 'express';

/**
 * Starts the HTTP server and resolves once it accepts connections. A failure
 * to bind (most often a port already in use) rejects instead of crashing with
 * an unhandled 'error' event, so startup can report it clearly and exit.
 */
export const listen = (
  app: Express,
  port: number,
  host: string,
): Promise<Server> =>
  new Promise((resolve, reject) => {
    const server = app.listen(port, host);

    server.once('listening', () => resolve(server));
    server.once('error', (error: NodeJS.ErrnoException) => {
      reject(
        error.code === 'EADDRINUSE'
          ? new Error(
              `Port ${port} on ${host} is already in use, so the API cannot start. ` +
                'Another process is listening there, often the Docker app stack ' +
                '("docker compose --profile app ps"; stop it with "docker compose --profile app stop"). ' +
                'Stop it, or set PORT in apps/api/.env (and CORS_ORIGIN / VITE_API_URL to match).',
              { cause: error },
            )
          : error,
      );
    });
  });
