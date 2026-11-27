import type { EmailConfig } from '../config/email-config';
import { createBrevoEmailSender } from './brevo-email-sender';
import type { EmailSender } from './email-sender';
import { createMemoryEmailSender } from './memory-email-sender';
import { createOutboxEmailSender } from './outbox-email-sender';

/** The sender `config` selects; kept apart from `env` so it can be tested. */
export const createEmailSender = (config: EmailConfig): EmailSender => {
  switch (config.driver) {
    case 'memory':
      return createMemoryEmailSender(config.from);
    case 'outbox':
      return createOutboxEmailSender({
        directory: config.directory,
        from: config.from,
      });
    case 'brevo':
      return createBrevoEmailSender({
        apiKey: config.apiKey,
        from: config.from,
      });
  }
};
