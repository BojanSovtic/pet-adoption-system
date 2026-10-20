import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { PET_IMAGE_MAX_BYTES, type Pet, type User } from '@pet-adoption/models';

import '../../../i18n/config';
import { ApiError } from '../../../lib/api-client';
import { getCurrentUser } from '../../auth/api/get-current-user';
import { createPet } from '../api/create-pet';
import { getPet } from '../api/get-pet';
import { deletePetImage, uploadPetImage } from '../api/pet-image';
import { updatePet } from '../api/update-pet';
import { PetFormPage } from './pet-form-page';

vi.mock('../api/get-pet', () => ({ getPet: vi.fn() }));
vi.mock('../api/create-pet', () => ({ createPet: vi.fn() }));
vi.mock('../api/update-pet', () => ({ updatePet: vi.fn() }));
vi.mock('../api/pet-image', () => ({
  uploadPetImage: vi.fn(),
  deletePetImage: vi.fn(),
}));
vi.mock('../../auth/api/get-current-user', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../auth/api/get-current-user')>()),
  getCurrentUser: vi.fn(),
}));

const owner: User = {
  _id: 'owner-1',
  email: 'owner@example.com',
  name: 'Owner',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const pet: Pet = {
  _id: 'pet-1',
  owner: owner._id,
  name: 'Milo',
  species: 'dog',
  age: 3,
  description: 'A friendly dog.',
  status: 'available',
  imageUrl: 'http://localhost:3333/uploads/pets/milo.jpg',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const newPet: Pet = { ...pet, _id: 'new-pet', imageUrl: null };

const photo = (type = 'image/png', size = 10) =>
  new File([new Uint8Array(size)], 'milo.png', { type });

// jsdom has no object URLs; the preview only needs some URL.
const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});

afterAll(() => {
  URL.createObjectURL = originalCreateObjectUrl;
  URL.revokeObjectURL = originalRevokeObjectUrl;
});

const renderForm = (path: string) => {
  vi.mocked(getCurrentUser).mockResolvedValue(owner);

  const router = createMemoryRouter(
    [
      { path: '/pets/new', element: <PetFormPage /> },
      { path: '/pets/:id/edit', element: <PetFormPage /> },
      { path: '/pets/:id', element: <p>Pet page</p> },
    ],
    { initialEntries: [path] },
  );

  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return router;
};

const fillRequiredFields = async () => {
  fireEvent.change(await screen.findByLabelText('Name'), {
    target: { value: 'Milo' },
  });
  fireEvent.change(screen.getByLabelText('Age (years)'), {
    target: { value: '3' },
  });
  fireEvent.change(screen.getByLabelText('Description'), {
    target: { value: 'A friendly dog.' },
  });
};

const choosePhoto = (file: File) => {
  fireEvent.change(screen.getByLabelText('Photo (optional)'), {
    target: { files: [file] },
  });
};

describe('pet photo in the pet form', () => {
  beforeEach(() => {
    vi.mocked(createPet).mockReset().mockResolvedValue(newPet);
    vi.mocked(updatePet).mockReset().mockResolvedValue(pet);
    vi.mocked(uploadPetImage).mockReset().mockResolvedValue(newPet);
    vi.mocked(deletePetImage).mockReset().mockResolvedValue(pet);
    vi.mocked(getPet).mockResolvedValue(pet);
  });

  it('uploads the chosen photo after creating the pet', async () => {
    const router = renderForm('/pets/new');
    await fillRequiredFields();
    const file = photo();

    choosePhoto(file);

    expect(
      screen.getByRole('img', { name: 'Photo preview' }).getAttribute('src'),
    ).toBe('blob:preview');

    fireEvent.click(screen.getByRole('button', { name: 'Create pet' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/pets/new-pet');
    });
    expect(createPet).toHaveBeenCalled();
    expect(uploadPetImage).toHaveBeenCalledWith('new-pet', file);
  });

  it('keeps the saved pet when the photo upload fails', async () => {
    vi.mocked(uploadPetImage).mockRejectedValue(
      new ApiError(415, 'UNSUPPORTED_IMAGE_TYPE'),
    );
    const router = renderForm('/pets/new');
    await fillRequiredFields();
    choosePhoto(photo());

    fireEvent.click(screen.getByRole('button', { name: 'Create pet' }));

    // The pet exists, so the user goes to its page (with an error toast).
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/pets/new-pet');
    });
  });

  it.each([
    [
      'a non-image file',
      photo('application/pdf'),
      'Choose a JPEG, PNG or WebP image.',
    ],
    [
      'a file over 5 MB',
      photo('image/png', PET_IMAGE_MAX_BYTES + 1),
      'The photo must be at most 5 MB.',
    ],
  ])('rejects %s before uploading', async (_label, file, message) => {
    renderForm('/pets/new');
    await fillRequiredFields();

    choosePhoto(file);

    expect(screen.getByText(message)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Create pet' }));

    await waitFor(() => expect(createPet).toHaveBeenCalled());
    expect(uploadPetImage).not.toHaveBeenCalled();
  });

  it('shows the current photo and can remove it', async () => {
    renderForm('/pets/pet-1/edit');

    const current = await screen.findByRole('img', { name: 'Photo preview' });
    expect(current.getAttribute('src')).toBe(pet.imageUrl);

    fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }));

    expect(screen.queryByRole('img', { name: 'Photo preview' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(deletePetImage).toHaveBeenCalledWith('pet-1'));
    expect(updatePet).toHaveBeenCalled();
    expect(uploadPetImage).not.toHaveBeenCalled();
  });

  it('does not touch the photo when it is unchanged', async () => {
    renderForm('/pets/pet-1/edit');

    fireEvent.click(
      await screen.findByRole('button', { name: 'Save changes' }),
    );

    await waitFor(() => expect(updatePet).toHaveBeenCalled());
    expect(uploadPetImage).not.toHaveBeenCalled();
    expect(deletePetImage).not.toHaveBeenCalled();
  });
});
