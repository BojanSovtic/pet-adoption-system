import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

import {
  getErrorMessage,
  getFieldErrors,
} from '../../../lib/get-error-message';
import { currentUserQueryKey } from '../api/get-current-user';
import { login } from '../api/login';
import { FormField } from '../components/form-field';
import { useCurrentUser } from '../hooks/use-current-user';
import { getFormErrors, loginFormSchema } from '../utils/auth-schemas';

type LoginValues = { email: string; password: string };

const LoginPage = () => {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();

  const [values, setValues] = useState<LoginValues>({
    email: '',
    password: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    meta: { skipGlobalErrorToast: true },
    mutationFn: (input: LoginValues) => login(input),
    onSuccess: (user) => {
      queryClient.setQueryData(currentUserQueryKey, user);
      toast.success(t('login.success', { name: user.name }));
      navigate('/pets', { replace: true });
    },
  });

  if (currentUser) {
    return <Navigate to="/pets" replace />;
  }

  const updateField = (field: keyof LoginValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: '' }));
    mutation.reset();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    mutation.reset();

    const result = loginFormSchema.safeParse(values);

    if (!result.success) {
      const errors = getFormErrors(result.error);

      setFieldErrors(
        Object.fromEntries(
          Object.entries(errors).map(([field, key]) => [field, t(key)]),
        ),
      );
      return;
    }

    setFieldErrors({});
    mutation.mutate(result.data);
  };

  const serverFieldErrors = getFieldErrors(mutation.error);
  const getFieldError = (field: keyof LoginValues) =>
    fieldErrors[field] || serverFieldErrors[field];

  const errorMessage = mutation.error
    ? getErrorMessage(mutation.error, t('login.error'))
    : null;

  return (
    <section className="mx-auto w-full max-w-md">
      <h1 className="mb-8 text-3xl font-semibold tracking-tight">
        {t('login.title')}
      </h1>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
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
          autoComplete="current-password"
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
          {mutation.isPending ? t('login.submitting') : t('login.submit')}
        </Button>
      </form>

      <p className="mt-6 text-sm text-muted-foreground">
        {t('login.noAccount')}{' '}
        <Link to="/register" className="font-medium text-foreground underline">
          {t('register.link')}
        </Link>
      </p>
    </section>
  );
};

export { LoginPage };
