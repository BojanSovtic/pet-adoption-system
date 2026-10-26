import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getAllowedApplicationActions,
  type ApplicationAction,
  type ApplicationActor,
  type ApplicationStatus,
} from '@pet-adoption/models';

import { Button } from '@/components/ui/button';

import { useApplicationAction } from '../hooks/use-application-action';

// Accepting and rejecting are final (accepting also rejects every other
// pending application), so they ask first. Withdrawing doesn't: the applicant
// can apply again.
const ACTIONS_TO_CONFIRM: ReadonlySet<ApplicationAction> = new Set([
  'accept',
  'reject',
]);

type ApplicationActionsProps = {
  applicationId: string;
  status: ApplicationStatus;
  actor: ApplicationActor;
};

/**
 * Buttons for the actions the shared state machine allows this actor in this
 * status. The API enforces the same rules.
 */
const ApplicationActions = ({
  applicationId,
  status,
  actor,
}: ApplicationActionsProps) => {
  const { t } = useTranslation('applications');
  const mutation = useApplicationAction();
  const actions = getAllowedApplicationActions(status, actor);
  const [confirming, setConfirming] = useState<ApplicationAction | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // The clicked button disappears, so move focus into the question. Cancel
  // is the safe default.
  useEffect(() => {
    if (confirming) {
      cancelRef.current?.focus();
    }
  }, [confirming]);

  if (actions.length === 0) {
    return null;
  }

  const run = (action: ApplicationAction) => {
    mutation.mutate(
      { applicationId, action },
      { onSettled: () => setConfirming(null) },
    );
  };

  if (confirming) {
    return (
      <div
        role="group"
        aria-labelledby={`confirm-${applicationId}`}
        className="space-y-3 rounded-md border bg-muted/60 p-3"
      >
        <p id={`confirm-${applicationId}`} className="text-sm font-medium">
          {t(`confirm.${confirming}`)}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={confirming === 'accept' ? 'default' : 'destructive'}
            disabled={mutation.isPending}
            onClick={() => run(confirming)}
          >
            {t(`confirm.${confirming}Button`)}
          </Button>
          <Button
            ref={cancelRef}
            size="sm"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => setConfirming(null)}
          >
            {t('confirm.cancel')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <Button
          key={action}
          size="sm"
          variant={action === 'accept' ? 'default' : 'outline'}
          disabled={mutation.isPending}
          onClick={() =>
            ACTIONS_TO_CONFIRM.has(action) ? setConfirming(action) : run(action)
          }
        >
          {t(`actions.${action}`)}
        </Button>
      ))}
    </div>
  );
};

export { ApplicationActions };
