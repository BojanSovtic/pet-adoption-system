import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { PASSWORD_MIN_LENGTH, type RegisterInput } from '@pet-adoption/models';

import { Button } from '@/components/ui/button';

import { getErrorMessage } from '../../../lib/get-error-message';
import { useFormValidation } from '../../../lib/use-form-validation';
import { setCurrentUser } from '../utils/set-current-user';
import { register } from '../api/register';
import { FormField } from '../components/form-field';
import { useCurrentUser } from '../hooks/use-current-user';
import { registerFormSchema } from '../utils/auth-schemas';

type RegisterValues = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
};

const RegisterPage = () => {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: currentUser, isPending: isUserPending } = useCurrentUser();

  const [values, setValues] = useState<RegisterValues>({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const mutation = useMutation({
    meta: { skipGlobalErrorToast: true },
    mutationFn: (input: RegisterInput) => register(input),
    onSuccess: (user) => {
      // The API signs the user in as part of registration.
      setCurrentUser(queryClient, user);
      toast.success(t('register.success', { name: user.name }));
      navigate('/pets', { replace: true });
    },
  });

  const validation = useFormValidation({
    schema: registerFormSchema,
    values,
    serverError: mutation.error,
    // Editing the password can fix or cause a mismatch.
    dependentFields: { password: ['confirmPassword'] },
    translate: (key) => t(key, { min: PASSWORD_MIN_LENGTH }),
  });

  // Render nothing until the session is known, so a signed-in user is
  // redirected without first seeing the form flash.
  if (isUserPending) {
    return null;
  }

  if (currentUser) {
    return <Navigate to="/pets" replace />;
  }

  const updateField = (field: keyof RegisterValues, value: string) => {
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

    if (!data) {
      return;
    }

    // Only the API's fields: the confirmation stays in the form.
    const { name, email, password } = data;
    mutation.mutate({ name, email, password });
  };

  // Props shared by every field: value, handlers and error.
  const fieldProps = (field: keyof RegisterValues) => ({
    id: field,
    value: values[field],
    onChange: (event: ChangeEvent<HTMLInputElement>) =>
      updateField(field, event.target.value),
    onBlur: () => validation.fieldBlurred(field),
    error: validation.getError(field),
  });

  const errorMessage = mutation.error
    ? getErrorMessage(mutation.error, t('register.error'))
    : null;

  return (
    <section className="mx-auto w-full max-w-md">
      <h1 className="mb-8 text-3xl font-semibold tracking-tight">
        {t('register.title')}
      </h1>

      <form
        ref={validation.formRef}
        onSubmit={handleSubmit}
        noValidate
        className="space-y-6"
      >
        <FormField
          {...fieldProps('name')}
          autoComplete="name"
          required
          label={t('fields.name')}
        />

        <FormField
          {...fieldProps('email')}
          type="email"
          autoComplete="email"
          required
          label={t('fields.email')}
        />

        <FormField
          {...fieldProps('password')}
          type="password"
          autoComplete="new-password"
          required
          label={t('fields.password')}
          hint={t('hints.password', { min: PASSWORD_MIN_LENGTH })}
        />

        <FormField
          {...fieldProps('confirmPassword')}
          type="password"
          autoComplete="new-password"
          required
          label={t('fields.confirmPassword')}
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
