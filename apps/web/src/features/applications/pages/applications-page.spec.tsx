import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type {
  MyApplication,
  ReceivedApplication,
  User,
} from '@pet-adoption/models';

import '../../../i18n/config';
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

const renderPage = (currentUser: User | null) => {
  vi.mocked(getCurrentUser).mockResolvedValue(currentUser);

  const router = createMemoryRouter(
    [
      { path: '/applications', element: <ApplicationsPage /> },
      { path: '/login', element: <p>Login page</p> },
    ],
    { initialEntries: ['/applications'] },
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
  it('sends signed-out visitors to the login page', async () => {
    const router = renderPage(null);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login');
    });
  });

  it("shows received applications with the applicant's contact and owner actions", async () => {
    vi.mocked(getReceivedApplications).mockResolvedValue([
      received('received-1', 'pending'),
      received('received-2', 'rejected'),
    ]);
    vi.mocked(getMyApplications).mockResolvedValue([mine]);
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
    vi.mocked(getReceivedApplications).mockResolvedValue([
      received('received-1', 'pending'),
    ]);
    vi.mocked(getMyApplications).mockResolvedValue([]);
    vi.mocked(runApplicationAction).mockResolvedValue(
      received('received-1', 'accepted'),
    );
    renderPage(user);

    fireEvent.click(await screen.findByRole('button', { name: 'Accept' }));

    await waitFor(() => {
      expect(runApplicationAction).toHaveBeenCalledWith('received-1', 'accept');
    });
  });

  it('shows empty states', async () => {
    vi.mocked(getReceivedApplications).mockResolvedValue([]);
    vi.mocked(getMyApplications).mockResolvedValue([]);
    renderPage(user);

    expect(
      await screen.findByText('No one has applied for your pets yet.'),
    ).toBeTruthy();
    expect(
      screen.getByText("You haven't applied to adopt any pets yet."),
    ).toBeTruthy();
  });
});
