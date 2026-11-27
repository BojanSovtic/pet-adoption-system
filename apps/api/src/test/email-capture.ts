import { afterEach } from 'vitest';

import { emailSender } from '../core/email';
import {
  isMemoryEmailSender,
  type CapturedEmail,
  type MemoryEmailSender,
} from '../core/email/memory-email-sender';

const memorySender = (): MemoryEmailSender => {
  if (!isMemoryEmailSender(emailSender)) {
    throw new Error('The API tests must run with EMAIL_DRIVER=memory');
  }

  return emailSender;
};

// Registered for every spec file that imports this helper (like Testing
// Library's automatic cleanup), so no test sees another test's emails. Not
// in setup.ts: importing the app's email sender there would compute `env`
// before UPLOADS_DIR is set. Module state is per file anyway.
afterEach(() => {
  memorySender().clear();
});

/** The emails the app sent during the current test, oldest first. */
export const sentEmails = (): CapturedEmail[] => memorySender().sent();
