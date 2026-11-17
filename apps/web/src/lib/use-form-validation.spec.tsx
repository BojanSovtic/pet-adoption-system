import { useState } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import '../i18n/config';
import { ApiError } from './api-client';
import { useFormValidation } from './use-form-validation';

const schema = z
  .object({
    name: z.string().trim().min(1, 'nameRequired'),
    email: z
      .string()
      .min(1, 'emailRequired')
      .refine((value) => value.includes('@'), 'emailInvalid'),
    password: z.string().min(8, 'passwordTooShort'),
    confirm: z.string().min(1, 'confirmRequired'),
  })
  .refine(({ password, confirm }) => !confirm || password === confirm, {
    path: ['confirm'],
    message: 'mismatch',
    when: () => true,
  });

type Values = z.input<typeof schema>;
const fields = ['name', 'email', 'password', 'confirm'] as const;

/** A minimal form wired like the app's forms. */
const TestForm = ({ serverError }: { serverError?: unknown }) => {
  const [values, setValues] = useState<Values>({
    name: '',
    email: '',
    password: '',
    confirm: '',
  });
  const validation = useFormValidation({
    schema,
    values,
    serverError,
    dependentFields: { password: ['confirm'] },
    translate: (key) => `msg:${key}`,
  });

  return (
    <form
      ref={validation.formRef}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        validation.validateForSubmit();
      }}
    >
      {fields.map((field) => (
        <div key={field}>
          <label htmlFor={field}>{field}</label>
          <input
            id={field}
            value={values[field]}
            aria-invalid={Boolean(validation.getError(field))}
            onChange={(event) => {
              const nextValues = { ...values, [field]: event.target.value };
              setValues(nextValues);
              validation.fieldChanged(field, nextValues);
            }}
            onBlur={() => validation.fieldBlurred(field)}
          />
          <output data-testid={`${field}-error`}>
            {validation.getError(field) ?? ''}
          </output>
        </div>
      ))}
      <button type="submit">Submit</button>
    </form>
  );
};

const input = (field: string) => screen.getByLabelText(field);
const errorOf = (field: string) =>
  screen.getByTestId(`${field}-error`).textContent;
const type = (field: string, value: string) =>
  fireEvent.change(input(field), { target: { value } });
// React's onBlur listens to `focusout`.
const leave = (field: string) => fireEvent.focusOut(input(field));
const submit = () => fireEvent.click(screen.getByRole('button'));

describe('useFormValidation', () => {
  it('shows no errors before the first submit attempt', () => {
    render(<TestForm />);

    type('email', 'not-an-email');
    leave('email');
    type('name', '');
    leave('name');

    for (const field of fields) {
      expect(errorOf(field)).toBe('');
    }
  });

  it('shows every error on submit and focuses the first invalid field', async () => {
    render(<TestForm />);
    type('email', 'milo@example.com');

    submit();

    expect(errorOf('name')).toBe('msg:nameRequired');
    expect(errorOf('email')).toBe('');
    expect(errorOf('password')).toBe('msg:passwordTooShort');
    await waitFor(() => expect(document.activeElement).toBe(input('name')));
  });

  it('focuses again on every failed submit', async () => {
    render(<TestForm />);
    submit();
    await waitFor(() => expect(document.activeElement).toBe(input('name')));

    // Leaving "name" runs its blur check, a state update.
    act(() => input('password').focus());
    submit();

    await waitFor(() => expect(document.activeElement).toBe(input('name')));
  });

  it('clears an error as soon as the field is valid, but adds new ones only on blur', () => {
    render(<TestForm />);
    submit();
    expect(errorOf('email')).toBe('msg:emailRequired');

    // Still invalid while typing: the message does not change yet.
    type('email', 'milo');
    expect(errorOf('email')).toBe('msg:emailRequired');

    type('email', 'milo@example.com');
    expect(errorOf('email')).toBe('');

    // Invalid again: nothing while typing, the error returns on blur.
    type('email', 'milo');
    expect(errorOf('email')).toBe('');
    leave('email');
    expect(errorOf('email')).toBe('msg:emailInvalid');
  });

  it('re-checks the confirmation when the password changes', () => {
    render(<TestForm />);
    type('password', 'correct horse');
    type('confirm', 'correct hors');
    submit();
    expect(errorOf('confirm')).toBe('msg:mismatch');

    // Editing the password to match clears the mismatch.
    type('password', 'correct hors');
    expect(errorOf('confirm')).toBe('');

    // A new mismatch shows when the password field is left, not while typing.
    type('password', 'correct horse battery');
    expect(errorOf('confirm')).toBe('');
    leave('password');
    expect(errorOf('confirm')).toBe('msg:mismatch');
  });

  it('shows server field errors, focuses the first and clears each only when its field is edited', async () => {
    const { rerender } = render(<TestForm />);
    type('name', 'Milo');
    type('email', 'milo@example.com');

    rerender(
      <TestForm
        serverError={
          new ApiError(400, 'VALIDATION_FAILED', [
            { field: 'name', code: 'too_big' },
            { field: 'email', code: 'invalid_format' },
          ])
        }
      />,
    );

    expect(errorOf('name')).toBe('This value is too long or too large.');
    expect(errorOf('email')).toBe('This value has an invalid format.');
    await waitFor(() => expect(document.activeElement).toBe(input('name')));

    // Another field's edit keeps both messages; its own edit clears it.
    type('password', 'x');
    expect(errorOf('name')).not.toBe('');
    type('email', 'milo@example.org');
    expect(errorOf('email')).toBe('');
    expect(errorOf('name')).toBe('This value is too long or too large.');

    // The mutation resetting (error back to null) keeps the remaining one.
    rerender(<TestForm serverError={null} />);
    expect(errorOf('name')).toBe('This value is too long or too large.');
  });

  it('does not move focus for non-field server errors', async () => {
    const { rerender } = render(<TestForm />);
    input('email').focus();

    rerender(<TestForm serverError={new ApiError(409, 'EMAIL_TAKEN')} />);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.activeElement).toBe(input('email'));
  });

  it('drops server field errors on the next submit', () => {
    const { rerender } = render(<TestForm />);
    type('name', 'Milo');
    type('email', 'milo@example.com');
    type('password', 'correct horse');
    type('confirm', 'correct horse');
    rerender(
      <TestForm
        serverError={
          new ApiError(400, 'VALIDATION_FAILED', [
            { field: 'name', code: 'too_big' },
          ])
        }
      />,
    );
    expect(errorOf('name')).not.toBe('');

    rerender(<TestForm serverError={null} />);
    submit();

    expect(errorOf('name')).toBe('');
  });
});
