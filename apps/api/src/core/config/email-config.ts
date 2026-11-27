import path from 'node:path';

type Source = Readonly<Record<string, string | undefined>>;

export const EMAIL_DRIVERS = ['memory', 'outbox', 'brevo'] as const;
export type EmailDriver = (typeof EMAIL_DRIVERS)[number];

/** The sender of every email the app sends. */
export type EmailFrom = { address: string; name: string };

export type EmailConfig =
  | { driver: 'memory'; from: EmailFrom }
  | { driver: 'outbox'; from: EmailFrom; directory: string }
  | { driver: 'brevo'; from: EmailFrom; apiKey: string };

const DEFAULT_FROM_ADDRESS = 'no-reply@example.com';
const DEFAULT_FROM_NAME = 'Pet Adoption';
const DEFAULT_OUTBOX_DIR = 'apps/api/outbox';
const FROM_NAME_MAX_LENGTH = 100;

// A plain address (no display name, no comments): something@domain.tld.
const ADDRESS = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/;
const ADDRESS_MAX_LENGTH = 254;
// Brevo keys are long strings of letters, digits and dashes. Checked loosely,
// so a pasted value with a space or quotes fails at startup rather than on
// the first email. Error messages name the variable, never the value.
const BREVO_API_KEY = /^[A-Za-z0-9_-]{20,}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

const readDriver = (source: Source): EmailDriver => {
  const value = source.EMAIL_DRIVER?.trim();
  const isProduction = source.NODE_ENV === 'production';
  const isVitest = Boolean(source.VITEST);

  if (!value) {
    if (isProduction) {
      throw new Error('EMAIL_DRIVER is required in production (brevo)');
    }

    return isVitest ? 'memory' : 'outbox';
  }

  if (!(EMAIL_DRIVERS as readonly string[]).includes(value)) {
    throw new Error(
      `EMAIL_DRIVER must be one of ${EMAIL_DRIVERS.join(', ')} (got ${value})`,
    );
  }

  // The other drivers keep every email on the server, so nobody would ever
  // receive one: refuse them rather than fail silently.
  if (isProduction && value !== 'brevo') {
    throw new Error(
      `EMAIL_DRIVER=${value} is not allowed in production (use brevo)`,
    );
  }

  if (value === 'memory' && !isVitest) {
    throw new Error(
      'EMAIL_DRIVER=memory is only for the API tests (it keeps emails in memory and sends none)',
    );
  }

  // apps/api/.env is loaded in test runs too; a developer's real settings
  // there must never make a test send email.
  if (value === 'brevo' && isVitest) {
    throw new Error('EMAIL_DRIVER=brevo is refused in Vitest runs');
  }

  return value as EmailDriver;
};

const readFrom = (source: Source, driver: EmailDriver): EmailFrom => {
  const address = source.EMAIL_FROM?.trim();
  const name = source.EMAIL_FROM_NAME?.trim();

  if (!address && driver === 'brevo') {
    throw new Error('EMAIL_FROM is required when EMAIL_DRIVER=brevo');
  }

  if (
    address &&
    (address.length > ADDRESS_MAX_LENGTH || !ADDRESS.test(address))
  ) {
    throw new Error(
      'EMAIL_FROM must be a plain email address (name@example.com, no display name)',
    );
  }

  if (
    name &&
    (name.length > FROM_NAME_MAX_LENGTH || CONTROL_CHARACTERS.test(name))
  ) {
    throw new Error(
      `EMAIL_FROM_NAME must be at most ${FROM_NAME_MAX_LENGTH} characters without line breaks or control characters`,
    );
  }

  return {
    address: address || DEFAULT_FROM_ADDRESS,
    name: name || DEFAULT_FROM_NAME,
  };
};

const readBrevoApiKey = (source: Source): string => {
  const value = source.BREVO_API_KEY;

  if (!value) {
    throw new Error('BREVO_API_KEY is required when EMAIL_DRIVER=brevo');
  }

  if (!BREVO_API_KEY.test(value)) {
    throw new Error(
      'BREVO_API_KEY is malformed (copy it again from the Brevo console, without quotes or spaces)',
    );
  }

  return value;
};

/**
 * How the app sends email, from `EMAIL_DRIVER`:
 * - `brevo`: Brevo's HTTPS API (`email/brevo-email-sender.ts`). The only
 *   driver allowed, and required, in production; needs `BREVO_API_KEY` and
 *   `EMAIL_FROM` (a sender verified in Brevo).
 * - `outbox` (the default outside production and tests): one JSON file per
 *   email in `EMAIL_OUTBOX_DIR` (default `apps/api/outbox`, relative to the
 *   repository root, git-ignored). For development, QA and E2E.
 * - `memory` (the default in the API tests, and allowed only there): kept in
 *   memory for the test to inspect (`test/email-capture.ts`).
 * `EMAIL_FROM_NAME` is optional everywhere.
 */
export const readEmailConfig = (
  source: Source = process.env,
  cwd: string = process.cwd(),
): EmailConfig => {
  const driver = readDriver(source);
  const from = readFrom(source, driver);

  switch (driver) {
    case 'memory':
      return { driver, from };
    case 'outbox':
      return {
        driver,
        from,
        directory: path.resolve(
          cwd,
          source.EMAIL_OUTBOX_DIR?.trim() || DEFAULT_OUTBOX_DIR,
        ),
      };
    case 'brevo':
      return { driver, from, apiKey: readBrevoApiKey(source) };
  }
};
