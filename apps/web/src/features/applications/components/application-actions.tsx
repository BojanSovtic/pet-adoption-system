import { useTranslation } from 'react-i18next';
import {
  getAllowedApplicationActions,
  type ApplicationAction,
  type ApplicationActor,
  type ApplicationStatus,
} from '@pet-adoption/models';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';

import { useApplicationAction } from '../hooks/use-application-action';
import { RejectApplicationDialog } from './reject-application-dialog';

// Accepting and rejecting are final (accepting also rejects every other
// pending application), so they ask first; rejecting also asks for the
// reason (RejectApplicationDialog). Withdrawing doesn't: the applicant can
// apply again.
const ACTIONS_TO_CONFIRM: ReadonlySet<ApplicationAction> = new Set(['accept']);

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
  if (actions.length === 0) {
    return null;
  }

  const run = (action: Exclude<ApplicationAction, 'reject'>) =>
    mutation.mutateAsync({ applicationId, action });

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => {
        if (action === 'reject') {
          // Destructive dialog with the owner's required reason.
          return (
            <RejectApplicationDialog
              key={action}
              trigger={
                <Button
                  size="sm"
                  variant="outline"
                  disabled={mutation.isPending}
                >
                  {t('actions.reject')}
                </Button>
              }
              onReject={(reason) =>
                mutation.mutateAsync({ applicationId, action, reason })
              }
            />
          );
        }

        const button = (
          <Button
            key={action}
            size="sm"
            variant={action === 'accept' ? 'default' : 'outline'}
            disabled={mutation.isPending}
            onClick={
              ACTIONS_TO_CONFIRM.has(action)
                ? undefined
                : () => mutation.mutate({ applicationId, action })
            }
          >
            {t(`actions.${action}`)}
          </Button>
        );

        return ACTIONS_TO_CONFIRM.has(action) ? (
          <ConfirmDialog
            key={action}
            trigger={button}
            title={t(`confirm.${action}Title`)}
            description={t(`confirm.${action}`)}
            confirmLabel={t(`confirm.${action}Button`)}
            cancelLabel={t('confirm.cancel')}
            // Accepting is final but not a loss, so it keeps the main colour.
            destructive={false}
            onConfirm={() => run(action)}
          />
        ) : (
          button
        );
      })}
    </div>
  );
};

export { ApplicationActions };
