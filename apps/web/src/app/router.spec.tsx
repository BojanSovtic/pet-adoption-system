import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { User } from '@pet-adoption/models';

import '../i18n/config';
import { getCurrentUser } from '../features/auth/api/get-current-user';
import { pageOf } from '../lib/testing/page-of';
import { routes } from './router';

vi.mock('../features/auth/api/logout', () => ({
  logout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../features/applications/api/applications', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../features/applications/api/applications')
  >()),
  getMyApplications: vi.fn().mockResolvedValue(pageOf([])),
  getReceivedApplications: vi.fn().mockResolvedValue(pageOf([])),
}));

const user: User = {
  _id: 'user-1',
  email: 'milo@example.com',
  name: 'Milo Owner',
  role: 'user',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

vi.mock('../features/pets/api/get-pets', () => ({
  getPets: vi.fn().mockResolvedValue({
    items: [],
    page: 1,
    pageSize: 12,
    totalItems: 0,
    totalPages: 0,
  }),
}));

vi.mock('../features/auth/api/get-current-user', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../features/auth/api/get-current-user')
  >()),
  getCurrentUser: vi.fn().mockResolvedValue(null),
}));

const renderAt = (path: string) => {
  const router = createMemoryRouter(routes, { initialEntries: [path] });

  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return router;
};

describe('routes', () => {
  it('redirects / to the pet list', async () => {
    const router = renderAt('/');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/pets');
    });
    expect(await screen.findByRole('heading', { name: 'Pets' })).toBeTruthy();
  });

  it('shows the not-found page for unknown routes', () => {
    renderAt('/does-not-exist');

    expect(
      screen.getByRole('heading', { name: 'Page not found' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Back to pets' }).getAttribute('href'),
    ).toBe('/pets');
  });

  it.each([
    ['leaves a signed-in-only page for sign-in', '/applications', '/login'],
    ['stays on a public page', '/pets', '/pets'],
  ])('signing out %s', async (_case, path, expected) => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(user);
    const router = renderAt(path);

    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('link', { name: 'Register' })).toBeTruthy();
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(expected);
    });
  });
});
