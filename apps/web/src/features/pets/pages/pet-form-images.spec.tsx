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
import {
  PET_IMAGE_MAX_BYTES,
  type Pet,
  type PetImage,
  type User,
} from '@pet-adoption/models';

import '../../../i18n/config';
import { ApiError } from '../../../lib/api-client';
import { getCurrentUser } from '../../auth/api/get-current-user';
import { createPet } from '../api/create-pet';
import { getPet } from '../api/get-pet';
import { addPetImages, deletePetImage } from '../api/pet-image';
import { updatePet } from '../api/update-pet';
import { PetFormPage } from './pet-form-page';

vi.mock('../api/get-pet', () => ({ getPet: vi.fn() }));
vi.mock('../api/create-pet', () => ({ createPet: vi.fn() }));
vi.mock('../api/update-pet', () => ({ updatePet: vi.fn() }));
vi.mock('../api/pet-image', () => ({
  addPetImages: vi.fn(),
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

const image = (id: string): PetImage => ({
  _id: id,
  url: `http://localhost:3333/uploads/pets/${id}.jpg`,
});

const pet: Pet = {
  _id: 'pet-1',
  owner: owner._id,
  name: 'Milo',
  species: 'dog',
  age: 3,
  description: 'A friendly dog.',
  status: 'available',
  imageUrl: image('img-1').url,
  images: [image('img-1'), image('img-2')],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const newPet: Pet = { ...pet, _id: 'new-pet', imageUrl: null, images: [] };

const photo = (name = 'milo.png', type = 'image/png', size = 10) =>
  new File([new Uint8Array(size)], name, { type });

// jsdom has no object URLs; the previews only need some URL.
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

const choosePhotos = (...files: File[]) => {
  fireEvent.change(screen.getByLabelText('Add photos'), {
    target: { files },
  });
};

describe('pet photos in the pet form', () => {
  beforeEach(() => {
    vi.mocked(createPet).mockReset().mockResolvedValue(newPet);
    vi.mocked(updatePet).mockReset().mockResolvedValue(pet);
    vi.mocked(addPetImages).mockReset().mockResolvedValue(newPet);
    vi.mocked(deletePetImage).mockReset().mockResolvedValue(pet);
    vi.mocked(getPet).mockResolvedValue(pet);
  });

  it('uploads all chosen photos after creating the pet', async () => {
    const router = renderForm('/pets/new');
    await fillRequiredFields();
    const first = photo('first.png');
    const second = photo('second.jpg', 'image/jpeg');

    choosePhotos(first, second);

    expect(
      (await screen.findByRole('img', { name: 'Photo 1' })).getAttribute('src'),
    ).toBe('blob:preview');
    expect(screen.getByRole('img', { name: 'Photo 2' })).toBeTruthy();
    expect(screen.getByText('Main photo')).toBeTruthy();
    expect(screen.getByText(/Photos: 2 of 5\./)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Create pet' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/pets/new-pet');
    });
    expect(createPet).toHaveBeenCalled();
    expect(addPetImages).toHaveBeenCalledWith('new-pet', [first, second]);
  });

  it('removes a chosen photo before saving', async () => {
    renderForm('/pets/new');
    await fillRequiredFields();
    const keep = photo('keep.png');

    choosePhotos(photo('drop.png'), keep);
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create pet' }));

    await waitFor(() =>
      expect(addPetImages).toHaveBeenCalledWith('new-pet', [keep]),
    );
  });

  it('keeps the saved pet when the photo upload fails', async () => {
    vi.mocked(addPetImages).mockRejectedValue(
      new ApiError(415, 'UNSUPPORTED_IMAGE_TYPE'),
    );
    const router = renderForm('/pets/new');
    await fillRequiredFields();
    choosePhotos(photo());

    fireEvent.click(screen.getByRole('button', { name: 'Create pet' }));

    // The pet exists, so the user goes to its page (with an error toast).
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/pets/new-pet');
    });
  });

  it.each([
    [
      'a non-image file',
      photo('notes.pdf', 'application/pdf'),
      'notes.pdf: Choose a JPEG, PNG or WebP image.',
    ],
    [
      'a file over 5 MB',
      photo('huge.png', 'image/png', PET_IMAGE_MAX_BYTES + 1),
      'huge.png: The photo must be at most 5 MB.',
    ],
  ])('rejects %s but keeps the valid files', async (_label, bad, message) => {
    renderForm('/pets/new');
    await fillRequiredFields();
    const good = photo('good.png');

    choosePhotos(bad, good);

    expect(screen.getByText(message)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Create pet' }));

    await waitFor(() =>
      expect(addPetImages).toHaveBeenCalledWith('new-pet', [good]),
    );
  });

  it('allows 5 photos in total, counting the existing ones', async () => {
    vi.mocked(getPet).mockResolvedValue({
      ...pet,
      images: ['a', 'b', 'c', 'd'].map(image),
    });
    renderForm('/pets/pet-1/edit');
    await screen.findByRole('img', { name: 'Photo 4' });
    const fits = photo('fits.png');

    choosePhotos(fits, photo('extra.png'));

    expect(
      screen.getByText(
        'extra.png: Not added: a pet can have at most 5 photos.',
      ),
    ).toBeTruthy();
    expect(screen.getByText(/Photos: 5 of 5\./)).toBeTruthy();
    expect(
      (screen.getByLabelText('Add photos') as HTMLInputElement).disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(addPetImages).toHaveBeenCalledWith('pet-1', [fits]),
    );
  });

  it('shows the existing photos and removes one', async () => {
    renderForm('/pets/pet-1/edit');

    const first = await screen.findByRole('img', { name: 'Photo 1' });
    expect(first.getAttribute('src')).toBe(pet.images[0].url);
    expect(screen.getByRole('img', { name: 'Photo 2' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Remove photo 1' }));

    // The remaining photo moves up and becomes the main photo.
    expect(screen.queryByRole('img', { name: 'Photo 2' })).toBeNull();
    expect(
      screen.getByRole('img', { name: 'Photo 1' }).getAttribute('src'),
    ).toBe(pet.images[1].url);

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(deletePetImage).toHaveBeenCalledWith('pet-1', 'img-1'),
    );
    expect(deletePetImage).toHaveBeenCalledTimes(1);
    expect(addPetImages).not.toHaveBeenCalled();
  });

  it('removes photos before adding new ones', async () => {
    const calls: string[] = [];
    vi.mocked(deletePetImage).mockImplementation(async () => {
      calls.push('delete');
      return pet;
    });
    vi.mocked(addPetImages).mockImplementation(async () => {
      calls.push('add');
      return pet;
    });
    renderForm('/pets/pet-1/edit');
    await screen.findByRole('img', { name: 'Photo 2' });

    fireEvent.click(screen.getByRole('button', { name: 'Remove photo 2' }));
    choosePhotos(photo());
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(calls).toEqual(['delete', 'add']));
    expect(deletePetImage).toHaveBeenCalledWith('pet-1', 'img-2');
  });

  it('does not touch the photos when they are unchanged', async () => {
    renderForm('/pets/pet-1/edit');

    fireEvent.click(
      await screen.findByRole('button', { name: 'Save changes' }),
    );

    await waitFor(() => expect(updatePet).toHaveBeenCalled());
    expect(addPetImages).not.toHaveBeenCalled();
    expect(deletePetImage).not.toHaveBeenCalled();
  });
});
