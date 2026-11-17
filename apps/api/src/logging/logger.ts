import { getRequestId } from './request-context';

/**
 * A small structured logger: one JSON object per line on stdout, which Docker
 * and hosting platforms collect as is. Each entry is
 * `{ level, time, msg, requestId?, ...fields }`.
 *
 * Callers pass explicit, safe fields. Never pass whole request or response
 * objects, bodies, headers, cookies or user records: nothing here redacts
 * them. Errors go through `serializeError` (name, message, code, stack).
 *
 * Kept free of `config/env.ts` because the command-line tools (which must not
 * need the web server's settings) import database.ts, which logs.
 */
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];
type EntryLevel = Exclude<LogLevel, 'silent'>;

const SEVERITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

export const DEFAULT_LOG_LEVEL: LogLevel = 'info';

type Source = Readonly<Record<string, string | undefined>>;

/** `LOG_LEVEL`: one of LOG_LEVELS; `info` when unset. Anything else throws. */
export const readLogLevel = (source: Source = process.env): LogLevel => {
  const value = source.LOG_LEVEL?.trim();

  if (!value) {
    return DEFAULT_LOG_LEVEL;
  }

  if (!(LOG_LEVELS as readonly string[]).includes(value)) {
    throw new Error(
      `LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')} (got "${value}")`,
    );
  }

  return value as LogLevel;
};

export type LogFields = Record<string, unknown>;
type LoggerConfig = { level: LogLevel; write: (line: string) => void };

let config: LoggerConfig = {
  level: DEFAULT_LOG_LEVEL,
  write: (line) => {
    process.stdout.write(`${line}\n`);
  },
};

/**
 * Changes the level and/or where lines go (tests capture them). Returns a
 * function that restores the previous configuration.
 */
export const configureLogger = (
  changes: Partial<LoggerConfig>,
): (() => void) => {
  const previous = config;
  config = { ...config, ...changes };

  return () => {
    config = previous;
  };
};

// Credentials inside URLs (e.g. a MongoDB connection string in an error
// message): `scheme://user:password@host` → `scheme://[redacted]@host`.
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi;

// MongoDB duplicate-key messages include the duplicated value (e.g. an email
// address): `dup key: { email: "a@b.c" }`. The index name is enough.
const DUPLICATE_KEY_VALUE = /dup key: \{.*?\}(?=\s|$)/g;

const scrub = (text: string): string =>
  text
    .replace(URL_CREDENTIALS, '$1[redacted]@')
    .replace(DUPLICATE_KEY_VALUE, 'dup key: [redacted]');

/**
 * The parts of an error that help diagnose it: name, message, code, stack and
 * the cause chain (two levels). Other properties (which can hold documents,
 * request data or connection details) are left out on purpose.
 */
export const serializeError = (error: unknown, depth = 0): LogFields => {
  if (!(error instanceof Error)) {
    return { message: scrub(String(error)) };
  }

  const fields: LogFields = {
    name: error.name,
    message: scrub(error.message),
  };
  const code = (error as { code?: unknown }).code;

  if (typeof code === 'string' || typeof code === 'number') {
    fields.code = code;
  }

  if (error.stack) {
    fields.stack = scrub(error.stack);
  }

  if (error.cause !== undefined && depth < 2) {
    fields.cause = serializeError(error.cause, depth + 1);
  }

  return fields;
};

const log = (level: EntryLevel, msg: string, fields: LogFields = {}): void => {
  if (SEVERITY[level] < SEVERITY[config.level]) {
    return;
  }

  const requestId = getRequestId();
  const entry = {
    level,
    time: new Date().toISOString(),
    msg,
    ...(requestId ? { requestId } : {}),
    ...fields,
  };

  try {
    config.write(JSON.stringify(entry));
  } catch {
    // A field that can't be serialized must not break the request.
    config.write(
      JSON.stringify({
        level,
        time: entry.time,
        msg,
        requestId,
        logError: true,
      }),
    );
  }
};

export const logger = {
  debug: (msg: string, fields?: LogFields) => log('debug', msg, fields),
  info: (msg: string, fields?: LogFields) => log('info', msg, fields),
  warn: (msg: string, fields?: LogFields) => log('warn', msg, fields),
  error: (msg: string, fields?: LogFields) => log('error', msg, fields),
};
