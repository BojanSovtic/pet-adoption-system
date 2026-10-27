// Dedicated ports, so E2E runs never collide with (or reuse) the dev servers
// on 3333/4200, and the API always starts fresh with empty rate-limit counters.
export const E2E_API_PORT = 3334;
export const E2E_WEB_PORT = 4201;

/**
 * The throwaway in-memory MongoDB of an E2E run. Fixed so tests can run the
 * real `admin:grant` command against it (the only way to create an admin).
 */
export const E2E_MONGODB_PORT = 27031;

export const E2E_API_URL = `http://localhost:${E2E_API_PORT}/api`;
export const E2E_WEB_URL = `http://localhost:${E2E_WEB_PORT}`;
export const E2E_MONGODB_URI = `mongodb://127.0.0.1:${E2E_MONGODB_PORT}/pet-adoption-e2e?directConnection=true`;

/** Settings the API (and the admin:grant command) need in E2E runs. */
export const E2E_API_ENV = {
  MONGODB_URI: E2E_MONGODB_URI,
  CORS_ORIGIN: E2E_WEB_URL,
  SESSION_SECRET: 'e2e-session-secret-at-least-32-characters-long',
};
