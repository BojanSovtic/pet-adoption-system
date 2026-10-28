import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PET_PROFILE,
  type MyApplication,
  type Pet,
  type User,
} from '@pet-adoption/models';

import '../../../i18n/config';
import { getCurrentUser } from '../../auth/api/get-current-user';
import { getMyApplications, submitApplication } from '../api/applications';
import { pageOf } from '../../../lib/testing/page-of';
import { PetApplicationSection } from './pet-application-section';

vi.mock('../api/applications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/applications')>()),
  getMyApplications: vi.fn(),
  submitApplication: vi.fn(),
  runApplicationAction: vi.fn(),
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
const visitor = makeUser('visitor-1');

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

const myApplication = (status: MyApplication['status']): MyApplication => ({
  _id: 'application-1',
  message: 'I would love to adopt Milo.',
  status,
  pet: {
    _id: pet._id,
    name: pet.name,
    species: pet.species,
    status: 'pending',
  },
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
});

const renderSection = (
  user: User | null,
  applications: MyApplication[] = [],
  shownPet: Pet = pet,
) => {
  vi.mocked(getCurrentUser).mockResolvedValue(user);
  vi.mocked(getMyApplications).mockResolvedValue(pageOf(applications));

  const router = createMemoryRouter(
    [
      {
        path: '/pets/:id',
        element: <PetApplicationSection pet={shownPet} />,
      },
    ],
    { initialEntries: [`/pets/${shownPet._id}`] },
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
};

describe('PetApplicationSection', () => {
  beforeEach(() => {
    vi.mocked(submitApplication).mockReset();
    vi.mocked(getMyApplications).mockClear();
  });

  it('asks signed-out visitors to sign in', async () => {
    renderSection(null);

    expect(
      await screen.findByRole('link', { name: 'Sign in to apply' }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Send application' }),
    ).toBeNull();
  });

  it('tells visitors when the pet is already adopted, without a form', async () => {
    renderSection(visitor, [], { ...pet, status: 'adopted' });

    expect(
      await screen.findByText('Milo has already found a new home.'),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Send application' }),
    ).toBeNull();
  });

  it('shows the owner a link to review applications instead of a form', async () => {
    renderSection(owner);

    expect(
      await screen.findByRole('link', { name: 'Review applications' }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Send application' }),
    ).toBeNull();
    expect(getMyApplications).not.toHaveBeenCalled();
  });

  it('validates and submits an application', async () => {
    vi.mocked(submitApplication).mockResolvedValue(myApplication('pending'));
    renderSection(visitor);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Send application' }),
    );

    expect(
      await screen.findByText('Please write a short message.'),
    ).toBeTruthy();
    expect(submitApplication).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByLabelText('Why would you like to adopt Milo?'),
      );
    });

    fireEvent.change(
      screen.getByLabelText('Why would you like to adopt Milo?'),
      {
        target: { value: '  I have a big garden.  ' },
      },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send application' }));

    await waitFor(() => {
      expect(submitApplication).toHaveBeenCalledWith('pet-1', {
        message: 'I have a big garden.',
      });
    });
  });

  it('shows the status and a withdraw button for a pending application', async () => {
    renderSection(visitor, [myApplication('pending')]);

    expect(await screen.findByText('Pending')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Send application' }),
    ).toBeNull();
    // Only this pet's newest application is requested, not the whole list.
    expect(getMyApplications).toHaveBeenCalledWith({
      pet: pet._id,
      pageSize: 1,
    });
  });

  it('shows a rejected application without actions or a new form', async () => {
    renderSection(visitor, [myApplication('rejected')]);

    expect(await screen.findByText('Rejected')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Withdraw' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Send application' }),
    ).toBeNull();
  });

  it('offers a new form after withdrawing', async () => {
    renderSection(visitor, [myApplication('withdrawn')]);

    expect(
      await screen.findByRole('button', { name: 'Send application' }),
    ).toBeTruthy();
  });

  it('shows no form for an adopted pet', async () => {
    renderSection(visitor, [], { ...pet, status: 'adopted' });

    await waitFor(() => expect(getMyApplications).toHaveBeenCalled());
    expect(
      screen.queryByRole('button', { name: 'Send application' }),
    ).toBeNull();
  });

  it('shows API errors inline', async () => {
    const { ApiError } = await import('../../../lib/api-client');
    vi.mocked(submitApplication).mockRejectedValue(
      new ApiError(409, 'ALREADY_APPLIED'),
    );
    renderSection(visitor);

    fireEvent.change(
      await screen.findByLabelText('Why would you like to adopt Milo?'),
      { target: { value: 'Please!' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send application' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'You have already applied for this pet.',
    );
  });
});
