import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ApplicationAction } from '@pet-adoption/models';

import {
  applicationQueryKeys,
  rejectApplication,
  runApplicationAction,
} from '../api/applications';

type ActionVariables =
  | {
      applicationId: string;
      action: Exclude<ApplicationAction, 'reject'>;
    }
  | { applicationId: string; action: 'reject'; reason: string };

/**
 * Accept, reject (with the owner's reason) or withdraw. Errors use the global
 * mutation toast. Invalidating every application query also refreshes the
 * owner's pending count; pet statuses can change with any action, so pets are
 * refetched too.
 */
export const useApplicationAction = () => {
  const { t } = useTranslation('applications');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: ActionVariables) =>
      variables.action === 'reject'
        ? rejectApplication(variables.applicationId, {
            reason: variables.reason,
          })
        : runApplicationAction(variables.applicationId, variables.action),
    onSuccess: async (_application, { action }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: applicationQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['pets'] }),
      ]);
      toast.success(t(`actionSuccess.${action}`));
    },
  });
};
