import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { i18n } from '../i18n/config';
import { LoginPage } from '../features/auth/pages/login-page';
import { AppShell } from './app-shell';

vi.mock('../features/auth/api/get-current-user', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../features/auth/api/get-current-user')
  >()),
  getCurrentUser: vi.fn().mockResolvedValue(null),
}));

const renderShell = () => {
  const router = createMemoryRouter(
    [
      {
        path: '/login',
        element: (
          <AppShell>
            <LoginPage />
          </AppShell>
        ),
      },
    ],
    { initialEntries: ['/login'] },
  );

  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
};

describe('LanguageSelect', () => {
  afterEach(async () => {
    await act(() => i18n.changeLanguage('en'));
    localStorage.clear();
  });

  it('switches the interface language and remembers it', async () => {
    renderShell();

    expect(
      await screen.findByRole('link', { name: 'Pet Adoption' }),
    ).toBeTruthy();

    fireEvent.change(screen.getByRole('combobox', { name: 'Language' }), {
      target: { value: 'sr' },
    });

    expect(
      await screen.findByRole('link', { name: 'Udomljavanje ljubimaca' }),
    ).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Jezik' })).toBeTruthy();
    expect(localStorage.getItem('language')).toBe('sr');
    expect(document.documentElement.lang).toBe('sr');
  });

  it('re-translates validation messages already on screen', async () => {
    renderShell();

    fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Email is required.')).toBeTruthy();

    fireEvent.change(screen.getByRole('combobox', { name: 'Language' }), {
      target: { value: 'sr' },
    });

    expect(await screen.findByText('Email je obavezan.')).toBeTruthy();
  });
});

describe('stored language', () => {
  afterEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it.each([
    ['sr', 'sr'],
    ['de', 'en'],
    [null, 'en'],
  ])('starts in the saved language %s → %s', async (stored, expected) => {
    if (stored) {
      localStorage.setItem('language', stored);
    }

    vi.resetModules();
    const { i18n: fresh } = await import('../i18n/config');

    expect(fresh.language).toBe(expected);
  });
});
