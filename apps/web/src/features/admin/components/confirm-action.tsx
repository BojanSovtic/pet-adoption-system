import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { MODERATION_REASON_MAX_LENGTH } from '@pet-adoption/models';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { adminQueryKeys } from '../api/admin';

type ConfirmActionProps = {
  /** Visible button text, e.g. "Suspend". */
  label: string;
  /** Names the target too ("Suspend: Ana"); the label repeats on every row. */
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
 * An admin action behind an inline confirmation: the button turns into the
 * question with Confirm and Cancel, and focus moves to Cancel (the safe
 * choice). On success all admin data is refetched; errors (LAST_ADMIN,
 * CANNOT_SUSPEND_ADMIN, …) use the global error toast. The API enforces
 * every rule; this only offers the action.
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
  const [isConfirming, setIsConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const cancelRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (isConfirming) {
      cancelRef.current?.focus();
    }
  }, [isConfirming]);

  const mutation = useMutation({
    mutationFn: () => onConfirm(reason.trim() || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.all });
      toast.success(successMessage);
    },
    onSettled: () => {
      setIsConfirming(false);
      setReason('');
    },
  });

  if (!isConfirming) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => setIsConfirming(true)}
        aria-label={accessibleName}
      >
        {label}
      </Button>
    );
  }

  return (
    <div
      role="group"
      aria-labelledby={`${id}-question`}
      className="w-full space-y-3 rounded-md border bg-muted/60 p-3"
    >
      <p id={`${id}-question`} className="text-sm font-medium">
        {question}
      </p>

      {withReason && (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-reason`} className="font-normal">
            {t('reasonLabel')}
          </Label>
          <Textarea
            id={`${id}-reason`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={MODERATION_REASON_MAX_LENGTH}
            rows={2}
            className="min-h-16 bg-card"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={destructive ? 'destructive' : 'default'}
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {confirmLabel}
        </Button>
        <Button
          ref={cancelRef}
          size="sm"
          variant="outline"
          disabled={mutation.isPending}
          onClick={() => setIsConfirming(false)}
        >
          {t('cancel')}
        </Button>
      </div>
    </div>
  );
};

export { ConfirmAction };
