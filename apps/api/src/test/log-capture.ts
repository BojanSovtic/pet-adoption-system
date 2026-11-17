import { configureLogger, type LogLevel } from '../logging/logger';

export type CapturedLogEntry = Record<string, unknown> & {
  level: string;
  msg: string;
};

/**
 * Collects the app's log lines (parsed) instead of writing them, from
 * `level` up. Call `restore()` afterwards (e.g. in afterEach).
 */
export const captureLogs = (level: LogLevel = 'debug') => {
  const entries: CapturedLogEntry[] = [];
  const lines: string[] = [];
  const restore = configureLogger({
    level,
    write: (line) => {
      lines.push(line);
      entries.push(JSON.parse(line) as CapturedLogEntry);
    },
  });

  return {
    entries,
    /** The raw output, for "this text must not appear anywhere" checks. */
    text: () => lines.join('\n'),
    restore,
  };
};
