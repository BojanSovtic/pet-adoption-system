import {
  createBrowserRouter,
  Navigate,
  Outlet,
  type RouteObject,
} from 'react-router-dom';

import { AppShell } from './app-shell';
import { NotFoundPage } from './not-found-page';
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
