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
import type {
  MyApplication,
  ReceivedApplication,
  User,
} from '@pet-adoption/models';

import '../../../i18n/config';
import { pageOf } from '../../../lib/testing/page-of';
import { getCurrentUser } from '../../auth/api/get-current-user';
import {
  getMyApplications,
  getReceivedApplications,
  runApplicationAction,
} from '../api/applications';
import { ApplicationsPage } from './applications-page';

vi.mock('../api/applications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/applications')>()),
  getMyApplications: vi.fn(),
  getReceivedApplications: vi.fn(),
  runApplicationAction: vi.fn(),
}));

vi.mock('../../auth/api/get-current-user', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../auth/api/get-current-user')>()),
  getCurrentUser: vi.fn(),
}));

const user: User = {
  _id: 'user-1',
  email: 'user@example.com',
  name: 'Owner',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const base = {
  message: 'I have a big garden.',
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

const received = (
  id: string,
  status: ReceivedApplication['status'],
): ReceivedApplication => ({
  ...base,
  _id: id,
  status,
  pet: { _id: 'pet-1', name: 'Milo', species: 'dog', status: 'pending' },
  applicant: { _id: 'applicant-1', name: 'Ana', email: 'ana@example.com' },
});

const mine: MyApplication = {
  ...base,
  _id: 'mine-1',
  status: 'pending',
  pet: { _id: 'pet-2', name: 'Luna', species: 'cat', status: 'pending' },
};

const renderPage = (currentUser: User | null, path = '/applications') => {
  vi.mocked(getCurrentUser).mockResolvedValue(currentUser);

  const router = createMemoryRouter(
    [
      { path: '/applications', element: <ApplicationsPage /> },
      { path: '/login', element: <p>Login page</p> },
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

describe('ApplicationsPage', () => {
  beforeEach(() => {
    vi.mocked(runApplicationAction).mockClear();
  });

  it('sends signed-out visitors to the login page', async () => {
    const router = renderPage(null);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login');
    });
  });

  it("shows received applications with the applicant's contact and owner actions", async () => {
    vi.mocked(getReceivedApplications).mockResolvedValue(
      pageOf([
        received('received-1', 'pending'),
        received('received-2', 'rejected'),
      ]),
    );
    vi.mocked(getMyApplications).mockResolvedValue(pageOf([mine]));
    renderPage(user);

    expect(
      (await screen.findAllByText(/Ana \(ana@example\.com\)/)).length,
    ).toBe(2);

    // Accept/Reject only for the pending one; Withdraw only for my own.
    expect(screen.getAllByRole('button', { name: 'Accept' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Reject' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Withdraw' })).toHaveLength(1);
  });

  it('runs the chosen action', async () => {
    vi.mocked(getReceivedApplications).mockResolvedValue(
      pageOf([received('received-1', 'pending')]),
    );
    vi.mocked(getMyApplications).mockResolvedValue(pageOf([]));
    vi.mocked(runApplicationAction).mockResolvedValue(
      received('received-1', 'accepted'),
    );
    renderPage(user);

    fireEvent.click(await screen.findByRole('button', { name: 'Accept' }));
    // Accepting is final, so it asks first.
    expect(runApplicationAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, accept' }));

    await waitFor(() => {
      expect(runApplicationAction).toHaveBeenCalledWith('received-1', 'accept');
    });
  });

  it('cancels a final decision without calling the API', async () => {
    vi.mocked(getReceivedApplications).mockResolvedValue(
      pageOf([received('received-1', 'pending')]),
    );
    vi.mocked(getMyApplications).mockResolvedValue(pageOf([]));
    renderPage(user);

    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));

    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(document.activeElement).toBe(cancel);
    expect(
      screen.getByText(/The applicant will not be able to apply/),
    ).toBeTruthy();

    fireEvent.click(cancel);

    expect(screen.getByRole('button', { name: 'Reject' })).toBeTruthy();
    expect(runApplicationAction).not.toHaveBeenCalled();
  });

  it('withdraws without asking, because the applicant can apply again', async () => {
    vi.mocked(getReceivedApplications).mockResolvedValue(pageOf([]));
    vi.mocked(getMyApplications).mockResolvedValue(pageOf([mine]));
    vi.mocked(runApplicationAction).mockResolvedValue(mine);
    renderPage(user);

    fireEvent.click(await screen.findByRole('button', { name: 'Withdraw' }));

    await waitFor(() => {
      expect(runApplicationAction).toHaveBeenCalledWith(mine._id, 'withdraw');
    });
  });

  it('pages each list on its own and keeps the page in the URL', async () => {
    vi.mocked(getReceivedApplications).mockImplementation(async ({ page }) =>
      pageOf([received(`received-${page}`, 'pending')], {
        page,
        totalItems: 11,
        totalPages: 2,
      }),
    );
    vi.mocked(getMyApplications).mockResolvedValue(pageOf([mine]));
    const router = renderPage(user);

    const receivedNav = await screen.findByRole('navigation', {
      name: 'Pages of applications for my pets',
    });
    // "My applications" has a single page, so no controls.
    expect(
      screen.queryByRole('navigation', { name: 'Pages of my applications' }),
    ).toBeNull();
    expect(getReceivedApplications).toHaveBeenLastCalledWith({ page: 1 });

    fireEvent.click(within(receivedNav).getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('Page 2 of 2')).toBeTruthy();
    expect(getReceivedApplications).toHaveBeenLastCalledWith({ page: 2 });
    expect(router.state.location.search).toBe('?receivedPage=2');
    expect(getMyApplications).toHaveBeenLastCalledWith({ page: 1 });
  });

  it('falls back to page 1 for an invalid page in the URL', async () => {
    vi.mocked(getReceivedApplications).mockResolvedValue(pageOf([]));
    vi.mocked(getMyApplications).mockResolvedValue(pageOf([]));
    renderPage(user, '/applications?receivedPage=abc&minePage=-3');

    await waitFor(() => {
      expect(getReceivedApplications).toHaveBeenLastCalledWith({ page: 1 });
      expect(getMyApplications).toHaveBeenLastCalledWith({ page: 1 });
    });
  });

  it('offers the first page when the page is past the end', async () => {
    vi.mocked(getReceivedApplications).mockResolvedValue(pageOf([]));
    vi.mocked(getMyApplications).mockImplementation(async ({ page = 1 }) =>
      page === 1
        ? pageOf([mine])
        : pageOf([], { page, totalItems: 1, totalPages: 1 }),
    );
    const router = renderPage(user, '/applications?minePage=7');

    fireEvent.click(
      await screen.findByRole('button', { name: 'Go to the first page' }),
    );

    expect(await screen.findByText('Luna')).toBeTruthy();
    expect(router.state.location.search).toBe('');
  });

  it('shows a load error for one list without hiding the other', async () => {
    const { ApiError } = await import('../../../lib/api-client');
    vi.mocked(getReceivedApplications).mockRejectedValue(
      new ApiError(500, 'INTERNAL_SERVER_ERROR'),
    );
    vi.mocked(getMyApplications).mockResolvedValue(pageOf([mine]));
    renderPage(user);

    expect(await screen.findByText('Something went wrong.')).toBeTruthy();
    expect(await screen.findByText('Luna')).toBeTruthy();
  });

  it('shows empty states', async () => {
    vi.mocked(getReceivedApplications).mockResolvedValue(pageOf([]));
    vi.mocked(getMyApplications).mockResolvedValue(pageOf([]));
    renderPage(user);

    expect(
      await screen.findByText('No one has applied for your pets yet.'),
    ).toBeTruthy();
    expect(
      screen.getByText("You haven't applied to adopt any pets yet."),
    ).toBeTruthy();
  });
});
