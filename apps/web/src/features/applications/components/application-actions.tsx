import { useTranslation } from 'react-i18next';
import {
  getAllowedApplicationActions,
  type ApplicationActor,
  type ApplicationStatus,
} from '@pet-adoption/models';

import { Button } from '@/components/ui/button';

import { useApplicationAction } from '../hooks/use-application-action';

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

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <Button
          key={action}
          size="sm"
          variant={action === 'accept' ? 'default' : 'outline'}
          disabled={mutation.isPending}
          onClick={() => mutation.mutate({ applicationId, action })}
        >
          {t(`actions.${action}`)}
        </Button>
      ))}
    </div>
  );
};

export { ApplicationActions };
