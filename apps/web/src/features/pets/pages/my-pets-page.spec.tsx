import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PET_PROFILE, type Pet, type User } from '@pet-adoption/models';

import '../../../i18n/config';
import { ApiError } from '../../../lib/api-client';
import { pageOf } from '../../../lib/testing/page-of';
import { getCurrentUser } from '../../auth/api/get-current-user';
import { deletePet } from '../api/delete-pet';
import { getMyPets } from '../api/get-my-pets';
import { MyPetsPage } from './my-pets-page';

vi.mock('../api/get-my-pets', () => ({ getMyPets: vi.fn() }));
vi.mock('../api/delete-pet', () => ({ deletePet: vi.fn() }));

vi.mock('../../auth/api/get-current-user', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../auth/api/get-current-user')>()),
  getCurrentUser: vi.fn(),
}));

const owner: User = {
  _id: 'owner-1',
  email: 'ana@example.com',
  name: 'Ana',
  role: 'user',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const makePet = (id: string, name: string, extra: Partial<Pet> = {}): Pet => ({
  _id: id,
  owner: owner._id,
  name,
  species: 'dog',
  age: 3,
  description: 'A friendly dog.',
  status: 'available',
  ...DEFAULT_PET_PROFILE,
  hidden: false,
  imageUrl: null,
  images: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});

const renderPage = (user: User | null) => {
  vi.mocked(getCurrentUser).mockResolvedValue(user);

  const router = createMemoryRouter(
    [
      { path: '/my-pets', element: <MyPetsPage /> },
      { path: '/login', element: <p>Login page</p> },
      { path: '/pets', element: <p>Pet list</p> },
    ],
    { initialEntries: ['/my-pets'] },
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

const itemOf = (name: string) =>
  screen.getByRole('link', { name }).closest('li') as HTMLElement;

describe('MyPetsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends signed-out visitors to the login page without loading pets', async () => {
    renderPage(null);

    expect(await screen.findByText('Login page')).toBeTruthy();
    expect(getMyPets).not.toHaveBeenCalled();
  });

  it('lists the pets the API returns for the session user, with their status and actions', async () => {
    vi.mocked(getMyPets).mockResolvedValue(
      pageOf([
        makePet('pet-1', 'Milo'),
        makePet('pet-2', 'Luna', { status: 'adopted', hidden: true }),
      ]),
    );
    renderPage(owner);

    expect(await screen.findByRole('link', { name: 'Milo' })).toBeTruthy();
    // No user id is sent: the API uses the session.
    expect(getMyPets).toHaveBeenCalledWith({ page: 1 });
    expect(screen.getByText('2 pets')).toBeTruthy();

    const milo = itemOf('Milo');
    expect(within(milo).getByText('Available')).toBeTruthy();
    expect(
      within(milo)
        .getByRole('link', { name: /^Edit\W*Milo$/ })
        .getAttribute('href'),
    ).toBe('/pets/pet-1/edit');

    const luna = itemOf('Luna');
    expect(within(luna).getByText('Adopted')).toBeTruthy();
    expect(
      within(luna).getByText(/Hidden by the site administrators/),
    ).toBeTruthy();
  });

  it('shows an empty state with a way to add the first pet', async () => {
    vi.mocked(getMyPets).mockResolvedValue(pageOf([]));
    renderPage(owner);

    expect(
      await screen.findByText("You haven't added any pets yet"),
    ).toBeTruthy();
    const addLinks = screen.getAllByRole('link', { name: 'Add a pet' });
    expect(addLinks.length).toBeGreaterThan(0);
    for (const link of addLinks) {
      expect(link.getAttribute('href')).toBe('/pets/new');
    }
  });

  it('shows an error with a retry button', async () => {
    vi.mocked(getMyPets)
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR'))
      .mockResolvedValue(pageOf([]));
    renderPage(owner);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'The server could not be reached.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByText("You haven't added any pets yet"),
    ).toBeTruthy();
  });

  it('disables Delete for pets with open or accepted applications and says why', async () => {
    vi.mocked(getMyPets).mockResolvedValue(
      pageOf([makePet('pet-1', 'Milo', { status: 'pending' })]),
    );
    renderPage(owner);

    await screen.findByRole('link', { name: 'Milo' });
    const deleteButton = within(itemOf('Milo')).getByRole('button', {
      name: 'Delete',
    }) as HTMLButtonElement;

    expect(deleteButton.disabled).toBe(true);
    expect(
      document.getElementById(
        deleteButton.getAttribute('aria-describedby') ?? '',
      )?.textContent,
    ).toBe(
      "Can't be deleted while applications are waiting for your decision.",
    );
  });

  it('deletes a pet after confirmation and stays on the page', async () => {
    vi.mocked(getMyPets)
      .mockResolvedValueOnce(pageOf([makePet('pet-1', 'Milo')]))
      .mockResolvedValue(pageOf([]));
    vi.mocked(deletePet).mockResolvedValue(undefined);
    const router = renderPage(owner);

    await screen.findByRole('link', { name: 'Milo' });
    fireEvent.click(
      within(itemOf('Milo')).getByRole('button', { name: 'Delete' }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, delete' }));

    await waitFor(() => expect(deletePet).toHaveBeenCalledWith('pet-1'));
    expect(
      await screen.findByText("You haven't added any pets yet"),
    ).toBeTruthy();
    expect(router.state.location.pathname).toBe('/my-pets');
  });
});
