import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { PASSWORD_MIN_LENGTH } from '@pet-adoption/models';

import { Button } from '@/components/ui/button';

import {
  getErrorMessage,
  getFieldErrors,
} from '../../../lib/get-error-message';
import { setCurrentUser } from '../utils/set-current-user';
import { register } from '../api/register';
import { FormField } from '../components/form-field';
import { useCurrentUser } from '../hooks/use-current-user';
import { getFormErrors, registerFormSchema } from '../utils/auth-schemas';

type RegisterValues = { name: string; email: string; password: string };

const RegisterPage = () => {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();

  const [values, setValues] = useState<RegisterValues>({
    name: '',
    email: '',
    password: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    meta: { skipGlobalErrorToast: true },
    mutationFn: (input: RegisterValues) => register(input),
    onSuccess: (user) => {
      // The API signs the user in as part of registration.
      setCurrentUser(queryClient, user);
      toast.success(t('register.success', { name: user.name }));
      navigate('/pets', { replace: true });
    },
  });

  if (currentUser) {
    return <Navigate to="/pets" replace />;
  }

  const updateField = (field: keyof RegisterValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: '' }));
    mutation.reset();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    mutation.reset();

    const result = registerFormSchema.safeParse(values);

    if (!result.success) {
      // Translation keys; translated on render so a language change applies.
      setFieldErrors(getFormErrors(result.error));
      return;
    }

    setFieldErrors({});
    mutation.mutate(result.data);
  };

  const serverFieldErrors = getFieldErrors(mutation.error);
  const getFieldError = (field: keyof RegisterValues) =>
    (fieldErrors[field] &&
      t(fieldErrors[field], { min: PASSWORD_MIN_LENGTH })) ||
    serverFieldErrors[field];

  const errorMessage = mutation.error
    ? getErrorMessage(mutation.error, t('register.error'))
    : null;

  return (
    <section className="mx-auto w-full max-w-md">
      <h1 className="mb-8 text-3xl font-semibold tracking-tight">
        {t('register.title')}
      </h1>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <FormField
          id="name"
          autoComplete="name"
          label={t('fields.name')}
          value={values.name}
          onChange={(event) => updateField('name', event.target.value)}
          error={getFieldError('name')}
        />

        <FormField
          id="email"
          type="email"
          autoComplete="email"
          label={t('fields.email')}
          value={values.email}
          onChange={(event) => updateField('email', event.target.value)}
          error={getFieldError('email')}
        />

        <FormField
          id="password"
          type="password"
          autoComplete="new-password"
          label={t('fields.password')}
          value={values.password}
          onChange={(event) => updateField('password', event.target.value)}
          error={getFieldError('password')}
        />

        {errorMessage && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage}
          </p>
        )}

        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? t('register.submitting') : t('register.submit')}
        </Button>
      </form>

      <p className="mt-6 text-sm text-muted-foreground">
        {t('register.haveAccount')}{' '}
        <Link to="/login" className="font-medium text-foreground underline">
          {t('login.link')}
        </Link>
      </p>
    </section>
  );
};

export { RegisterPage };
