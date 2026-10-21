// Dedicated ports, so E2E runs never collide with (or reuse) the dev servers
// on 3333/4200, and the API always starts fresh with empty rate-limit counters.
export const E2E_API_PORT = 3334;
export const E2E_WEB_PORT = 4201;

export const E2E_API_URL = `http://localhost:${E2E_API_PORT}/api`;
export const E2E_WEB_URL = `http://localhost:${E2E_WEB_PORT}`;
