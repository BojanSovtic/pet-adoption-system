import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PET_PROFILE,
  type Paginated,
  type Pet,
  type User,
} from '@pet-adoption/models';

import '../../../i18n/config';
import { getCurrentUser } from '../../auth/api/get-current-user';
import { getPets } from '../api/get-pets';
import { PetsPage } from './pets-page';

vi.mock('../api/get-pets', () => ({ getPets: vi.fn() }));

vi.mock('../../auth/api/get-current-user', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../auth/api/get-current-user')>()),
  getCurrentUser: vi.fn(),
}));

const owner: User = {
  _id: 'owner-1',
  email: 'owner@example.com',
  name: 'Owner',
  role: 'user',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const makePet = (index: number): Pet => ({
  _id: `pet-${index}`,
  owner: 'owner-1',
  name: `Pet ${index}`,
  species: 'dog',
  age: 2,
  description: 'A pet.',
  status: 'available',
  ...DEFAULT_PET_PROFILE,
  hidden: false,
  imageUrl: null,
  images: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const page = (overrides: Partial<Paginated<Pet>> = {}): Paginated<Pet> => ({
  items: [makePet(1), makePet(2)],
  page: 1,
  pageSize: 12,
  totalItems: 2,
  totalPages: 1,
  ...overrides,
});

const renderPage = (url = '/pets') => {
  const router = createMemoryRouter(
    [
      { path: '/pets', element: <PetsPage /> },
      { path: '/pets/new', element: <p>New pet</p> },
      { path: '/pets/:id', element: <p>Pet details</p> },
    ],
    { initialEntries: [url] },
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

const lastQuery = () => vi.mocked(getPets).mock.lastCall?.[0];

describe('PetsPage', () => {
  beforeEach(() => {
    vi.mocked(getPets).mockReset();
    vi.mocked(getPets).mockResolvedValue(page());
    vi.mocked(getCurrentUser).mockReset();
    vi.mocked(getCurrentUser).mockResolvedValue(null);
  });

  describe('"Your pet" indicator', () => {
    // makePet(1) and makePet(2) belong to owner-1; this one to someone else.
    const mixedPage = () =>
      page({
        items: [makePet(1), { ...makePet(2), owner: 'other-1' }],
      });

    it("marks only the signed-in user's pets", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(owner);
      vi.mocked(getPets).mockResolvedValue(mixedPage());
      renderPage();

      const own = (await screen.findByText('Pet 1')).closest('li');
      await waitFor(() => {
        expect(own?.textContent).toContain('Your pet');
      });
      const other = screen.getByText('Pet 2').closest('li');
      expect(other?.textContent).not.toContain('Your pet');
      expect(screen.getAllByText('Your pet')).toHaveLength(1);
    });

    it('marks nothing for a signed-out visitor', async () => {
      vi.mocked(getPets).mockResolvedValue(mixedPage());
      renderPage();

      await screen.findByText('Pet 1');
      await waitFor(() => expect(getCurrentUser).toHaveBeenCalled());
      expect(screen.queryByText('Your pet')).toBeNull();
    });

    it('marks nothing while the session is still loading', async () => {
      vi.mocked(getCurrentUser).mockReturnValue(new Promise(() => undefined));
      vi.mocked(getPets).mockResolvedValue(mixedPage());
      renderPage();

      await screen.findByText('Pet 1');
      expect(screen.queryByText('Your pet')).toBeNull();
    });
  });

  it('requests the page described by the URL', async () => {
    renderPage('/pets?species=cat&status=pending&sort=name&page=2');

    await waitFor(() => {
      expect(lastQuery()).toEqual({
        search: undefined,
        species: 'cat',
        status: 'pending',
        sort: 'name',
        page: 2,
        pageSize: 12,
      });
    });
  });

  it('shows results, the count and no paging for a single page', async () => {
    renderPage();

    expect(await screen.findByText('Pet 1')).toBeTruthy();
    expect(screen.getByText('2 pets found')).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).toBeNull();
  });

  it('shows sex and only the confirmed "good with" answers on cards', async () => {
    vi.mocked(getPets).mockResolvedValue(
      page({
        items: [
          {
            ...makePet(1),
            species: 'rabbit',
            sex: 'female',
            compatibility: { children: 'yes', dogs: 'no', cats: 'unknown' },
          },
        ],
        totalItems: 1,
      }),
    );
    renderPage();

    expect(await screen.findByText('Rabbit · Female · 2 years')).toBeTruthy();
    expect(screen.getByText('Good with children')).toBeTruthy();
    expect(screen.queryByText('Good with dogs')).toBeNull();
    expect(screen.queryByText('Good with cats')).toBeNull();
  });

  it('resets to page 1 when a filter changes', async () => {
    const router = renderPage('/pets?page=3');
    await screen.findByText('Pet 1');

    fireEvent.change(
      screen.getByRole('combobox', { name: 'Filter by species' }),
      {
        target: { value: 'cat' },
      },
    );

    await waitFor(() => {
      expect(lastQuery()).toMatchObject({ species: 'cat', page: 1 });
    });
    expect(router.state.location.search).toBe('?species=cat');
  });

  it('waits for the user to stop typing before searching', async () => {
    const router = renderPage('/pets?page=2');
    await screen.findByText('Pet 1');
    const callsBefore = vi.mocked(getPets).mock.calls.length;

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'm' } });
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'mil' },
    });

    // Nothing is requested while typing.
    expect(vi.mocked(getPets).mock.calls.length).toBe(callsBefore);

    await waitFor(() => {
      expect(lastQuery()).toMatchObject({ search: 'mil', page: 1 });
    });
    expect(
      vi.mocked(getPets).mock.calls.filter(([query]) => query.search === 'm'),
    ).toHaveLength(0);
    expect(router.state.location.search).toBe('?search=mil');
  });

  it('moves between pages', async () => {
    vi.mocked(getPets).mockResolvedValue(
      page({ totalItems: 30, totalPages: 3 }),
    );
    const router = renderPage();

    expect(await screen.findByText('Page 1 of 3')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(lastQuery()).toMatchObject({ page: 2 });
    });
    expect(router.state.location.search).toBe('?page=2');
  });

  it('remembers the list state when a pet is opened', async () => {
    vi.mocked(getPets).mockResolvedValue(
      page({ page: 2, totalItems: 30, totalPages: 3 }),
    );
    const router = renderPage('/pets?species=dog&page=2');

    fireEvent.click(await screen.findByRole('link', { name: 'Pet 1' }));

    expect(await screen.findByText('Pet details')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/pets/pet-1');
    expect(router.state.location.state).toEqual({
      petListSearch: '?species=dog&page=2',
    });

    // The browser Back button still returns to the same page.
    await router.navigate(-1);
    expect(await screen.findByText('Page 2 of 3')).toBeTruthy();
    expect(router.state.location.search).toBe('?species=dog&page=2');
  });

  it('distinguishes "no pets yet" from "no matches"', async () => {
    vi.mocked(getPets).mockResolvedValue(
      page({ items: [], totalItems: 0, totalPages: 0 }),
    );

    renderPage();
    expect(
      await screen.findByText('No pets are currently available.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
  });

  it('offers to clear filters when nothing matches', async () => {
    vi.mocked(getPets).mockResolvedValue(
      page({ items: [], totalItems: 0, totalPages: 0 }),
    );
    const router = renderPage('/pets?species=cat&sort=name');

    fireEvent.click(
      await screen.findByRole('button', { name: 'Clear filters' }),
    );

    // Filters are cleared; the chosen sort order is kept.
    await waitFor(() => {
      expect(router.state.location.search).toBe('?sort=name');
    });
  });

  it('shows API errors', async () => {
    const { ApiError } = await import('../../../lib/api-client');
    vi.mocked(getPets).mockRejectedValue(new ApiError(0, 'NETWORK_ERROR'));

    renderPage();

    expect(
      await screen.findByText(
        'The server could not be reached. Check your connection and try again.',
      ),
    ).toBeTruthy();
  });
});
