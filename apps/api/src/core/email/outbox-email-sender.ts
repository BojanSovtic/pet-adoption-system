import { randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { EmailFrom } from '../config/email-config';
import type { EmailMessage, EmailSender } from './email-sender';

/** The content of one outbox file. */
export type OutboxEmail = EmailMessage & {
  id: string;
  from: EmailFrom;
  /** ISO date. */
  createdAt: string;
};

export type OutboxEmailSenderOptions = {
  directory: string;
  from: EmailFrom;
  /** Replaceable in tests. */
  now?: () => Date;
};

/**
 * Writes each email to `<directory>/<id>.json` instead of sending it, for
 * development, QA and E2E (a test reads the file to follow a link). The id
 * is the time plus a random UUID: sortable, unique, and free of anything the
 * caller passed, so no address or subject ends up in a file name. The file is
 * written under a temporary name and then renamed, so a reader never sees a
 * half-written email.
 */
export const createOutboxEmailSender = ({
  directory,
  from,
  now = () => new Date(),
}: OutboxEmailSenderOptions): EmailSender => ({
  send: async (message) => {
    const createdAt = now();
    const id = `${createdAt.toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
    const file = path.join(directory, `${id}.json`);
    const temporaryFile = `${file}.tmp`;
    const email: OutboxEmail = {
      id,
      createdAt: createdAt.toISOString(),
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    };

    await mkdir(directory, { recursive: true });
    // `wx`: never overwrite a file; 0o600: readable by this user only, since
    // emails can contain links that work like passwords.
    await writeFile(temporaryFile, `${JSON.stringify(email, null, 2)}\n`, {
      flag: 'wx',
      mode: 0o600,
    });
    await rename(temporaryFile, file);

    return { id };
  },
});
