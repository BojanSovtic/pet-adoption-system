import { useState, type FormEvent, type ReactNode } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { CONVERSATION_MESSAGE_MAX_LENGTH } from '@pet-adoption/models';

import { FieldError } from '@/components/field-error';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { getErrorMessage } from '../../../lib/get-error-message';
import { useFormValidation } from '../../../lib/use-form-validation';

const messageFormSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'form.required')
    .max(CONVERSATION_MESSAGE_MAX_LENGTH, 'form.tooLong'),
});

type MessageFormProps = {
  /** Prefix for element ids, unique on the page. */
  id: string;
  label: string;
  hint?: string;
  /** Sends the trimmed text; the form clears itself when it succeeds. */
  mutation: UseMutationResult<unknown, Error, string>;
  autoFocus?: boolean;
  /** Extra buttons next to Send, e.g. Cancel. */
  secondaryAction?: ReactNode;
};

/**
 * One text message: label, optional hint, character counter, and the shared
 * validation behaviour (see "Form validation and errors" in design-system.md).
 * A failed send keeps the text and shows the error above the button.
 */
const MessageForm = ({
  id,
  label,
  hint,
  mutation,
  autoFocus = false,
  secondaryAction,
}: MessageFormProps) => {
  const { t } = useTranslation('messages');
  const [body, setBody] = useState('');

  const validation = useFormValidation({
    schema: messageFormSchema,
    values: { body },
    serverError: mutation.error,
    translate: (key) => t(key),
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    mutation.reset();

    const data = validation.validateForSubmit();

    if (data) {
      mutation.mutate(data.body, {
        onSuccess: () => {
          setBody('');
          validation.reset();
        },
      });
    }
  };

  const fieldId = `${id}-body`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const fieldError = validation.getError('body');
  const describedBy =
    [hint ? hintId : null, fieldError ? errorId : null]
      .filter(Boolean)
      .join(' ') || undefined;
  const errorMessage = mutation.error
    ? getErrorMessage(mutation.error, t('form.error'))
    : null;

  return (
    <form
      ref={validation.formRef}
      onSubmit={handleSubmit}
      noValidate
      className="space-y-3"
    >
      <div className="space-y-2">
        <Label htmlFor={fieldId} required>
          {label}
        </Label>
        {hint && (
          <p id={hintId} className="text-sm text-muted-foreground">
            {hint}
          </p>
        )}
        <Textarea
          id={fieldId}
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            validation.fieldChanged('body', { body: event.target.value });
            // Clears the form-level error; field errors are kept per field.
            mutation.reset();
          }}
          onBlur={() => validation.fieldBlurred('body')}
          maxLength={CONVERSATION_MESSAGE_MAX_LENGTH}
          rows={4}
          required
          autoFocus={autoFocus}
          aria-invalid={Boolean(fieldError)}
          aria-describedby={describedBy}
        />
        <div className="flex items-start justify-between gap-3">
          {fieldError ? (
            <FieldError id={errorId} message={fieldError} />
          ) : (
            <span />
          )}
          <span
            aria-hidden="true"
            className="shrink-0 text-xs tabular-nums text-muted-foreground"
          >
            {body.length} / {CONVERSATION_MESSAGE_MAX_LENGTH}
          </span>
        </div>
      </div>

      {errorMessage && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? t('form.sending') : t('form.send')}
        </Button>
        {secondaryAction}
      </div>
    </form>
  );
};

export { MessageForm };
