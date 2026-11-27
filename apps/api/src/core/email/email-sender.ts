/**
 * One transactional email to one recipient. Both bodies are required: mail
 * clients show the HTML one and fall back to the text one.
 */
export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

/** Identifies a sent email in the logs (the provider's message id). */
export type SentEmailReceipt = { id: string };

/**
 * How the app sends email. Application code only talks to this interface;
 * `EMAIL_DRIVER` (config/email-config.ts) picks the implementation. Drivers
 * write no logs: the caller decides what to log, and logs only safe fields
 * (the receipt id, never the recipient, contents or links).
 */
export type EmailSender = {
  /** Resolves once the email was accepted; rejects if it wasn't. */
  send: (message: EmailMessage) => Promise<SentEmailReceipt>;
};

export type EmailDeliveryFailure = 'rejected' | 'network' | 'timeout';

/**
 * A provider didn't accept an email. The message names only the provider,
 * the kind of failure, the HTTP status and the provider's error code: never
 * the recipient, the contents or the API key, so it is safe to log.
 */
export class EmailDeliveryError extends Error {
  constructor(
    public readonly provider: string,
    public readonly failure: EmailDeliveryFailure,
    public readonly status?: number,
    public readonly providerCode?: string,
  ) {
    const details = [
      failure,
      status === undefined ? undefined : `HTTP ${status}`,
      providerCode,
    ].filter(Boolean);

    super(`${provider} did not accept the email: ${details.join(', ')}`);
    this.name = 'EmailDeliveryError';
  }
}
