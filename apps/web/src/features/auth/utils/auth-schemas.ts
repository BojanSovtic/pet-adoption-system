import { z } from 'zod';
import {
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USER_NAME_MAX_LENGTH,
} from '@pet-adoption/models';

// Messages are translation keys in the `auth` namespace. The API validates
// again; these checks only give faster feedback.
const emailSchema = z
  .string()
  .trim()
  .min(1, 'validation.emailRequired')
  .pipe(z.email('validation.emailInvalid').max(EMAIL_MAX_LENGTH));

export const loginFormSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, 'validation.passwordRequired')
    .max(PASSWORD_MAX_LENGTH, 'validation.passwordTooLong'),
});

// "confirmPassword" is checked here only; it is never sent to the API.
export const registerFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'validation.nameRequired')
      .max(USER_NAME_MAX_LENGTH, 'validation.nameTooLong'),
    email: emailSchema,
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, 'validation.passwordTooShort')
      .max(PASSWORD_MAX_LENGTH, 'validation.passwordTooLong'),
    confirmPassword: z.string().min(1, 'validation.confirmPasswordRequired'),
  })
  .refine(
    ({ password, confirmPassword }) =>
      !confirmPassword || password === confirmPassword,
    {
      path: ['confirmPassword'],
      message: 'validation.passwordsMismatch',
      // Report a mismatch even while another field still has an error.
      when: () => true,
    },
  );
