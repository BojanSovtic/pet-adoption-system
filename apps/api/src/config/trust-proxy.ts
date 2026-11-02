import { isIP } from 'node:net';

/**
 * Express's `trust proxy` setting, read from `TRUST_PROXY`. It decides which
 * `X-Forwarded-*` headers Express believes: the client IP (`req.ip`, used by
 * the per-IP rate limits) and whether the original request was HTTPS (needed
 * for `Secure` session cookies). It must match the real network: trusting
 * too much lets clients choose their own IP; trusting too little breaks
 * cookies behind a TLS proxy and puts every user behind one IP.
 *
 * Accepted values:
 * - `false`: trust no proxy; `req.ip` is the connecting address. The default
 *   outside production.
 * - A hop count, 1 to `TRUST_PROXY_MAX_HOPS`: trust that many proxies in
 *   front of the API. Only safe when clients can't reach the API directly.
 * - A comma-separated list of the proxies' addresses: IPs, CIDR ranges
 *   (`10.0.0.0/8`), or Express's names `loopback`, `linklocal`,
 *   `uniquelocal`. Only requests from those addresses are trusted.
 *
 * Refused (startup fails): `true`, ranges that match every address, `0`,
 * anything else, and a missing value when `NODE_ENV=production`.
 */
export type TrustProxySetting = false | number | string[];

export const TRUST_PROXY_MAX_HOPS = 10;

const NAMED_RANGES = new Set(['loopback', 'linklocal', 'uniquelocal']);

type Source = Readonly<Record<string, string | undefined>>;

const invalid = (reason: string): Error =>
  new Error(
    `TRUST_PROXY ${reason}. Use "false", a hop count (1-${TRUST_PROXY_MAX_HOPS}) ` +
      'or a comma-separated list of proxy addresses (IP, CIDR, loopback, ' +
      'linklocal, uniquelocal). See docs/deployment.md.',
  );

const isValidAddressOrRange = (entry: string): boolean => {
  if (NAMED_RANGES.has(entry)) {
    return true;
  }

  const [address, prefix, ...rest] = entry.split('/');
  const version = isIP(address);

  if (version === 0 || rest.length > 0) {
    return false;
  }

  if (prefix === undefined) {
    return true;
  }

  if (!/^\d{1,3}$/.test(prefix)) {
    return false;
  }

  const bits = Number(prefix);

  // A /0 range trusts every address, which is the same as `true`.
  return bits >= 1 && bits <= (version === 4 ? 32 : 128);
};

export const readTrustProxy = (
  source: Source = process.env,
): TrustProxySetting => {
  const value = source.TRUST_PROXY?.trim();

  if (!value) {
    if (source.NODE_ENV === 'production') {
      throw invalid(
        'is required when NODE_ENV=production (it must match the proxies ' +
          'in front of the API)',
      );
    }

    return false;
  }

  if (value === 'false') {
    return false;
  }

  if (value === 'true') {
    throw invalid(
      'must not be "true": trusting every proxy lets clients set their own IP',
    );
  }

  if (/^\d+$/.test(value)) {
    const hops = Number(value);

    if (hops < 1 || hops > TRUST_PROXY_MAX_HOPS) {
      throw invalid(
        `hop count must be 1-${TRUST_PROXY_MAX_HOPS} (got ${value})`,
      );
    }

    return hops;
  }

  const entries = value.split(',').map((entry) => entry.trim());
  const rejected = entries.filter((entry) => !isValidAddressOrRange(entry));

  if (rejected.length > 0) {
    // The entries are addresses or typos, not secrets, so naming them helps.
    throw invalid(`has invalid entries: ${rejected.join(', ')}`);
  }

  return entries;
};
