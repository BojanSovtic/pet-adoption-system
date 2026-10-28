import { useCallback, useEffect, useRef, useState } from 'react';
import type { z } from 'zod';

import { focusFirstInvalidField } from './focus-first-invalid-field';
import { getFieldErrors } from './get-error-message';

type FormValues = Record<string, unknown>;

type UseFormValidationOptions<TValues extends FormValues, TOutput> = {
  /** Messages are translation keys, translated on render with `translate`. */
  schema: z.ZodType<TOutput, TValues>;
  /** The form's current values (the form keeps its own state). */
  values: TValues;
  /**
   * The submit mutation's error. Field-level `VALIDATION_FAILED` details are
   * shown on their fields; other errors stay with the form.
   */
  serverError?: unknown;
  /**
   * Fields to re-check when another one changes or loses focus, e.g.
   * `{ password: ['confirmPassword'] }`.
   */
  dependentFields?: Partial<
    Record<keyof TValues & string, (keyof TValues & string)[]>
  >;
  translate: (key: string) => string;
};

type ServerErrorState = {
  /** The last `serverError` seen, to notice a new one. */
  seen: unknown;
  /** The error whose field details are shown. Kept when the mutation resets. */
  error: unknown;
  /** Fields edited since `error` arrived; their server message is hidden. */
  dismissed: string[];
};

/** First issue's message (a translation key) per top-level field. */
const getIssueKeys = <TField extends string>(
  error: z.ZodError,
): Partial<Record<TField, string>> => {
  const keys: Partial<Record<string, string>> = {};

  for (const issue of error.issues) {
    const field = String(issue.path[0]);

    if (!keys[field]) {
      keys[field] = issue.message;
    }
  }

  return keys;
};

/**
 * Shared validation timing for forms (see "Forms" in docs/design-system.md):
 *
 * - No field errors before the first submit attempt.
 * - Submit validates every field and focuses the first invalid one.
 * - After that, an error clears as soon as its field is valid (on change),
 *   and a new error shows on blur or on the next submit, never while typing.
 * - A server field error stays until its own field is edited or the form is
 *   submitted again; a server `VALIDATION_FAILED` also focuses the field.
 *
 * Attach `formRef` to the `<form>`, call `fieldChanged` / `fieldBlurred` from
 * the controls, and `validateForSubmit` from the submit handler.
 */
export const useFormValidation = <TValues extends FormValues, TOutput>({
  schema,
  values,
  serverError,
  dependentFields,
  translate,
}: UseFormValidationOptions<TValues, TOutput>) => {
  const latestServerError = serverError ?? null;

  type Field = keyof TValues & string;

  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [hasSubmitted, setHasSubmitted] = useState(false);
  // Bumped whenever the first invalid field should get focus. The effect
  // below runs after the render that shows the errors, so they are in the
  // DOM when it looks for them.
  const [focusRequest, setFocusRequest] = useState(0);
  const [server, setServer] = useState<ServerErrorState>({
    seen: latestServerError,
    error: latestServerError,
    dismissed: [],
  });

  // A new server error replaces the previous one (adjusting state while
  // rendering, so there is no extra render with stale errors). A reset
  // mutation (error back to null) keeps the field errors on screen.
  if (latestServerError !== server.seen) {
    if (latestServerError) {
      setServer({
        seen: latestServerError,
        error: latestServerError,
        dismissed: [],
      });

      if (Object.keys(getFieldErrors(latestServerError)).length > 0) {
        setFocusRequest((count) => count + 1);
      }
    } else {
      setServer({ ...server, seen: null });
    }
  }

  useEffect(() => {
    if (focusRequest > 0) {
      focusFirstInvalidField(formRef.current);
    }
  }, [focusRequest]);

  const getIssues = (candidate: TValues): Partial<Record<Field, string>> => {
    const result = schema.safeParse(candidate);

    return result.success ? {} : getIssueKeys<Field>(result.error);
  };

  const withDependents = (field: Field): Field[] => [
    field,
    ...(dependentFields?.[field] ?? []),
  ];

  /** Call on every change, with the values after the change. */
  const fieldChanged = (field: Field, nextValues: TValues) => {
    setServer((current) =>
      current.dismissed.includes(field)
        ? current
        : { ...current, dismissed: [...current.dismissed, field] },
    );

    if (!hasSubmitted) {
      return;
    }

    // Only clear errors here; new ones wait for blur or submit.
    const issues = getIssues(nextValues);

    setErrors((current) => {
      const next = { ...current };

      for (const name of withDependents(field)) {
        if (!issues[name]) {
          delete next[name];
        }
      }

      return next;
    });
  };

  const fieldBlurred = (field: Field) => {
    if (!hasSubmitted) {
      return;
    }

    const issues = getIssues(values);

    setErrors((current) => {
      const next = { ...current };

      for (const name of withDependents(field)) {
        if (issues[name]) {
          next[name] = issues[name];
        } else {
          delete next[name];
        }
      }

      return next;
    });
  };

  /**
   * Validates every field. Returns the parsed values, or `null` after showing
   * the errors and focusing the first invalid field.
   */
  const validateForSubmit = (): TOutput | null => {
    setHasSubmitted(true);
    setServer((current) => ({ ...current, error: null, dismissed: [] }));

    const result = schema.safeParse(values);

    if (result.success) {
      setErrors({});
      return result.data;
    }

    setErrors(getIssueKeys<Field>(result.error));
    setFocusRequest((count) => count + 1);
    return null;
  };

  /** Back to the untouched state, e.g. after new values are loaded or sent. */
  const reset = useCallback(() => {
    setErrors({});
    setHasSubmitted(false);
    setServer((current) => ({ ...current, error: null, dismissed: [] }));
  }, []);

  const serverFieldErrors = getFieldErrors(server.error);

  /** The field's message to show: the client error first, then the server's. */
  const getError = (field: Field): string | undefined => {
    const key = errors[field];

    if (key) {
      return translate(key);
    }

    return server.dismissed.includes(field)
      ? undefined
      : serverFieldErrors[field];
  };

  return {
    formRef,
    getError,
    fieldChanged,
    fieldBlurred,
    validateForSubmit,
    reset,
  };
};
