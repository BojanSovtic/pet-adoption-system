import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { APPLICATION_MESSAGE_MAX_LENGTH, type Pet } from '@pet-adoption/models';

import { FieldError } from '@/components/field-error';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { getErrorMessage } from '../../../lib/get-error-message';
import { useFormValidation } from '../../../lib/use-form-validation';
import { useCurrentUser } from '../../auth/hooks/use-current-user';
import { isPetOwner } from '../../pets/utils/is-pet-owner';
import {
  applicationQueryKeys,
  getMyApplications,
  submitApplication,
} from '../api/applications';
import { ApplicationActions } from './application-actions';
import { ApplicationStatusBadge } from './application-status-badge';

const applicationFormSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'form.messageRequired')
    .max(APPLICATION_MESSAGE_MAX_LENGTH, 'form.messageTooLong'),
});

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

  // Only the newest application for this pet matters: while one is pending,
  // accepted or rejected, the API allows no newer one, so if the newest is
  // withdrawn there is no active application.
  const myApplicationQuery = { pet: pet._id, pageSize: 1 };
  const { data: myApplications, isPending: isApplicationsPending } = useQuery({
    queryKey: applicationQueryKeys.mine(myApplicationQuery),
    queryFn: () => getMyApplications(myApplicationQuery),
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
      // If the form returns (after a withdrawal), it starts untouched.
      resetValidation();
      toast.success(t('form.success'));
    },
  });

  const validation = useFormValidation({
    schema: applicationFormSchema,
    values: { message },
    serverError: mutation.error,
    translate: (key) => t(key),
  });
  const { reset: resetValidation } = validation;

  if (isUserPending) {
    return null;
  }

  // Pets created before ownership existed cannot receive applications.
  const canReceiveApplications = Boolean(pet.owner) && pet.status !== 'adopted';

  // Shown instead of the form when nobody can apply any more.
  const adoptedNotice =
    pet.status === 'adopted' ? (
      <p className="text-sm text-muted-foreground">
        {t('adoptedNotice', { name: pet.name })}
      </p>
    ) : null;

  if (!currentUser) {
    if (!canReceiveApplications) {
      return adoptedNotice;
    }

    return (
      <div className="space-y-3">
        <p className="font-medium">{t('interested', { name: pet.name })}</p>
        <Button asChild className="w-full">
          <Link to="/login" state={{ from: location.pathname }}>
            {t('signInToApply')}
          </Link>
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          {t('noAccount')}{' '}
          <Link
            to="/register"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {t('createAccount')}
          </Link>
        </p>
      </div>
    );
  }

  if (isOwner) {
    return (
      <Button asChild variant="outline" className="w-full">
        <Link to="/applications">{t('reviewApplications')}</Link>
      </Button>
    );
  }

  if (isApplicationsPending) {
    return null;
  }

  // A withdrawn application can be replaced, so it does not count.
  const myApplication = myApplications?.items.find(
    (application) =>
      application.pet._id === pet._id && application.status !== 'withdrawn',
  );

  if (myApplication) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{t('yourApplication')}</span>
          <ApplicationStatusBadge status={myApplication.status} />
        </div>
        <ApplicationActions
          applicationId={myApplication._id}
          status={myApplication.status}
          actor="applicant"
        />
      </div>
    );
  }

  if (!canReceiveApplications) {
    return adoptedNotice;
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    mutation.reset();

    const data = validation.validateForSubmit();

    if (data) {
      mutation.mutate(data.message);
    }
  };

  const fieldError = validation.getError('message');
  const errorMessage = mutation.error
    ? getErrorMessage(mutation.error, t('form.error'))
    : null;

  return (
    <form
      ref={validation.formRef}
      onSubmit={handleSubmit}
      noValidate
      className="space-y-4"
    >
      <h2 className="text-xl">{t('form.title', { name: pet.name })}</h2>

      <div className="space-y-2">
        <Label htmlFor="application-message" required>
          {t('form.message', { name: pet.name })}
        </Label>
        <p
          id="application-message-hint"
          className="text-sm text-muted-foreground"
        >
          {t('form.hint')}
        </p>
        <Textarea
          id="application-message"
          value={message}
          onChange={(event) => {
            setMessage(event.target.value);
            validation.fieldChanged('message', { message: event.target.value });
            // Clears the form-level error; field errors are kept per field.
            mutation.reset();
          }}
          onBlur={() => validation.fieldBlurred('message')}
          maxLength={APPLICATION_MESSAGE_MAX_LENGTH}
          rows={5}
          required
          aria-invalid={Boolean(fieldError)}
          aria-describedby={
            fieldError
              ? 'application-message-hint application-message-error'
              : 'application-message-hint'
          }
        />
        <div className="flex items-start justify-between gap-3">
          {fieldError ? (
            <FieldError id="application-message-error" message={fieldError} />
          ) : (
            <span />
          )}
          <span
            aria-hidden="true"
            className="shrink-0 text-xs tabular-nums text-muted-foreground"
          >
            {message.length} / {APPLICATION_MESSAGE_MAX_LENGTH}
          </span>
        </div>
      </div>

      {errorMessage && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={mutation.isPending}>
        {mutation.isPending ? t('form.submitting') : t('form.submit')}
      </Button>
    </form>
  );
};

export { PetApplicationSection };
