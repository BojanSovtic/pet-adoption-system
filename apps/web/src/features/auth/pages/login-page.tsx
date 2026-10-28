import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

import {
  getErrorMessage,
  getFieldErrors,
} from '../../../lib/get-error-message';
import { setCurrentUser } from '../utils/set-current-user';
import { login } from '../api/login';
import { FormField } from '../components/form-field';
import { useCurrentUser } from '../hooks/use-current-user';
import { getFormErrors, loginFormSchema } from '../utils/auth-schemas';

type LoginValues = { email: string; password: string };

/** The in-app page that sent the user here (e.g. the pet form), if any. */
const getReturnPath = (state: unknown): string => {
  const from =
    typeof state === 'object' && state !== null && 'from' in state
      ? state.from
      : undefined;

  // Only same-app paths: "/pets/new" yes; "//evil.example" and "/\evil.example"
  // no (browsers read a backslash as a slash, see GHSA-wrjc-x8rr-h8h6).
  return typeof from === 'string' &&
    /^\/(?!\/)/.test(from) &&
    !from.includes('\\')
    ? from
    : '/pets';
};

const LoginPage = () => {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const location = useLocation();
  const returnPath = getReturnPath(location.state);
  const queryClient = useQueryClient();
  const { data: currentUser, isPending: isUserPending } = useCurrentUser();

  const [values, setValues] = useState<LoginValues>({
    email: '',
    password: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    meta: { skipGlobalErrorToast: true },
    mutationFn: (input: LoginValues) => login(input),
    onSuccess: (user) => {
      setCurrentUser(queryClient, user);
      toast.success(t('login.success', { name: user.name }));
      navigate(returnPath, { replace: true });
    },
  });

  // Render nothing until the session is known, so a signed-in user is
  // redirected without first seeing the form flash.
  if (isUserPending) {
    return null;
  }

  if (currentUser) {
    return <Navigate to={returnPath} replace />;
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
      // Translation keys; translated on render so a language change applies.
      setFieldErrors(getFormErrors(result.error));
      return;
    }

    setFieldErrors({});
    mutation.mutate(result.data);
  };

  const serverFieldErrors = getFieldErrors(mutation.error);
  const getFieldError = (field: keyof LoginValues) =>
    (fieldErrors[field] && t(fieldErrors[field])) || serverFieldErrors[field];

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
