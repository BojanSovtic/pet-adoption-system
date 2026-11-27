import type { EmailFrom } from '../config/email-config';
import type { EmailMessage, EmailSender } from './email-sender';

export type CapturedEmail = EmailMessage & { id: string; from: EmailFrom };

export type MemoryEmailSender = EmailSender & {
  /** What was sent so far, oldest first (copies). */
  sent: () => CapturedEmail[];
  clear: () => void;
};

/**
 * Keeps emails in memory for tests to inspect; sends nothing. Each call
 * creates a separate store, so two instances never see each other's emails.
 */
export const createMemoryEmailSender = (from: EmailFrom): MemoryEmailSender => {
  const emails: CapturedEmail[] = [];
  let count = 0;

  return {
    send: async (message) => {
      count += 1;
      const id = `memory-${count}`;

      // A copy, so later changes to the caller's object don't change it.
      emails.push({ ...message, id, from: { ...from } });

      return { id };
    },
    sent: () => emails.map((email) => ({ ...email, from: { ...email.from } })),
    clear: () => {
      emails.length = 0;
    },
  };
};

export const isMemoryEmailSender = (
  sender: EmailSender,
): sender is MemoryEmailSender => 'sent' in sender && 'clear' in sender;
