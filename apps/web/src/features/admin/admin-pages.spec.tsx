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
import {
  DEFAULT_PET_PROFILE,
  type AdminApplication,
  type AdminAuditEntry,
  type AdminPet,
  type AdminStats,
  type AdminUser,
  type User,
} from '@pet-adoption/models';

import '../../i18n/config';
import { ApiError } from '../../lib/api-client';
import { pageOf } from '../../lib/testing/page-of';
import { getCurrentUser } from '../auth/api/get-current-user';
import { UserMenu } from '../auth/components/user-menu';
import {
  getAdminApplications,
  getAdminAudit,
  getAdminPets,
  getAdminStats,
  getAdminUsers,
  hidePet,
  reinstateUser,
  restorePet,
  suspendUser,
  updateUserRole,
} from './api/admin';
import { AdminLayout } from './components/admin-layout';
import { AdminApplicationsPage } from './pages/admin-applications-page';
import { AdminAuditPage } from './pages/admin-audit-page';
import { AdminDashboardPage } from './pages/admin-dashboard-page';
import { AdminPetsPage } from './pages/admin-pets-page';
import { AdminUsersPage } from './pages/admin-users-page';

vi.mock('./api/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api/admin')>()),
  getAdminStats: vi.fn(),
  getAdminUsers: vi.fn(),
  getAdminApplications: vi.fn(),
  getAdminPets: vi.fn(),
  getAdminAudit: vi.fn(),
  updateUserRole: vi.fn(),
  suspendUser: vi.fn(),
  reinstateUser: vi.fn(),
  hidePet: vi.fn(),
  restorePet: vi.fn(),
}));

vi.mock('../auth/api/get-current-user', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../auth/api/get-current-user')>()),
  getCurrentUser: vi.fn(),
}));

const makeUser = (id: string, role: User['role']): User => ({
  _id: id,
  email: `${id}@example.com`,
  name: id,
  role,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const admin = makeUser('admin-1', 'admin');
const member = makeUser('member-1', 'user');

const adminUser = (user: User): AdminUser => ({
  ...user,
  petCount: 2,
  applicationCount: 1,
  suspendedAt: null,
});

const stats: AdminStats = {
  users: { total: 4, admins: 1, suspended: 0 },
  pets: { total: 14, hidden: 0, available: 9, pending: 3, adopted: 2 },
  applications: {
    total: 13,
    pending: 5,
    accepted: 2,
    rejected: 4,
    withdrawn: 2,
  },
  recentActivity: [
    {
      _id: 'audit-1',
      seq: 1,
      action: 'user.role.changed',
      outcome: 'succeeded',
      actor: null,
      targetUser: {
        _id: 'admin-1',
        name: 'admin-1',
        email: 'admin-1@example.com',
      },
      targetPet: null,
      metadata: { from: 'user', to: 'admin' },
      source: 'cli',
      createdAt: '2026-01-02T00:00:00.000Z',
    },
  ],
};

const renderAt = (path: string, currentUser: User | null) => {
  vi.mocked(getCurrentUser).mockResolvedValue(currentUser);

  const router = createMemoryRouter(
    [
      {
        path: '/admin',
        element: <AdminLayout />,
        children: [
          { index: true, element: <AdminDashboardPage /> },
          { path: 'users', element: <AdminUsersPage /> },
          { path: 'applications', element: <AdminApplicationsPage /> },
          { path: 'pets', element: <AdminPetsPage /> },
          { path: 'audit', element: <AdminAuditPage /> },
        ],
      },
      { path: '/menu', element: <UserMenu /> },
      { path: '/login', element: <p>Login page</p> },
      { path: '/pets', element: <p>Pets page</p> },
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

describe('admin navigation', () => {
  it('shows the Admin link only to admins', async () => {
    renderAt('/menu', admin);
    expect(await screen.findByRole('link', { name: 'Admin' })).toBeTruthy();
  });

  it('hides the Admin link from ordinary users', async () => {
    renderAt('/menu', member);
    await screen.findByRole('link', { name: 'Applications' });
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
  });
});

describe('AdminLayout access', () => {
  beforeEach(() => {
    vi.mocked(getAdminStats).mockReset().mockResolvedValue(stats);
  });

  it('sends signed-out visitors to the login page', async () => {
    const router = renderAt('/admin', null);

    expect(await screen.findByText('Login page')).toBeTruthy();
    expect(router.state.location.state).toEqual({ from: '/admin' });
  });

  it('shows a forbidden page to non-admins and loads no admin data', async () => {
    renderAt('/admin/users', member);

    expect(
      await screen.findByRole('heading', { name: 'Admins only' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to pets' })).toBeTruthy();
    expect(getAdminStats).not.toHaveBeenCalled();
    expect(getAdminUsers).not.toHaveBeenCalled();
  });

  it('shows the sections to admins', async () => {
    renderAt('/admin', admin);

    const nav = await screen.findByRole('navigation', {
      name: 'Administration sections',
    });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Overview', 'Users', 'Pets', 'Applications', 'Audit log']);
    expect(
      within(nav)
        .getByRole('link', { name: 'Overview' })
        .getAttribute('aria-current'),
    ).toBe('page');
  });
});

describe('AdminDashboardPage', () => {
  beforeEach(() => {
    vi.mocked(getAdminStats).mockReset();
  });

  it('announces loading, then shows the counts and recent activity', async () => {
    let resolve: (value: AdminStats) => void = () => undefined;
    vi.mocked(getAdminStats).mockReturnValue(
      new Promise((done) => (resolve = done)),
    );
    renderAt('/admin', admin);

    expect(await screen.findByRole('status')).toBeTruthy();
    resolve(stats);

    expect(await screen.findByText('14')).toBeTruthy();
    // Breakdown rows read "label count" (e.g. "Admins 1").
    const row = (text: string) =>
      screen.getByText(
        (_, element) =>
          element?.tagName === 'LI' && element.textContent === text,
      );
    expect(row('Admins 1')).toBeTruthy();
    expect(row('Suspended 0')).toBeTruthy();
    expect(row('Hidden 0')).toBeTruthy();
    expect(
      screen.getByText('The command line changed admin-1 from User to Admin'),
    ).toBeTruthy();
  });

  it('shows an error with a retry', async () => {
    vi.mocked(getAdminStats)
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR'))
      .mockResolvedValueOnce(stats);
    renderAt('/admin', admin);

    expect(
      await screen.findByText(
        'The server could not be reached. Check your connection and try again.',
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('14')).toBeTruthy();
  });
});

describe('AdminUsersPage', () => {
  beforeEach(() => {
    vi.mocked(getAdminUsers).mockReset();
    vi.mocked(updateUserRole).mockReset();
  });

  it('lists users and never offers to change your own role', async () => {
    vi.mocked(getAdminUsers).mockResolvedValue(
      pageOf([adminUser(admin), adminUser(member)]),
    );
    renderAt('/admin/users', admin);

    expect(await screen.findByText('member-1@example.com')).toBeTruthy();
    expect(screen.getByText('2 users')).toBeTruthy();
    expect(
      screen.getByText("You can't change or suspend your own account."),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: /Remove admin: admin-1/ }),
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Make admin: member-1' }),
    ).toBeTruthy();
  });

  it('shows the empty state', async () => {
    vi.mocked(getAdminUsers).mockResolvedValue(pageOf([]));
    renderAt('/admin/users?search=nobody', admin);

    expect(
      await screen.findByText('No users match these filters.'),
    ).toBeTruthy();
    expect(vi.mocked(getAdminUsers).mock.lastCall?.[0]).toMatchObject({
      search: 'nobody',
    });
  });

  it('asks before changing a role, and can be cancelled', async () => {
    vi.mocked(getAdminUsers).mockResolvedValue(pageOf([adminUser(member)]));
    vi.mocked(updateUserRole).mockResolvedValue({ ...member, role: 'admin' });
    renderAt('/admin/users', admin);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Make admin: member-1' }),
    );

    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(document.activeElement).toBe(cancel);
    expect(screen.getByText(/Give member-1 admin access\?/)).toBeTruthy();
    fireEvent.click(cancel);
    expect(updateUserRole).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: 'Make admin: member-1' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Yes, change role' }));

    await waitFor(() => {
      expect(updateUserRole).toHaveBeenCalledWith('member-1', {
        role: 'admin',
      });
    });
  });

  it('filters by role through the URL', async () => {
    vi.mocked(getAdminUsers).mockResolvedValue(pageOf([adminUser(admin)]));
    const router = renderAt('/admin/users?page=2', admin);
    await screen.findByText('admin-1@example.com');

    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by role' }), {
      target: { value: 'admin' },
    });

    await waitFor(() => {
      expect(router.state.location.search).toBe('?role=admin');
    });
    expect(vi.mocked(getAdminUsers).mock.lastCall?.[0]).toMatchObject({
      role: 'admin',
      page: 1,
    });
  });
});

describe('AdminApplicationsPage', () => {
  it('shows who applied for which pet, filtered by status', async () => {
    const application: AdminApplication = {
      _id: 'application-1',
      status: 'pending',
      pet: { _id: 'pet-1', name: 'Luna', species: 'cat', status: 'pending' },
      applicant: { _id: 'u2', name: 'Jelena', email: 'jelena@example.com' },
      owner: { _id: 'u1', name: 'Ana', email: 'ana@example.com' },
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    vi.mocked(getAdminApplications).mockResolvedValue(pageOf([application]));
    renderAt('/admin/applications?status=pending', admin);

    expect(await screen.findByRole('link', { name: 'Luna' })).toBeTruthy();
    expect(screen.getByText('Jelena (jelena@example.com)')).toBeTruthy();
    expect(screen.getByText('Ana (ana@example.com)')).toBeTruthy();
    expect(vi.mocked(getAdminApplications).mock.lastCall?.[0]).toMatchObject({
      status: 'pending',
    });
  });
});

describe('user suspension in the admin area', () => {
  beforeEach(() => {
    vi.mocked(getAdminUsers).mockReset();
    vi.mocked(suspendUser).mockReset();
    vi.mocked(reinstateUser).mockReset();
  });

  it('offers suspension only for non-admins, and sends the optional reason', async () => {
    const otherAdmin = makeUser('admin-2', 'admin');
    vi.mocked(getAdminUsers).mockResolvedValue(
      pageOf([adminUser(otherAdmin), adminUser(member)]),
    );
    vi.mocked(suspendUser).mockResolvedValue(member);
    renderAt('/admin/users', admin);

    await screen.findByText('member-1@example.com');
    // Admins must be demoted before they can be suspended.
    expect(
      screen.queryByRole('button', { name: 'Suspend: admin-2' }),
    ).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Suspend: member-1' }));
    expect(screen.getByText(/They are signed out at once/)).toBeTruthy();
    fireEvent.change(
      screen.getByLabelText('Reason (optional, kept in the audit log)'),
      { target: { value: '  Spam listings  ' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Yes, suspend' }));

    await waitFor(() => {
      expect(suspendUser).toHaveBeenCalledWith('member-1', {
        reason: 'Spam listings',
      });
    });
  });

  it('shows suspended users with a badge, a reinstate action and no promotion', async () => {
    vi.mocked(getAdminUsers).mockResolvedValue(
      pageOf([
        { ...adminUser(member), suspendedAt: '2026-01-05T00:00:00.000Z' },
      ]),
    );
    vi.mocked(reinstateUser).mockResolvedValue(member);
    renderAt('/admin/users?status=suspended', admin);

    expect(
      await screen.findByText('Suspended', { selector: '[data-slot="badge"]' }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Make admin: member-1' }),
    ).toBeNull();
    expect(vi.mocked(getAdminUsers).mock.lastCall?.[0]).toMatchObject({
      status: 'suspended',
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Reinstate: member-1' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Yes, reinstate' }));

    await waitFor(() => expect(reinstateUser).toHaveBeenCalledWith('member-1'));
  });
});

describe('listing moderation in the admin area', () => {
  const adminPet = (overrides: Partial<AdminPet> = {}): AdminPet => ({
    _id: 'pet-1',
    owner: 'member-1',
    name: 'Luna',
    species: 'cat',
    age: 2,
    description: 'A cat.',
    status: 'available',
    ...DEFAULT_PET_PROFILE,
    hidden: false,
    hiddenAt: null,
    imageUrl: null,
    images: [],
    ownerDetails: {
      _id: 'member-1',
      name: 'member-1',
      email: 'member-1@example.com',
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  });

  beforeEach(() => {
    vi.mocked(hidePet).mockReset();
    vi.mocked(restorePet).mockReset();
  });

  it('hides a visible listing after confirmation', async () => {
    vi.mocked(getAdminPets).mockResolvedValue(pageOf([adminPet()]));
    vi.mocked(hidePet).mockResolvedValue({ ...adminPet(), hidden: true });
    renderAt('/admin/pets', admin);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Hide listing: Luna' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Yes, hide' }));

    await waitFor(() => {
      expect(hidePet).toHaveBeenCalledWith('pet-1', { reason: undefined });
    });
  });

  it('shows hidden listings with a badge and restores them', async () => {
    vi.mocked(getAdminPets).mockResolvedValue(
      pageOf([
        adminPet({ hidden: true, hiddenAt: '2026-01-03T00:00:00.000Z' }),
      ]),
    );
    vi.mocked(restorePet).mockResolvedValue(adminPet());
    renderAt('/admin/pets?visibility=hidden', admin);

    expect(
      await screen.findByText('Hidden', { selector: '[data-slot="badge"]' }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Restore listing: Luna' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Yes, restore' }));

    await waitFor(() => expect(restorePet).toHaveBeenCalledWith('pet-1'));
    expect(vi.mocked(getAdminPets).mock.lastCall?.[0]).toMatchObject({
      visibility: 'hidden',
    });
  });
});

describe('AdminAuditPage', () => {
  const entry = (overrides: Partial<AdminAuditEntry>): AdminAuditEntry => ({
    _id: 'entry',
    seq: 1,
    action: 'user.suspended',
    outcome: 'succeeded',
    actor: { _id: 'admin-1', name: 'Ana', email: 'ana@example.com' },
    targetUser: { _id: 'member-1', name: 'Marko', email: 'm@example.com' },
    targetPet: null,
    metadata: {},
    source: 'admin-ui',
    createdAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  });

  it('describes changes, refusals and list views in words', async () => {
    vi.mocked(getAdminAudit).mockResolvedValue(
      pageOf([
        entry({ _id: 'a', seq: 3, metadata: { reason: 'Spam' } }),
        entry({
          _id: 'b',
          seq: 2,
          action: 'user.role.changed',
          outcome: 'denied',
          metadata: { from: 'admin', to: 'user', code: 'LAST_ADMIN' },
        }),
        entry({
          _id: 'c',
          seq: 1,
          action: 'users.viewed',
          targetUser: null,
          metadata: { page: 2, resultCount: 20, search: true },
        }),
      ]),
    );
    renderAt('/admin/audit?action=user.suspended', admin);

    expect(await screen.findByText('Ana suspended Marko')).toBeTruthy();
    expect(screen.getByText('Reason: Spam')).toBeTruthy();
    expect(screen.getByText('Refused')).toBeTruthy();
    expect(
      screen.getByText(
        'This is the last administrator. Make someone else an administrator first.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Ana viewed the user list')).toBeTruthy();
    expect(screen.getByText('page 2, 20 rows')).toBeTruthy();
    expect(vi.mocked(getAdminAudit).mock.lastCall?.[0]).toMatchObject({
      action: 'user.suspended',
    });
  });

  it('shows the empty state', async () => {
    vi.mocked(getAdminAudit).mockResolvedValue(pageOf([]));
    renderAt('/admin/audit', admin);

    expect(
      await screen.findByText('No entries match this filter.'),
    ).toBeTruthy();
  });
});
