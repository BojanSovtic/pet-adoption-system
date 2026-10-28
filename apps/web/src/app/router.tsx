import {
  createBrowserRouter,
  Navigate,
  Outlet,
  type RouteObject,
} from 'react-router-dom';

import { AppShell } from './app-shell';
import { NotFoundPage } from './not-found-page';
import { AdminLayout } from '../features/admin/components/admin-layout';
import { AdminApplicationsPage } from '../features/admin/pages/admin-applications-page';
import { AdminAuditPage } from '../features/admin/pages/admin-audit-page';
import { AdminDashboardPage } from '../features/admin/pages/admin-dashboard-page';
import { AdminPetsPage } from '../features/admin/pages/admin-pets-page';
import { AdminUsersPage } from '../features/admin/pages/admin-users-page';
import { ApplicationsPage } from '../features/applications/pages/applications-page';
import { LoginPage } from '../features/auth/pages/login-page';
import { RegisterPage } from '../features/auth/pages/register-page';
import { PetsPage } from '../features/pets/pages/pets-page';
import { PetDetailsPage } from '@/features/pets/pages/pet-details-page';
import { PetFormPage } from '../features/pets/pages/pet-form-page';

const AppLayout = () => {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
};

// Exported separately so tests can mount the same routes in a memory router.
export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <Navigate to="/pets" replace />,
      },
      {
        path: '/pets',
        element: <PetsPage />,
      },
      { path: '/pets/:id', element: <PetDetailsPage /> },
      {
        path: '/pets/new',
        element: <PetFormPage />,
      },
      {
        path: '/pets/:id/edit',
        element: <PetFormPage />,
      },
      { path: '/applications', element: <ApplicationsPage /> },
      {
        // AdminLayout checks the role; the API enforces it on every request.
        path: '/admin',
        element: <AdminLayout />,
        children: [
          { index: true, element: <AdminDashboardPage /> },
          { path: 'users', element: <AdminUsersPage /> },
          { path: 'pets', element: <AdminPetsPage /> },
          { path: 'applications', element: <AdminApplicationsPage /> },
          { path: 'audit', element: <AdminAuditPage /> },
        ],
      },
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
];

export const router: ReturnType<typeof createBrowserRouter> =
  createBrowserRouter(routes);
