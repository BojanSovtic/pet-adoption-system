import { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { MODERATION_REASON_MAX_LENGTH } from '@pet-adoption/models';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { adminQueryKeys } from '../api/admin';

type ConfirmActionProps = {
  /** Visible button text, e.g. "Suspend". */
  label: string;
  /**
   * Names the target too ("Suspend: Ana"); the label repeats on every row.
   * Also the dialog title.
   */
  accessibleName: string;
  /** The consequence, shown before anything happens. */
  question: string;
  confirmLabel: string;
  destructive?: boolean;
  /** Shows an optional reason field (kept in the audit log). */
  withReason?: boolean;
  onConfirm: (reason?: string) => Promise<unknown>;
  successMessage: string;
};

/**
 * An admin action behind the shared confirmation dialog. On success all admin
 * data is refetched; errors (LAST_ADMIN, CANNOT_SUSPEND_ADMIN, …) use the
 * global error toast. The API enforces every rule; this only offers the action.
 */
const ConfirmAction = ({
  label,
  accessibleName,
  question,
  confirmLabel,
  destructive = false,
  withReason = false,
  onConfirm,
  successMessage,
}: ConfirmActionProps) => {
  const { t } = useTranslation('admin');
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const id = useId();

  const mutation = useMutation({
    mutationFn: () => onConfirm(reason.trim() || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.all });
      toast.success(successMessage);
    },
  });

  return (
    <ConfirmDialog
      trigger={
        <Button size="sm" variant="outline" aria-label={accessibleName}>
          {label}
        </Button>
      }
      title={accessibleName}
      description={question}
      confirmLabel={confirmLabel}
      cancelLabel={t('cancel')}
      destructive={destructive}
      onConfirm={() => mutation.mutateAsync()}
      onClose={() => setReason('')}
    >
      {withReason && (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-reason`}>{t('reasonLabel')}</Label>
          <Textarea
            id={`${id}-reason`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={MODERATION_REASON_MAX_LENGTH}
            rows={2}
            className="min-h-16"
          />
        </div>
      )}
    </ConfirmDialog>
  );
};

export { ConfirmAction };
