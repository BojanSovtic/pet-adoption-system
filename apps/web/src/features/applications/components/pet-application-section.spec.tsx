import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  createMemoryRouter,
  Link,
  RouterProvider,
  useParams,
} from 'react-router-dom';
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
  emailVerified: true,
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

  it('shows no error on load or when an untouched field loses focus', async () => {
    renderSection(visitor);
    const field = await screen.findByLabelText(
      'Why would you like to adopt Milo?',
    );

    fireEvent.focus(field);
    fireEvent.blur(field);

    expect(screen.queryByText('Please write a short message.')).toBeNull();
    expect(field.getAttribute('aria-invalid')).toBe('false');
    expect(field.getAttribute('aria-describedby')).toBe(
      'application-message-hint',
    );
  });

  it('marks the field invalid after a failed submit and clears it once corrected', async () => {
    renderSection(visitor);
    const field = await screen.findByLabelText(
      'Why would you like to adopt Milo?',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Send application' }));

    const error = await screen.findByText('Please write a short message.');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(field.getAttribute('aria-describedby')).toBe(
      `application-message-hint ${error.id}`,
    );

    // Only spaces is still invalid (the API trims too), so the error stays.
    fireEvent.change(field, { target: { value: '   ' } });
    fireEvent.blur(field);
    expect(screen.getByText('Please write a short message.')).toBeTruthy();

    // Clears while typing, without waiting for blur or another submit.
    fireEvent.change(field, { target: { value: '   I have a garden.' } });
    expect(screen.queryByText('Please write a short message.')).toBeNull();
    expect(field.getAttribute('aria-invalid')).toBe('false');
    expect(submitApplication).not.toHaveBeenCalled();
  });

  it('keeps submit enabled for an empty form and disables it only while sending', async () => {
    let resolveSubmit: ((application: MyApplication) => void) | undefined;
    vi.mocked(submitApplication).mockReturnValue(
      new Promise((resolve) => {
        resolveSubmit = resolve;
      }),
    );
    renderSection(visitor);

    const submit = (await screen.findByRole('button', {
      name: 'Send application',
    })) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);

    fireEvent.change(
      screen.getByLabelText('Why would you like to adopt Milo?'),
      {
        target: { value: 'I have a big garden.' },
      },
    );
    fireEvent.click(submit);

    const sending = (await screen.findByRole('button', {
      name: 'Sending...',
    })) as HTMLButtonElement;
    expect(sending.disabled).toBe(true);
    fireEvent.click(sending);
    expect(submitApplication).toHaveBeenCalledTimes(1);

    await act(async () => resolveSubmit?.(myApplication('pending')));
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

describe('PetApplicationSection draft across navigation', () => {
  const otherPet: Pet = { ...pet, _id: 'pet-2', name: 'Luna' };
  const pets = [pet, otherPet];
  const miloLabel = 'Why would you like to adopt Milo?';

  // Mirrors the pet details page: the keyed section next to the owner link.
  const PetRoute = () => {
    const { id } = useParams();
    const shown = pets.find((candidate) => candidate._id === id) ?? pet;

    return (
      <>
        <PetApplicationSection key={shown._id} pet={shown} />
        <Link to={`/users/${owner._id}`}>Owner profile</Link>
      </>
    );
  };

  const renderWithProfile = () => {
    vi.mocked(getCurrentUser).mockResolvedValue(visitor);
    vi.mocked(getMyApplications).mockResolvedValue(pageOf([]));

    const router = createMemoryRouter(
      [
        { path: '/pets/:id', element: <PetRoute /> },
        { path: '/users/:id', element: <h1>Owner page</h1> },
      ],
      { initialEntries: [`/pets/${pet._id}`] },
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

  // A real click moves focus off the field first; fireEvent.click does not.
  const typeAndLeave = async (label: string, value: string) => {
    const field = await screen.findByLabelText(label);
    fireEvent.change(field, { target: { value } });
    fireEvent.blur(field);
    fireEvent.click(screen.getByRole('link', { name: 'Owner profile' }));
    await screen.findByRole('heading', { name: 'Owner page' });
  };

  const goBack = async (router: ReturnType<typeof renderWithProfile>) => {
    await act(() => router.navigate(-1));
  };

  const fieldValue = async (label: string) =>
    ((await screen.findByLabelText(label)) as HTMLTextAreaElement).value;

  beforeEach(() => {
    vi.mocked(submitApplication).mockReset();
  });

  it('restores the message after visiting the owner profile and going back', async () => {
    const router = renderWithProfile();

    await typeAndLeave(miloLabel, 'I have a big garden.');
    await goBack(router);

    expect(await fieldValue(miloLabel)).toBe('I have a big garden.');
  });

  it('lets the restored message be edited and submitted', async () => {
    vi.mocked(submitApplication).mockResolvedValue(myApplication('pending'));
    const router = renderWithProfile();

    await typeAndLeave(miloLabel, 'I have a big garden.');
    await goBack(router);

    fireEvent.change(await screen.findByLabelText(miloLabel), {
      target: { value: 'I have a big garden and time.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send application' }));

    await waitFor(() => {
      expect(submitApplication).toHaveBeenCalledWith('pet-1', {
        message: 'I have a big garden and time.',
      });
    });
  });

  it("does not show one pet's message on another pet", async () => {
    const router = renderWithProfile();

    await typeAndLeave(miloLabel, 'I have a big garden.');
    await act(() => router.navigate(`/pets/${otherPet._id}`));

    expect(await fieldValue('Why would you like to adopt Luna?')).toBe('');

    // A fresh visit to the same pet is a new history entry, so it starts empty.
    await act(() => router.navigate(`/pets/${pet._id}`));
    expect(await fieldValue(miloLabel)).toBe('');
  });

  it('forgets the message once it is sent', async () => {
    vi.mocked(submitApplication).mockResolvedValue(myApplication('pending'));
    const router = renderWithProfile();

    await typeAndLeave(miloLabel, 'I have a big garden.');
    await goBack(router);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Send application' }),
    );
    // The mock still reports no application, so the form shows again.
    await waitFor(async () => {
      expect(submitApplication).toHaveBeenCalled();
      expect(await fieldValue(miloLabel)).toBe('');
    });
    fireEvent.click(screen.getByRole('link', { name: 'Owner profile' }));
    await screen.findByRole('heading', { name: 'Owner page' });
    await goBack(router);

    expect(await fieldValue(miloLabel)).toBe('');
  });

  it('keeps the message when sending fails', async () => {
    const { ApiError } = await import('../../../lib/api-client');
    vi.mocked(submitApplication).mockRejectedValue(
      new ApiError(0, 'NETWORK_ERROR'),
    );
    const router = renderWithProfile();

    await typeAndLeave(miloLabel, 'I have a big garden.');
    await goBack(router);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Send application' }),
    );
    await screen.findByRole('alert');

    fireEvent.click(screen.getByRole('link', { name: 'Owner profile' }));
    await screen.findByRole('heading', { name: 'Owner page' });
    await goBack(router);

    expect(await fieldValue(miloLabel)).toBe('I have a big garden.');
  });

  it('still validates a restored, emptied message', async () => {
    const router = renderWithProfile();

    await typeAndLeave(miloLabel, 'I have a big garden.');
    await goBack(router);

    fireEvent.change(await screen.findByLabelText(miloLabel), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send application' }));

    expect(
      await screen.findByText('Please write a short message.'),
    ).toBeTruthy();
    expect(submitApplication).not.toHaveBeenCalled();
  });
});
