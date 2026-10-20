import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pet, User } from '@pet-adoption/models';

import '../../../i18n/config';
import { getCurrentUser } from '../../auth/api/get-current-user';
import { getPet } from '../api/get-pet';
import { PetDetailsPage } from './pet-details-page';
import { PetFormPage } from './pet-form-page';

vi.mock('../api/get-pet', () => ({ getPet: vi.fn() }));

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
  imageUrls: [],
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
});
