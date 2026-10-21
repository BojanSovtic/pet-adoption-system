import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pet, User } from '@pet-adoption/models';

import '../../../i18n/config';
import { ApiError } from '../../../lib/api-client';
import { pageOf } from '../../../lib/testing/page-of';
import { getCurrentUser } from '../../auth/api/get-current-user';
import { getPet } from '../api/get-pet';
import { PetDetailsPage } from './pet-details-page';
import { PetFormPage } from './pet-form-page';

vi.mock('../api/get-pet', () => ({ getPet: vi.fn() }));

// The details page includes the adoption section, which loads applications.
vi.mock('../../applications/api/applications', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../applications/api/applications')
  >()),
  getMyApplications: vi.fn().mockResolvedValue(pageOf([])),
}));

vi.mock('../../auth/api/get-current-user', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../auth/api/get-current-user')>()),
  getCurrentUser: vi.fn(),
}));

const makeUser = (id: string): User => ({
  _id: id,
  email: `${id}@example.com`,
  name: id,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const owner = makeUser('owner-1');
const otherUser = makeUser('other-1');

const pet: Pet = {
  _id: 'pet-1',
  owner: owner._id,
  name: 'Milo',
  species: 'dog',
  age: 3,
  description: 'A friendly dog.',
  status: 'available',
  imageUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const renderAt = (path: string, user: User | null) => {
  vi.mocked(getCurrentUser).mockResolvedValue(user);

  const router = createMemoryRouter(
    [
      { path: '/pets/:id', element: <PetDetailsPage /> },
      { path: '/pets/:id/edit', element: <PetFormPage /> },
      { path: '/pets/new', element: <PetFormPage /> },
      { path: '/login', element: <p>Login page</p> },
    ],
    { initialEntries: [path] },
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

describe('PetDetailsPage', () => {
  beforeEach(() => {
    vi.mocked(getPet).mockResolvedValue(pet);
  });

  it('shows edit and delete to the owner', async () => {
    renderAt('/pets/pet-1', owner);

    expect(await screen.findByRole('link', { name: 'Edit pet' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
  });

  it.each([
    ['another user', otherUser],
    ['a signed-out visitor', null],
  ])('hides edit and delete from %s', async (_label, user) => {
    renderAt('/pets/pet-1', user);

    expect(await screen.findByRole('heading', { name: 'Milo' })).toBeTruthy();
    // Wait for the current-user query too, then check nothing appeared.
    await waitFor(() => expect(getCurrentUser).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: 'Edit pet' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });
});

describe('PetFormPage', () => {
  beforeEach(() => {
    vi.mocked(getPet).mockResolvedValue(pet);
  });

  it('sends signed-out visitors to the login page and remembers where they were', async () => {
    const router = renderAt('/pets/new', null);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login');
    });
    expect(router.state.location.state).toEqual({ from: '/pets/new' });
  });

  it("refuses to edit another user's pet", async () => {
    renderAt('/pets/pet-1/edit', otherUser);

    expect(
      await screen.findByText('You can only edit pets you posted.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
  });

  it('shows the form to the owner', async () => {
    renderAt('/pets/pet-1/edit', owner);

    expect(
      await screen.findByRole('button', { name: 'Save changes' }),
    ).toBeTruthy();
  });

  it.each([
    ['a missing pet', new ApiError(404, 'PET_NOT_FOUND')],
    ['an invalid id', new ApiError(400, 'INVALID_PET_ID')],
  ])('says "Pet not found" for %s, without a retry', async (_case, error) => {
    vi.mocked(getPet).mockRejectedValue(error);
    renderAt('/pets/pet-1/edit', owner);

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Pet not found',
    );
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to pets' })).toBeTruthy();
  });

  it.each([
    [
      'a network error',
      new ApiError(0, 'NETWORK_ERROR'),
      'The server could not be reached. Check your connection and try again.',
    ],
    [
      'a server error',
      new ApiError(500, 'INTERNAL_SERVER_ERROR'),
      'Something went wrong.',
    ],
    ['an unexpected error', new Error('boom'), 'The pet could not be loaded.'],
  ])('explains %s and offers a retry', async (_case, error, message) => {
    vi.mocked(getPet).mockRejectedValueOnce(error);
    renderAt('/pets/pet-1/edit', owner);

    expect((await screen.findByRole('alert')).textContent).toBe(message);

    // The default mock (a pet) answers the retry.
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(
      await screen.findByRole('button', { name: 'Save changes' }),
    ).toBeTruthy();
  });
});
