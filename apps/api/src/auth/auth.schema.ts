import { z } from 'zod';
import {
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USER_NAME_MAX_LENGTH,
  type LoginInput,
  type RegisterInput,
} from '@pet-adoption/models';

// Normalize before validating so " Milo@Example.com " is stored and looked up
// as "milo@example.com".
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(EMAIL_MAX_LENGTH));

export const registerSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).max(USER_NAME_MAX_LENGTH),
  // Passwords are never trimmed; the upper bound limits hashing cost.
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
}) satisfies z.ZodType<RegisterInput>;

// No minimum length on login: a password policy change must not lock out
// existing users, and the error should not reveal the policy.
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
}) satisfies z.ZodType<LoginInput>;
