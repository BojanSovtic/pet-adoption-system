import { useId, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { APPLICATION_REJECTION_REASON_MAX_LENGTH } from '@pet-adoption/models';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { FieldError } from '@/components/field-error';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { useFormValidation } from '../../../lib/use-form-validation';

// The same rule as the API: trimmed first, so only spaces count as missing.
const rejectFormSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, 'reject.reasonRequired')
    .max(APPLICATION_REJECTION_REASON_MAX_LENGTH, 'reject.reasonTooLong'),
});

type RejectApplicationDialogProps = {
  trigger: ReactElement;
  /** Runs the rejection with the trimmed reason. */
  onReject: (reason: string) => Promise<unknown>;
};

/**
 * The reject confirmation with the owner's required reason, which the
 * applicant will see. The reason is local to the dialog and cleared when it
 * closes. An API error closes it too (shown by the global toast).
 */
const RejectApplicationDialog = ({
  trigger,
  onReject,
}: RejectApplicationDialogProps) => {
  const { t } = useTranslation('applications');
  const id = useId();
  const [reason, setReason] = useState('');

  const validation = useFormValidation({
    schema: rejectFormSchema,
    values: { reason },
    translate: (key) => t(key),
  });
  const fieldError = validation.getError('reason');
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  return (
    <ConfirmDialog
      trigger={trigger}
      title={t('confirm.rejectTitle')}
      description={t('confirm.reject')}
      confirmLabel={t('confirm.rejectButton')}
      cancelLabel={t('confirm.cancel')}
      beforeConfirm={() => validation.validateForSubmit() !== null}
      // Runs only after `beforeConfirm` accepted this same value.
      onConfirm={() => onReject(reason.trim())}
      onClose={() => {
        setReason('');
        validation.reset();
      }}
    >
      <form
        ref={validation.formRef}
        noValidate
        onSubmit={(event) => event.preventDefault()}
        className="space-y-1.5"
      >
        <Label htmlFor={`${id}-reason`} required>
          {t('reject.reasonLabel')}
        </Label>
        <p id={hintId} className="text-sm text-muted-foreground">
          {t('reject.reasonHint')}
        </p>
        <Textarea
          id={`${id}-reason`}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            validation.fieldChanged('reason', { reason: event.target.value });
          }}
          onBlur={() => validation.fieldBlurred('reason')}
          maxLength={APPLICATION_REJECTION_REASON_MAX_LENGTH}
          rows={4}
          required
          aria-invalid={Boolean(fieldError)}
          aria-describedby={fieldError ? `${hintId} ${errorId}` : hintId}
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
            {reason.length} / {APPLICATION_REJECTION_REASON_MAX_LENGTH}
          </span>
        </div>
      </form>
    </ConfirmDialog>
  );
};

export { RejectApplicationDialog };
