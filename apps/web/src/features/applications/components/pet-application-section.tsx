import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { APPLICATION_MESSAGE_MAX_LENGTH, type Pet } from '@pet-adoption/models';

import { Button } from '@/components/ui/button';

import {
  getErrorMessage,
  getFieldErrors,
} from '../../../lib/get-error-message';
import { useCurrentUser } from '../../auth/hooks/use-current-user';
import { isPetOwner } from '../../pets/utils/is-pet-owner';
import {
  applicationQueryKeys,
  getMyApplications,
  submitApplication,
} from '../api/applications';
import { ApplicationActions } from './application-actions';
import { ApplicationStatusBadge } from './application-status-badge';

const messageSchema = z
  .string()
  .trim()
  .min(1, 'form.messageRequired')
  .max(APPLICATION_MESSAGE_MAX_LENGTH, 'form.messageTooLong');

type PetApplicationSectionProps = {
  pet: Pet;
};

/**
 * The adoption part of the pet detail page. What it shows depends on who is
 * looking; the API enforces the same rules.
 */
const PetApplicationSection = ({ pet }: PetApplicationSectionProps) => {
  const { t } = useTranslation('applications');
  const location = useLocation();
  const queryClient = useQueryClient();
  const { data: currentUser, isPending: isUserPending } = useCurrentUser();
  const isOwner = isPetOwner(pet, currentUser);

  const [message, setMessage] = useState('');
  const [messageError, setMessageError] = useState<string>();

  const { data: myApplications, isPending: isApplicationsPending } = useQuery({
    queryKey: applicationQueryKeys.mine,
    queryFn: getMyApplications,
    enabled: Boolean(currentUser) && !isOwner,
  });

  const mutation = useMutation({
    meta: { skipGlobalErrorToast: true },
    mutationFn: (text: string) => submitApplication(pet._id, { message: text }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: applicationQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['pets'] }),
      ]);
      setMessage('');
      toast.success(t('form.success'));
    },
  });

  if (isUserPending) {
    return null;
  }

  // Pets created before ownership existed cannot receive applications.
  const canReceiveApplications = Boolean(pet.owner) && pet.status !== 'adopted';

  if (!currentUser) {
    return canReceiveApplications ? (
      <p className="text-sm text-muted-foreground">
        {t('interested', { name: pet.name })}{' '}
        <Link
          to="/login"
          state={{ from: location.pathname }}
          className="font-medium text-foreground underline"
        >
          {t('signInToApply')}
        </Link>
      </p>
    ) : null;
  }

  if (isOwner) {
    return (
      <Button asChild variant="outline">
        <Link to="/applications">{t('reviewApplications')}</Link>
      </Button>
    );
  }

  if (isApplicationsPending) {
    return null;
  }

  // A withdrawn application can be replaced, so it does not count.
  const myApplication = myApplications?.find(
    (application) =>
      application.pet._id === pet._id && application.status !== 'withdrawn',
  );

  if (myApplication) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">{t('yourApplication')}</span>
        <ApplicationStatusBadge status={myApplication.status} />
        <ApplicationActions
          applicationId={myApplication._id}
          status={myApplication.status}
          actor="applicant"
        />
      </div>
    );
  }

  if (!canReceiveApplications) {
    return null;
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    mutation.reset();

    const result = messageSchema.safeParse(message);

    if (!result.success) {
      setMessageError(t(result.error.issues[0].message));
      return;
    }

    setMessageError(undefined);
    mutation.mutate(result.data);
  };

  const fieldError = messageError ?? getFieldErrors(mutation.error).message;
  const errorMessage = mutation.error
    ? getErrorMessage(mutation.error, t('form.error'))
    : null;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3">
      <h2 className="text-lg font-semibold">
        {t('form.title', { name: pet.name })}
      </h2>

      <div className="space-y-2">
        <label htmlFor="application-message" className="text-sm font-medium">
          {t('form.message', { name: pet.name })}
        </label>
        <textarea
          id="application-message"
          value={message}
          onChange={(event) => {
            setMessage(event.target.value);
            setMessageError(undefined);
            mutation.reset();
          }}
          maxLength={APPLICATION_MESSAGE_MAX_LENGTH}
          rows={4}
          aria-invalid={Boolean(fieldError)}
          aria-describedby={
            fieldError ? 'application-message-error' : undefined
          }
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {fieldError && (
          <p
            id="application-message-error"
            className="text-sm text-destructive"
          >
            {fieldError}
          </p>
        )}
      </div>

      {errorMessage && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? t('form.submitting') : t('form.submit')}
      </Button>
    </form>
  );
};

export { PetApplicationSection };
