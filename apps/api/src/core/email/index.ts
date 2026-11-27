import { env } from '../config/env';
import { createEmailSender } from './create-email-sender';

export {
  EmailDeliveryError,
  type EmailMessage,
  type EmailSender,
} from './email-sender';

// Selected by EMAIL_DRIVER (config/email-config.ts): Brevo in production,
// an outbox directory in development, QA and E2E, memory in the API tests.
export const emailSender = createEmailSender(env.email);
