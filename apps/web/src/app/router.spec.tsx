import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import '../i18n/config';
import { routes } from './router';

vi.mock('../features/pets/api/get-pets', () => ({
  getPets: vi.fn().mockResolvedValue([]),
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
});
