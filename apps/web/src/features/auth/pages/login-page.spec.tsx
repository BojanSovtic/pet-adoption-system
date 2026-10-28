import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@pet-adoption/models';

import '../../../i18n/config';
import { ApiError } from '../../../lib/api-client';
import { currentUserQueryKey, getCurrentUser } from '../api/get-current-user';
import { login } from '../api/login';
import { LoginPage } from './login-page';

vi.mock('../api/login', () => ({ login: vi.fn() }));

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

const renderLoginPage = (from?: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      { path: '/login', element: <LoginPage /> },
      { path: '/pets', element: <p>Pet list</p> },
      { path: '/pets/new', element: <p>New pet form</p> },
    ],
    { initialEntries: [{ pathname: '/login', state: from ? { from } : null }] },
  );

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return { queryClient, router };
};

const fillAndSubmit = async (email: string, password: string) => {
  // The form appears once the session check has finished.
  await screen.findByLabelText('Email');
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
};

describe('LoginPage', () => {
  beforeEach(() => {
    vi.mocked(login).mockReset();
  });

  it('sends a signed-in user on without showing the form', async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(user);
    const { router } = renderLoginPage();

    // Nothing is shown while the session is checked.
    expect(screen.queryByLabelText('Email')).toBeNull();

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/pets');
    });
    expect(screen.queryByLabelText('Email')).toBeNull();
  });

  it('validates the form before sending a request', async () => {
    renderLoginPage();

    await fillAndSubmit('not-an-email', '');

    expect(
      await screen.findByText('Enter a valid email address.'),
    ).toBeTruthy();
    expect(screen.getByText('Password is required.')).toBeTruthy();
    expect(login).not.toHaveBeenCalled();
  });

  it('shows an inline message for wrong credentials', async () => {
    vi.mocked(login).mockRejectedValue(
      new ApiError(401, 'INVALID_CREDENTIALS'),
    );
    renderLoginPage();

    await fillAndSubmit('milo@example.com', 'wrong password');

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Incorrect email or password.',
    );
  });

  it('shows server field errors on their field, focuses it and clears it only when that field is edited', async () => {
    vi.mocked(login).mockRejectedValue(
      new ApiError(400, 'VALIDATION_FAILED', [
        { field: 'email', code: 'invalid_format' },
      ]),
    );
    renderLoginPage();

    await fillAndSubmit('milo@example.com', 'correct horse battery');

    const email = screen.getByLabelText('Email');
    expect(
      await screen.findByText('This value has an invalid format.'),
    ).toBeTruthy();
    expect(email.getAttribute('aria-invalid')).toBe('true');
    await waitFor(() => expect(document.activeElement).toBe(email));

    // Editing another field keeps the email's message.
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'another password' },
    });
    expect(screen.getByText('This value has an invalid format.')).toBeTruthy();

    fireEvent.change(email, { target: { value: 'milo@example.org' } });
    expect(screen.queryByText('This value has an invalid format.')).toBeNull();
  });

  it('disables the submit button only while signing in', async () => {
    // Never settles, so the request stays in progress.
    vi.mocked(login).mockReturnValue(new Promise(() => undefined));
    renderLoginPage();
    await screen.findByLabelText('Email');
    const button = () =>
      screen.getByRole('button', {
        name: /Sign(ing)? in/,
      }) as HTMLButtonElement;

    // Enabled on the empty, invalid form.
    expect(button().disabled).toBe(false);

    await fillAndSubmit('milo@example.com', 'correct horse battery');

    await waitFor(() => expect(button().disabled).toBe(true));
    fireEvent.click(button());
    expect(login).toHaveBeenCalledTimes(1);
  });

  it('stores the user and navigates to the pet list on success', async () => {
    vi.mocked(login).mockResolvedValue(user);
    const { queryClient, router } = renderLoginPage();

    await fillAndSubmit('  milo@example.com ', 'correct horse battery');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/pets');
    });
    expect(login).toHaveBeenCalledWith({
      email: 'milo@example.com',
      password: 'correct horse battery',
    });
    expect(queryClient.getQueryData(currentUserQueryKey)).toEqual(user);
  });

  it('returns to the page that required sign-in', async () => {
    vi.mocked(login).mockResolvedValue(user);
    const { router } = renderLoginPage('/pets/new');

    await fillAndSubmit('milo@example.com', 'correct horse battery');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/pets/new');
    });
  });

  it('ignores a return path that leaves the app', async () => {
    vi.mocked(login).mockResolvedValue(user);
    const { router } = renderLoginPage('//evil.example');

    await fillAndSubmit('milo@example.com', 'correct horse battery');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/pets');
    });
  });

  it('ignores a return path that uses a backslash to leave the app', async () => {
    vi.mocked(login).mockResolvedValue(user);
    const { router } = renderLoginPage('/\\evil.example');

    await fillAndSubmit('milo@example.com', 'correct horse battery');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/pets');
    });
  });
});
