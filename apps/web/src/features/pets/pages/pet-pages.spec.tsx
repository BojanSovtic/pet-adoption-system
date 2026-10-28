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
import { getPet } from '../api/get-pet';
import { updatePet } from '../api/update-pet';
import { PetDetailsPage } from './pet-details-page';
import { PetFormPage } from './pet-form-page';

vi.mock('../api/get-pet', () => ({ getPet: vi.fn() }));
vi.mock('../api/update-pet', () => ({ updatePet: vi.fn() }));

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
  role: 'user',
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
  ...DEFAULT_PET_PROFILE,
  hidden: false,
  imageUrl: null,
  images: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

// A pet with every profile fact filled in.
const profiledPet: Pet = {
  ...pet,
  sex: 'female',
  breed: 'Collie mix',
  compatibility: { children: 'yes', dogs: 'no', cats: 'unknown' },
  aloneTime: 'part-day',
};

const renderAt = (path: string, user: User | null, state?: unknown) => {
  vi.mocked(getCurrentUser).mockResolvedValue(user);

  const router = createMemoryRouter(
    [
      { path: '/pets/:id', element: <PetDetailsPage /> },
      { path: '/pets/:id/edit', element: <PetFormPage /> },
      { path: '/pets/new', element: <PetFormPage /> },
      { path: '/login', element: <p>Login page</p> },
      { path: '/pets', element: <p>Pet list</p> },
    ],
    { initialEntries: [{ pathname: path, state }] },
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

  it('goes back to the list page, search and filters it was opened from', async () => {
    const router = renderAt('/pets/pet-1', null, {
      petListSearch: '?search=mil&species=dog&page=2',
    });

    fireEvent.click(await screen.findByRole('link', { name: 'Back to pets' }));

    expect(await screen.findByText('Pet list')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/pets');
    expect(router.state.location.search).toBe('?search=mil&species=dog&page=2');
  });

  it('goes back to the first list page when opened directly', async () => {
    const router = renderAt('/pets/pet-1', null);

    fireEvent.click(await screen.findByRole('link', { name: 'Back to pets' }));

    expect(await screen.findByText('Pet list')).toBeTruthy();
    expect(router.state.location.search).toBe('');
  });

  it('explains a pending status to visitors, not to the owner', async () => {
    const hint =
      "Someone has applied and the owner hasn't decided yet. You can still apply.";
    vi.mocked(getPet).mockResolvedValue({ ...pet, status: 'pending' });

    renderAt('/pets/pet-1', otherUser);
    expect(await screen.findByText(hint)).toBeTruthy();
  });

  it('hides the pending explanation from the owner', async () => {
    vi.mocked(getPet).mockResolvedValue({ ...pet, status: 'pending' });

    renderAt('/pets/pet-1', owner);
    // The owner's controls show once the current user is known.
    expect(await screen.findByRole('link', { name: 'Edit pet' })).toBeTruthy();
    expect(screen.queryByText(/You can still apply/)).toBeNull();
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

  it('shows the profile facts and the home and lifestyle answers', async () => {
    vi.mocked(getPet).mockResolvedValue(profiledPet);
    renderAt('/pets/pet-1', null);

    expect(await screen.findByText('Female')).toBeTruthy();
    expect(screen.getByText('Collie mix')).toBeTruthy();

    const lifestyle = screen.getByRole('region', {
      name: 'Home and lifestyle',
    });
    const rows = within(lifestyle)
      .getAllByRole('term')
      .map((term) => [term.textContent, term.nextElementSibling?.textContent]);
    expect(rows).toEqual([
      ['Children', 'Gets along well'],
      ['Dogs', 'Better without'],
      ['Cats', 'Not known yet'],
      ['Time alone', 'Up to about 5 hours'],
    ]);
  });

  it('tells the owner when administrators hid the listing', async () => {
    vi.mocked(getPet).mockResolvedValue({ ...pet, hidden: true });
    renderAt('/pets/pet-1', owner);

    expect((await screen.findByRole('note')).textContent).toContain(
      'Administrators hid this listing.',
    );
  });

  it('shows no moderation notice on a visible listing', async () => {
    renderAt('/pets/pet-1', owner);

    await screen.findByRole('heading', { name: 'Milo' });
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('leaves out sex and breed when they are not known', async () => {
    renderAt('/pets/pet-1', null);

    await screen.findByRole('heading', { name: 'Milo' });
    expect(screen.queryByText('Sex')).toBeNull();
    expect(screen.queryByText('Breed')).toBeNull();
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

  it('loads the profile facts into the form and sends them on save', async () => {
    vi.mocked(getPet).mockResolvedValue(profiledPet);
    vi.mocked(updatePet).mockResolvedValue(profiledPet);
    renderAt('/pets/pet-1/edit', owner);

    const dogs = (await screen.findByLabelText('Dogs')) as HTMLSelectElement;
    expect(dogs.value).toBe('no');
    expect((screen.getByLabelText('Sex') as HTMLSelectElement).value).toBe(
      'female',
    );

    fireEvent.change(dogs, { target: { value: 'yes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(updatePet).toHaveBeenCalledWith('pet-1', {
        name: 'Milo',
        species: 'dog',
        age: 3,
        description: 'A friendly dog.',
        sex: 'female',
        breed: 'Collie mix',
        compatibility: { children: 'yes', dogs: 'yes', cats: 'unknown' },
        aloneTime: 'part-day',
      });
    });
  });

  it('focuses the first invalid field when saving fails validation', async () => {
    vi.mocked(updatePet).mockClear();
    renderAt('/pets/pet-1/edit', owner);
    const description = await screen.findByLabelText('Description');
    const age = screen.getByLabelText('Age (years)');

    fireEvent.change(description, { target: { value: '   ' } });
    fireEvent.change(age, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    // Age comes before Description on the page.
    expect(await screen.findByText('Age is required.')).toBeTruthy();
    expect(screen.getByText('Description is required.')).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(age));
    expect(screen.getByLabelText('Name').getAttribute('aria-invalid')).toBe(
      'false',
    );
    expect(updatePet).not.toHaveBeenCalled();
  });

  it('focuses a field the API rejected', async () => {
    vi.mocked(updatePet).mockRejectedValue(
      new ApiError(400, 'VALIDATION_FAILED', [
        { field: 'description', code: 'too_big' },
      ]),
    );
    renderAt('/pets/pet-1/edit', owner);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Save changes' }),
    );

    const description = screen.getByLabelText('Description');
    expect(
      await screen.findByText('This value is too long or too large.'),
    ).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(description));
    expect(description.getAttribute('aria-describedby')).toBe(
      'description-error',
    );
  });

  it('keeps the list state through edit and save, for "Back to pets"', async () => {
    vi.mocked(getPet).mockResolvedValue(pet);
    vi.mocked(updatePet).mockResolvedValue(pet);
    const router = renderAt('/pets/pet-1', owner, { petListSearch: '?page=2' });

    fireEvent.click(await screen.findByRole('link', { name: 'Edit pet' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Save changes' }),
    );

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/pets/pet-1');
    });
    expect(
      (await screen.findByRole('link', { name: 'Back to pets' })).getAttribute(
        'href',
      ),
    ).toBe('/pets?page=2');
  });
});
