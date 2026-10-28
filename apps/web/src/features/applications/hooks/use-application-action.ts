import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ApplicationAction } from '@pet-adoption/models';

import {
  applicationQueryKeys,
  runApplicationAction,
} from '../api/applications';

type ActionVariables = { applicationId: string; action: ApplicationAction };

/**
 * Accept, reject or withdraw. Errors use the global mutation toast. Pet
 * statuses can change with any action, so pets are refetched too.
 */
export const useApplicationAction = () => {
  const { t } = useTranslation('applications');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ applicationId, action }: ActionVariables) =>
      runApplicationAction(applicationId, action),
    onSuccess: async (_application, { action }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: applicationQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['pets'] }),
      ]);
      toast.success(t(`actionSuccess.${action}`));
    },
  });
};
