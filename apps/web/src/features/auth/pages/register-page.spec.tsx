import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@pet-adoption/models';

import '../../../i18n/config';
import { getCurrentUser } from '../api/get-current-user';
import { register } from '../api/register';
import { RegisterPage } from './register-page';

vi.mock('../api/register', () => ({ register: vi.fn() }));

vi.mock('../api/get-current-user', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/get-current-user')>()),
  getCurrentUser: vi.fn().mockResolvedValue(null),
}));

const user: User = {
  _id: 'user-1',
  email: 'milo@example.com',
  name: 'Milo Owner',
  role: 'user',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const renderRegisterPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      { path: '/register', element: <RegisterPage /> },
      { path: '/pets', element: <p>Pet list</p> },
    ],
    { initialEntries: ['/register'] },
  );

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return router;
};

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const fillForm = (password: string, confirmPassword: string) => {
  type('Name', user.name);
  type('Email', user.email);
  type('Password', password);
  type('Confirm password', confirmPassword);
};

const submit = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.mocked(register).mockReset();
  });

  it('sends a signed-in user to the pet list without showing the form', async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(user);
    const router = renderRegisterPage();

    // Nothing is shown while the session is checked.
    expect(screen.queryByLabelText('Email')).toBeNull();

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/pets');
    });
    expect(screen.queryByLabelText('Email')).toBeNull();
  });

  it('marks every field as required and explains the password rule', async () => {
    renderRegisterPage();
    await screen.findByLabelText('Confirm password');

    expect(screen.getByText('Fields marked * are required.')).toBeTruthy();
    for (const label of ['Name', 'Email', 'Password', 'Confirm password']) {
      expect((screen.getByLabelText(label) as HTMLInputElement).required).toBe(
        true,
      );
    }
    const hint = screen.getByText('At least 8 characters.');
    expect(
      screen.getByLabelText('Password').getAttribute('aria-describedby'),
    ).toBe(hint.id);
  });

  it('asks for the confirmation on an empty form', async () => {
    renderRegisterPage();
    await screen.findByLabelText('Confirm password');

    submit();

    expect(await screen.findByText('Confirm your password.')).toBeTruthy();
    expect(screen.getByText('Name is required.')).toBeTruthy();
    expect(register).not.toHaveBeenCalled();
  });

  it('keeps the submit button enabled on an empty form and focuses the first invalid field', async () => {
    renderRegisterPage();
    await screen.findByLabelText('Confirm password');
    const button = screen.getByRole('button', { name: 'Create account' });

    expect((button as HTMLButtonElement).disabled).toBe(false);
    // No errors before the first attempt, even after leaving a field.
    fireEvent.focusOut(screen.getByLabelText('Name'));
    expect(screen.queryByText('Name is required.')).toBeNull();

    submit();

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText('Name'));
    });
  });

  it('shows a new mismatch when the password field is left, not while typing', async () => {
    renderRegisterPage();
    await screen.findByLabelText('Confirm password');

    fillForm('correct horse', 'correct horse');
    type('Name', '');
    submit();
    await screen.findByText('Name is required.');

    type('Password', 'correct horse battery');
    expect(screen.queryByText('Passwords do not match.')).toBeNull();

    fireEvent.focusOut(screen.getByLabelText('Password'));
    expect(screen.getByText('Passwords do not match.')).toBeTruthy();
  });

  it('blocks submission when the passwords do not match', async () => {
    renderRegisterPage();
    await screen.findByLabelText('Confirm password');

    fillForm('correct horse', 'correct hors');
    submit();

    const message = await screen.findByText('Passwords do not match.');
    const confirmInput = screen.getByLabelText('Confirm password');
    expect(confirmInput.getAttribute('aria-invalid')).toBe('true');
    expect(confirmInput.getAttribute('aria-describedby')).toBe(message.id);
    expect(register).not.toHaveBeenCalled();
  });

  it('reports a mismatch even when another field is invalid', async () => {
    renderRegisterPage();
    await screen.findByLabelText('Confirm password');

    type('Password', 'correct horse');
    type('Confirm password', 'something else');
    submit();

    expect(await screen.findByText('Passwords do not match.')).toBeTruthy();
    expect(screen.getByText('Name is required.')).toBeTruthy();
    expect(register).not.toHaveBeenCalled();
  });

  it('clears the mismatch message when the password is edited', async () => {
    renderRegisterPage();
    await screen.findByLabelText('Confirm password');

    fillForm('correct horse', 'correct hors');
    submit();
    await screen.findByText('Passwords do not match.');

    type('Password', 'correct hors');

    expect(screen.queryByText('Passwords do not match.')).toBeNull();
  });

  it('registers with matching passwords and sends only the API fields', async () => {
    vi.mocked(register).mockResolvedValue(user);
    const router = renderRegisterPage();
    await screen.findByLabelText('Confirm password');

    fillForm('correct horse', 'correct horse');
    submit();

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/pets');
    });
    expect(register).toHaveBeenCalledTimes(1);
    // The confirmation is compared in the browser and never sent.
    expect(vi.mocked(register).mock.calls[0][0]).toEqual({
      name: user.name,
      email: user.email,
      password: 'correct horse',
    });
  });
});
