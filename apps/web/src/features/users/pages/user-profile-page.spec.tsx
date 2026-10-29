import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PET_PROFILE, type Pet, type User } from '@pet-adoption/models';

import '../../../i18n/config';
import { ApiError } from '../../../lib/api-client';
import { pageOf } from '../../../lib/testing/page-of';
import { getCurrentUser } from '../../auth/api/get-current-user';
import { getUserPets, getUserProfile } from '../api/users';
import { UserProfilePage } from './user-profile-page';

vi.mock('../api/users', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/users')>()),
  getUserProfile: vi.fn(),
  getUserPets: vi.fn(),
}));

vi.mock('../../auth/api/get-current-user', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../auth/api/get-current-user')>()),
  getCurrentUser: vi.fn(),
}));

const viewer: User = {
  _id: 'viewer-1',
  email: 'viewer@example.com',
  name: 'Marko',
  role: 'user',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const pet: Pet = {
  _id: 'pet-1',
  owner: 'owner-1',
  name: 'Milo',
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
};

const renderProfile = (user: User | null, id = 'owner-1') => {
  vi.mocked(getCurrentUser).mockResolvedValue(user);

  const router = createMemoryRouter(
    [
      { path: '/users/:id', element: <UserProfilePage /> },
      { path: '/login', element: <p>Login page</p> },
    ],
    { initialEntries: [`/users/${id}`] },
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
};

describe('UserProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserProfile).mockResolvedValue({
      _id: 'owner-1',
      name: 'Ana',
      memberSince: '2026-01-01T00:00:00.000Z',
    });
    vi.mocked(getUserPets).mockResolvedValue(pageOf([pet]));
  });

  it('shows the name, member-since date and listed pets', async () => {
    renderProfile(viewer);

    expect(await screen.findByRole('heading', { name: 'Ana' })).toBeTruthy();
    expect(screen.getByText(/Member since/)).toBeTruthy();
    const petLink = await screen.findByRole('link', { name: 'Milo' });
    expect(petLink.getAttribute('href')).toBe('/pets/pet-1');
    expect(screen.queryByText(/Your pet/)).toBeNull();
    expect(screen.queryByText(/This is how other members/)).toBeNull();
  });

  it('explains that the own profile is what others see', async () => {
    vi.mocked(getUserProfile).mockResolvedValue({
      _id: viewer._id,
      name: viewer.name,
      memberSince: viewer.createdAt,
    });
    renderProfile(viewer, viewer._id);

    expect(
      await screen.findByText(/This is how other members see your profile/),
    ).toBeTruthy();
  });

  it('shows an empty state when no pets are listed', async () => {
    vi.mocked(getUserPets).mockResolvedValue(pageOf([]));
    renderProfile(viewer);

    expect(
      await screen.findByText('Ana has no pets listed for adoption right now.'),
    ).toBeTruthy();
  });

  it('shows "not found" for an unknown user', async () => {
    vi.mocked(getUserProfile).mockRejectedValue(
      new ApiError(404, 'USER_NOT_FOUND'),
    );
    renderProfile(viewer);

    expect(
      await screen.findByRole('heading', { name: 'Profile not found' }),
    ).toBeTruthy();
  });

  it('sends signed-out visitors to the login page', async () => {
    renderProfile(null);

    expect(await screen.findByText('Login page')).toBeTruthy();
    expect(getUserProfile).not.toHaveBeenCalled();
  });
});
