import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

import { getErrorMessage } from '../../../lib/get-error-message';
import { useFormValidation } from '../../../lib/use-form-validation';
import { setCurrentUser } from '../utils/set-current-user';
import { login } from '../api/login';
import { FormField } from '../components/form-field';
import { useCurrentUser } from '../hooks/use-current-user';
import { loginFormSchema } from '../utils/auth-schemas';

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

  const mutation = useMutation({
    meta: { skipGlobalErrorToast: true },
    mutationFn: (input: LoginValues) => login(input),
    onSuccess: (user) => {
      setCurrentUser(queryClient, user);
      toast.success(t('login.success', { name: user.name }));
      navigate(returnPath, { replace: true });
    },
  });

  const validation = useFormValidation({
    schema: loginFormSchema,
    values,
    serverError: mutation.error,
    translate: (key) => t(key),
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
    const nextValues = { ...values, [field]: value };
    setValues(nextValues);
    validation.fieldChanged(field, nextValues);
    // Clears the form-level error; server field errors are kept per field.
    mutation.reset();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    mutation.reset();

    const data = validation.validateForSubmit();

    if (data) {
      mutation.mutate(data);
    }
  };

  const errorMessage = mutation.error
    ? getErrorMessage(mutation.error, t('login.error'))
    : null;

  return (
    <section className="mx-auto w-full max-w-md">
      <h1 className="mb-8 text-3xl font-semibold tracking-tight">
        {t('login.title')}
      </h1>

      <form
        ref={validation.formRef}
        onSubmit={handleSubmit}
        noValidate
        className="space-y-6"
      >
        <FormField
          id="email"
          type="email"
          autoComplete="email"
          required
          label={t('fields.email')}
          value={values.email}
          onChange={(event) => updateField('email', event.target.value)}
          onBlur={() => validation.fieldBlurred('email')}
          error={validation.getError('email')}
        />

        <FormField
          id="password"
          type="password"
          autoComplete="current-password"
          required
          label={t('fields.password')}
          value={values.password}
          onChange={(event) => updateField('password', event.target.value)}
          onBlur={() => validation.fieldBlurred('password')}
          error={validation.getError('password')}
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
