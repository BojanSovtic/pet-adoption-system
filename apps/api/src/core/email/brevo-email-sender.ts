import type { EmailFrom } from '../config/email-config';
import { EmailDeliveryError, type EmailSender } from './email-sender';

// https://developers.brevo.com/reference/sendtransacemail
const SEND_URL = 'https://api.brevo.com/v3/smtp/email';
// Sending happens while a user waits for a response; a slow provider must
// not hold the request much longer than this.
const REQUEST_TIMEOUT_MS = 10_000;
// Brevo's error codes are short names (`unauthorized`, `not_enough_credits`).
// Anything else in that field is dropped rather than logged.
const PROVIDER_CODE = /^[A-Za-z_ ]{1,40}$/;

type BrevoResponse = { messageId?: unknown; code?: unknown };

export type BrevoEmailSenderOptions = {
  apiKey: string;
  from: EmailFrom;
  /** Replaceable in tests; the real network is never used there. */
  fetch?: typeof fetch;
  timeoutMs?: number;
};

/**
 * Sends through Brevo's transactional email API over HTTPS. Render's free
 * instances block outbound SMTP ports, so SMTP is not an option. Failures
 * become `EmailDeliveryError`s that contain no recipient, contents, API key
 * or provider response body.
 */
export const createBrevoEmailSender = ({
  apiKey,
  from,
  // Looked up per request, so a test can stub the global.
  fetch: fetchImpl = (input, init) => fetch(input, init),
  timeoutMs = REQUEST_TIMEOUT_MS,
}: BrevoEmailSenderOptions): EmailSender => ({
  send: async ({ to, subject, text, html }) => {
    let response: Response;

    try {
      response = await fetchImpl(SEND_URL, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'api-key': apiKey,
        },
        body: JSON.stringify({
          sender: { name: from.name, email: from.address },
          to: [{ email: to }],
          subject,
          htmlContent: html,
          textContent: text,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new EmailDeliveryError(
        'Brevo',
        error instanceof Error && error.name === 'TimeoutError'
          ? 'timeout'
          : 'network',
      );
    }

    const body = (await response.json().catch(() => ({}))) as BrevoResponse;

    if (!response.ok) {
      const code =
        typeof body.code === 'string' && PROVIDER_CODE.test(body.code)
          ? body.code
          : undefined;

      throw new EmailDeliveryError('Brevo', 'rejected', response.status, code);
    }

    return {
      id: typeof body.messageId === 'string' ? body.messageId : 'unknown',
    };
  },
});
