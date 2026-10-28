/**
 * Error codes are stable identifiers; the web app translates them into
 * user-facing messages, so the API does not send display text.
 */
export type ValidationIssue = {
  /** Dot-separated path of the invalid field, e.g. `name` or `items.0`. */
  field: string;
  /** Zod issue code, e.g. `too_small` or `invalid_format`. */
  code: string;
};

/** Body of every non-2xx API response. */
export type ApiErrorResponse = {
  code: string;
  details?: ValidationIssue[];
};
