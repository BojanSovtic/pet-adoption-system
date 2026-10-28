import {
  useState,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

type ConfirmDialogProps = {
  /** The button that opens the dialog. */
  trigger: ReactElement;
  /** A short question, e.g. "Delete Milo?". */
  title: string;
  /** What will happen, in words that match the real rules. */
  description: ReactNode;
  confirmLabel: string;
  /** Shown on the confirm button while the action runs. */
  pendingLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for destructive or final actions (the default). */
  destructive?: boolean;
  /**
   * Runs the action. The dialog stays open, with both buttons disabled, until
   * it settles, then closes. Errors are shown by the global mutation toast
   * (query-client.ts), so a rejection only closes the dialog.
   */
  onConfirm: () => Promise<unknown>;
  /** Extra fields between the description and the buttons (e.g. a reason). */
  children?: ReactNode;
  /** Called after the dialog closes, e.g. to reset a reason field. */
  onClose?: () => void;
};

/**
 * The one confirmation pattern for destructive or final actions (delete a
 * pet, accept/reject an application, admin moderation). Focus starts on
 * Cancel, the safe choice.
 */
const ConfirmDialog = ({
  trigger,
  title,
  description,
  confirmLabel,
  pendingLabel,
  cancelLabel,
  destructive = true,
  onConfirm,
  children,
  onClose,
}: ConfirmDialogProps) => {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const close = () => {
    setOpen(false);
    onClose?.();
  };

  const handleOpenChange = (next: boolean) => {
    // Esc and Cancel can't close the dialog while the action runs.
    if (isPending) {
      return;
    }

    if (next) {
      setOpen(true);
    } else {
      close();
    }
  };

  const handleConfirm = async (event: MouseEvent) => {
    // Keep the dialog open until the action has finished.
    event.preventDefault();
    setIsPending(true);

    try {
      await onConfirm();
    } catch {
      // Already reported by the global error toast.
    } finally {
      setIsPending(false);
      close();
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>

        {children}

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <AlertDialogCancel asChild>
            <Button variant="outline" disabled={isPending}>
              {cancelLabel ?? t('actions.cancel')}
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              variant={destructive ? 'destructive' : 'default'}
              disabled={isPending}
              aria-busy={isPending}
              onClick={(event) => void handleConfirm(event)}
            >
              {isPending && pendingLabel ? pendingLabel : confirmLabel}
            </Button>
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export { ConfirmDialog };
