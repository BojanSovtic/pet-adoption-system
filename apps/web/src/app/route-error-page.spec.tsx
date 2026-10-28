import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '../i18n/config';
import { reloadPage } from '@/lib/reload-page';
import { routes } from './router';

const SECRET = 'db password is hunter2';

// Stand-ins for one page and one shell component that throw on demand.
const failing = vi.hoisted(() => ({ page: false, shell: false }));

vi.mock('../features/pets/pages/pet-form-page', () => ({
  PetFormPage: () => {
    if (failing.page) {
      throw new Error(SECRET);
    }

    return <h1>Pet form</h1>;
  },
}));

vi.mock('../features/auth/components/user-menu', () => ({
  UserMenu: () => {
    if (failing.shell) {
      throw new Error(SECRET);
    }

    return null;
  },
}));

vi.mock('@/lib/reload-page', () => ({ reloadPage: vi.fn() }));

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

const expectNoErrorDetails = () => {
  const text = document.body.textContent ?? '';

  expect(text).not.toContain(SECRET);
  expect(text).not.toContain('Error:');
  expect(text).not.toMatch(/\.tsx?:\d+/);
  expect(document.querySelector('pre')).toBeNull();
};

describe('route error boundary', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    failing.page = false;
    failing.shell = false;
    vi.mocked(reloadPage).mockClear();
    // React and React Router log caught render errors; keep the output clean.
    consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('renders the page normally when nothing throws', () => {
    renderAt('/pets/new');

    expect(screen.getByRole('heading', { name: 'Pet form' })).toBeTruthy();
    expect(screen.queryByText('Something went wrong')).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('shows the error page inside the app shell when a page throws', () => {
    failing.page = true;
    renderAt('/pets/new');

    expect(screen.getByRole('alert').textContent).toContain(
      'Something went wrong',
    );
    // The header is still there, so the user can keep navigating.
    expect(screen.getByRole('link', { name: 'Pet Adoption' })).toBeTruthy();
    expect(screen.getByRole('main').id).toBe('main-content');
    expectNoErrorDetails();
    // The error is logged for diagnostics, just not shown.
    expect(consoleError).toHaveBeenCalled();
  });

  it('reloads the page from the error page', () => {
    failing.page = true;
    renderAt('/pets/new');

    fireEvent.click(screen.getByRole('button', { name: 'Reload page' }));

    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('recovers by navigating back to the pet list', async () => {
    failing.page = true;
    const router = renderAt('/pets/new');

    fireEvent.click(screen.getByRole('link', { name: 'Back to pets' }));

    expect(await screen.findByRole('heading', { name: 'Pets' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/pets');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a full-page error when the app shell itself throws', () => {
    failing.shell = true;
    renderAt('/pets/new');

    expect(screen.getByRole('alert').textContent).toContain(
      'Something went wrong',
    );
    expect(screen.queryByRole('link', { name: 'Pet Adoption' })).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Back to pets' }).getAttribute('href'),
    ).toBe('/pets');
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeTruthy();
    expectNoErrorDetails();
  });
});
