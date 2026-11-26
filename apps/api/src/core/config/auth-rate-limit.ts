type Source = Readonly<Record<string, string | undefined>>;

/**
 * Optional override of the sign-in and registration attempts allowed per IP
 * address (`AUTH_ATTEMPTS_PER_IP`; the default is in
 * middleware/rate-limit.ts). Only for test runs: an E2E run sends every
 * test's registrations and sign-ins to one API process from one address,
 * more than real users from one address need. Refused in production, so a
 * copied test setting can't weaken the live limit. Null when unset.
 */
export const readAuthAttemptsPerIpOverride = (
  source: Source = process.env,
): number | null => {
  const value = source.AUTH_ATTEMPTS_PER_IP;

  if (value === undefined || value === '') {
    return null;
  }

  if (source.NODE_ENV === 'production') {
    throw new Error('AUTH_ATTEMPTS_PER_IP must not be set in production');
  }

  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error('AUTH_ATTEMPTS_PER_IP must be a positive integer');
  }

  return Number(value);
};
