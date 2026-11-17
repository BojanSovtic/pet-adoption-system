import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@pet-adoption/models';

import '../../../i18n/config';
import { getCurrentUser } from '../api/get-current-user';
import { logout } from '../api/logout';
import { UserMenu } from './user-menu';

vi.mock('../api/logout', () => ({ logout: vi.fn() }));

vi.mock('../api/get-current-user', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/get-current-user')>()),
  getCurrentUser: vi.fn(),
}));

const user: User = {
  _id: 'user-1',
  email: 'ana@example.com',
  name: 'Ana',
  role: 'user',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

// The menu in a layout, so it stays mounted while pages change.
const renderMenu = (currentUser: User | null) => {
  vi.mocked(getCurrentUser).mockResolvedValue(currentUser);

  const page = (name: string) => <p>{name}</p>;
  const router = createMemoryRouter(
    [
      {
        element: (
          <>
            <UserMenu />
            <button type="button">Outside</button>
            <Outlet />
          </>
        ),
        children: [
          { path: '/pets', element: page('Pets page') },
          { path: '/my-pets', element: page('My pets page') },
          { path: '/pets/new', element: page('Add pet page') },
        ],
      },
    ],
    { initialEntries: ['/pets'] },
  );

  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return router;
};

const openMenu = async () => {
  const button = await screen.findByRole('button', { name: /Account menu/ });
  fireEvent.click(button);
  return button;
};

describe('UserMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps sign-in and registration for signed-out visitors', async () => {
    renderMenu(null);

    expect(await screen.findByRole('link', { name: 'Sign in' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Register' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Account menu/ })).toBeNull();
  });

  it('shows the account links when opened', async () => {
    renderMenu(user);

    const button = await screen.findByRole('button', {
      name: 'Account menu: Ana',
    });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('link', { name: 'My pets' })).toBeNull();

    fireEvent.click(button);

    expect(button.getAttribute('aria-expanded')).toBe('true');
    const hrefs = Object.fromEntries(
      ['My pets', 'Add a pet', 'Applications', 'Messages', 'My profile'].map(
        (name) => [
          name,
          screen.getByRole('link', { name }).getAttribute('href'),
        ],
      ),
    );
    expect(hrefs).toEqual({
      'My pets': '/my-pets',
      'Add a pet': '/pets/new',
      Applications: '/applications',
      Messages: '/messages',
      'My profile': '/users/user-1',
    });
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
  });

  it.each([
    ['My pets', '/my-pets', 'My pets page'],
    ['Add a pet', '/pets/new', 'Add pet page'],
  ])('navigates to %s and closes', async (name, path, pageText) => {
    const router = renderMenu(user);
    const button = await openMenu();

    fireEvent.click(screen.getByRole('link', { name }));

    expect(await screen.findByText(pageText)).toBeTruthy();
    expect(router.state.location.pathname).toBe(path);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('link', { name })).toBeNull();
  });

  it('closes on Escape and returns focus to the button', async () => {
    renderMenu(user);
    const button = await openMenu();
    screen.getByRole('link', { name: 'My pets' }).focus();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
  });

  it('closes on a click outside', async () => {
    renderMenu(user);
    const button = await openMenu();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }));

    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('signs out and goes back to the signed-out links', async () => {
    vi.mocked(logout).mockResolvedValue(undefined);
    renderMenu(user);
    await openMenu();

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(logout).toHaveBeenCalled());
    expect(await screen.findByRole('link', { name: 'Sign in' })).toBeTruthy();
  });

  it('shows the Admin link to admins', async () => {
    renderMenu({ ...user, role: 'admin' });
    await openMenu();

    expect(
      screen.getByRole('link', { name: 'Admin' }).getAttribute('href'),
    ).toBe('/admin');
  });
});
