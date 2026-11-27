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
  getPendingApplicationCount,
  getReceivedApplications,
  rejectApplication,
  runApplicationAction,
} from '../api/applications';
import { ApplicationsPage } from './applications-page';

vi.mock('../api/applications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/applications')>()),
  getMyApplications: vi.fn(),
  getReceivedApplications: vi.fn(),
  getPendingApplicationCount: vi.fn(),
  rejectApplication: vi.fn(),
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
  role: 'user',
  emailVerified: true,
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
    vi.mocked(rejectApplication).mockClear();
    vi.mocked(getPendingApplicationCount).mockReset().mockResolvedValue(0);
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

  describe('rejecting with a reason', () => {
    const openRejectDialog = async () => {
      vi.mocked(getReceivedApplications).mockResolvedValue(
        pageOf([received('received-1', 'pending')]),
      );
      vi.mocked(getMyApplications).mockResolvedValue(pageOf([]));
      renderPage(user);

      fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));
      return screen.getByRole('textbox', { name: /Reason for the applicant/ });
    };

    it.each([
      ['empty', ''],
      ['whitespace only', '   \n  '],
    ])('does not reject with a %s reason', async (_label, value) => {
      const field = await openRejectDialog();
      fireEvent.change(field, { target: { value } });

      fireEvent.click(screen.getByRole('button', { name: 'Yes, reject' }));

      expect(
        await screen.findByText(
          'Please explain why you are rejecting this application.',
        ),
      ).toBeTruthy();
      // The dialog stays open, with focus on the invalid field.
      expect(field.getAttribute('aria-invalid')).toBe('true');
      await waitFor(() => {
        expect(document.activeElement).toBe(field);
      });
      expect(rejectApplication).not.toHaveBeenCalled();
    });

    it('sends the trimmed reason and clears the error once it is valid', async () => {
      vi.mocked(rejectApplication).mockResolvedValue({
        ...received('received-1', 'rejected'),
        rejectionReason: 'We chose a family with a garden.',
      });
      const field = await openRejectDialog();

      fireEvent.click(screen.getByRole('button', { name: 'Yes, reject' }));
      expect(
        await screen.findByText(
          'Please explain why you are rejecting this application.',
        ),
      ).toBeTruthy();

      fireEvent.change(field, {
        target: { value: '  We chose a family with a garden. ' },
      });
      expect(
        screen.queryByText(
          'Please explain why you are rejecting this application.',
        ),
      ).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'Yes, reject' }));

      await waitFor(() => {
        expect(rejectApplication).toHaveBeenCalledWith('received-1', {
          reason: 'We chose a family with a garden.',
        });
      });
      expect(runApplicationAction).not.toHaveBeenCalled();
    });

    it('starts empty again after cancelling', async () => {
      const field = await openRejectDialog();
      fireEvent.change(field, { target: { value: 'Draft reason' } });

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

      expect(
        (
          screen.getByRole('textbox', {
            name: /Reason for the applicant/,
          }) as HTMLTextAreaElement
        ).value,
      ).toBe('');
    });
  });

  describe("the owner's explanation", () => {
    const rejectedMine = (
      rejectionReason?: string,
      petStatus: MyApplication['pet']['status'] = 'available',
    ): MyApplication => ({
      ...mine,
      status: 'rejected',
      ...(rejectionReason ? { rejectionReason } : {}),
      pet: { ...mine.pet, status: petStatus },
    });

    it('shows the applicant the reason with their rejected application', async () => {
      vi.mocked(getReceivedApplications).mockResolvedValue(pageOf([]));
      vi.mocked(getMyApplications).mockResolvedValue(
        pageOf([rejectedMine('We are looking for a home with a garden.')]),
      );
      renderPage(user);

      const caption = await screen.findByText("Owner's explanation");
      const note = caption.closest('figure') as HTMLElement;
      expect(
        within(note).getByText('We are looking for a home with a garden.'),
      ).toBeTruthy();
      expect(screen.getByText('Rejected')).toBeTruthy();
    });

    it('says so, without inventing a reason, when none was recorded', async () => {
      vi.mocked(getReceivedApplications).mockResolvedValue(pageOf([]));
      vi.mocked(getMyApplications).mockResolvedValue(
        pageOf([
          rejectedMine(),
          { ...rejectedMine(undefined, 'adopted'), _id: 'mine-2' },
        ]),
      );
      renderPage(user);

      expect(
        await screen.findByText(
          'No explanation was recorded for this decision.',
        ),
      ).toBeTruthy();
      expect(
        screen.getByText(
          'No explanation was recorded for this decision. Luna has since been adopted.',
        ),
      ).toBeTruthy();
      expect(screen.queryByText("Owner's explanation")).toBeNull();
    });

    it('shows the owner the reason they gave', async () => {
      vi.mocked(getReceivedApplications).mockResolvedValue(
        pageOf([
          {
            ...received('received-1', 'rejected'),
            rejectionReason: 'Not a good match for a flat.',
          },
        ]),
      );
      vi.mocked(getMyApplications).mockResolvedValue(pageOf([]));
      renderPage(user);

      expect(
        await screen.findByText('Your explanation to the applicant'),
      ).toBeTruthy();
      expect(screen.getByText('Not a good match for a flat.')).toBeTruthy();
    });
  });

  describe('pending applications', () => {
    it('shows how many await a decision and filters to them', async () => {
      vi.mocked(getPendingApplicationCount).mockResolvedValue(2);
      vi.mocked(getReceivedApplications).mockResolvedValue(
        pageOf([received('received-1', 'pending')]),
      );
      vi.mocked(getMyApplications).mockResolvedValue(pageOf([]));
      const router = renderPage(user, '/applications?receivedPage=3');

      expect(
        await screen.findByText(
          '2 applications are waiting for your decision.',
        ),
      ).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Show only these' }));

      await waitFor(() => {
        expect(getReceivedApplications).toHaveBeenLastCalledWith({
          page: 1,
          status: 'pending',
        });
      });
      expect(router.state.location.search).toBe('?receivedStatus=pending');

      fireEvent.click(
        await screen.findByRole('button', { name: 'Show all applications' }),
      );

      await waitFor(() => {
        expect(getReceivedApplications).toHaveBeenLastCalledWith({ page: 1 });
      });
      expect(router.state.location.search).toBe('');
    });

    it('shows no notice when nothing is pending', async () => {
      vi.mocked(getReceivedApplications).mockResolvedValue(
        pageOf([received('received-1', 'accepted')]),
      );
      vi.mocked(getMyApplications).mockResolvedValue(pageOf([]));
      renderPage(user);

      expect(await screen.findByText('Accepted')).toBeTruthy();
      expect(
        screen.queryByRole('button', { name: 'Show only these' }),
      ).toBeNull();
    });

    it('refreshes the count after a decision', async () => {
      vi.mocked(getPendingApplicationCount)
        .mockResolvedValueOnce(1)
        .mockResolvedValue(0);
      vi.mocked(getReceivedApplications).mockResolvedValue(
        pageOf([received('received-1', 'pending')]),
      );
      vi.mocked(getMyApplications).mockResolvedValue(pageOf([]));
      vi.mocked(runApplicationAction).mockResolvedValue(
        received('received-1', 'accepted'),
      );
      renderPage(user);

      expect(
        await screen.findByText('1 application is waiting for your decision.'),
      ).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
      fireEvent.click(screen.getByRole('button', { name: 'Yes, accept' }));

      await waitFor(() => {
        expect(
          screen.queryByText('1 application is waiting for your decision.'),
        ).toBeNull();
      });
      expect(getPendingApplicationCount).toHaveBeenCalledTimes(2);
    });
  });
});
