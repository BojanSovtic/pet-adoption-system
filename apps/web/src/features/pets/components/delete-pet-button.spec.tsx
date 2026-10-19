import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pet } from '@pet-adoption/models';

import '../../../i18n/config';
import { deletePet } from '../api/delete-pet';
import { DeletePetButton } from './delete-pet-button';

vi.mock('../api/delete-pet', () => ({
  deletePet: vi.fn(),
}));

const pet: Pet = {
  _id: 'pet-1',
  name: 'Milo',
  species: 'dog',
  age: 3,
  description: 'A friendly dog.',
  status: 'available',
  imageUrls: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const otherPet: Pet = { ...pet, _id: 'pet-2', name: 'Luna' };

const renderButton = () => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });

  queryClient.setQueryData(['pets'], [pet, otherPet]);
  queryClient.setQueryData(['pets', pet._id], pet);

  const router = createMemoryRouter(
    [
      { path: '/pets', element: <p>Pet list</p> },
      { path: '/pets/:id', element: <DeletePetButton pet={pet} /> },
    ],
    { initialEntries: ['/pets', `/pets/${pet._id}`], initialIndex: 1 },
  );

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return { queryClient, router };
};

describe('DeletePetButton', () => {
  beforeEach(() => {
    vi.mocked(deletePet).mockReset();
  });

  it('asks for confirmation and can be cancelled', () => {
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(
      screen.getByText('Delete Milo? This cannot be undone.'),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(
      screen.queryByText('Delete Milo? This cannot be undone.'),
    ).toBeNull();
    expect(deletePet).not.toHaveBeenCalled();
  });

  it('deletes the pet, updates the cache and navigates to the list', async () => {
    vi.mocked(deletePet).mockResolvedValue(undefined);
    const { queryClient, router } = renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/pets');
    });

    expect(deletePet).toHaveBeenCalledWith(pet._id);
    expect(queryClient.getQueryData(['pets'])).toEqual([otherPet]);
    expect(queryClient.getQueryData(['pets', pet._id])).toBeUndefined();
    expect(screen.getByText('Pet list')).toBeTruthy();
  });

  it('stays on the page when deletion fails', async () => {
    vi.mocked(deletePet).mockRejectedValue(new Error('boom'));
    const { queryClient, router } = renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
    });

    expect(router.state.location.pathname).toBe(`/pets/${pet._id}`);
    expect(queryClient.getQueryData(['pets'])).toEqual([pet, otherPet]);
  });
});
