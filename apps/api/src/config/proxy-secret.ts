type Source = Readonly<Record<string, string | undefined>>;

export const PROXY_SECRET_MIN_LENGTH = 32;

// Visible ASCII only: the value travels in an HTTP header, where spaces at
// the ends are trimmed and other characters may be rejected or rewritten.
const HEADER_SAFE = /^[\x21-\x7e]+$/;

/**
 * Optional secret shared with the reverse proxy that is the API's only
 * intended entry point (the Cloudflare Pages Function in the managed
 * deployment). When set, every request except the liveness probe must carry
 * it (middleware/require-proxy-secret.ts), so requests sent straight to the
 * API's public host can't bypass the proxy or choose their own client IP.
 * Unset: no check, as in development, QA, E2E and the Caddy deployment.
 *
 * Error messages never include the value.
 */
export const readProxySecret = (
  source: Source = process.env,
): string | null => {
  const secret = source.PROXY_SECRET;

  if (!secret) {
    return null;
  }

  if (secret.length < PROXY_SECRET_MIN_LENGTH) {
    throw new Error(
      `PROXY_SECRET must be at least ${PROXY_SECRET_MIN_LENGTH} characters`,
    );
  }

  if (!HEADER_SAFE.test(secret)) {
    throw new Error(
      'PROXY_SECRET may contain only visible ASCII characters (no spaces)',
    );
  }

  return secret;
};
