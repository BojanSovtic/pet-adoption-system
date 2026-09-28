import { createBrowserRouter, Outlet } from 'react-router-dom';

import { AppShell } from './app-shell';
import { PetsPage } from '../features/pets/pages/pets-page';
import { PetDetailsPage } from '@/features/pets/pages/pet-details-page';

const AppLayout = () => {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
};

export const router: ReturnType<typeof createBrowserRouter> =
  createBrowserRouter([
    {
      element: <AppLayout />,
      children: [
        {
          path: '/pets',
          element: <PetsPage />,
        },
        { path: '/pets/:id', element: <PetDetailsPage /> },
      ],
    },
  ]);
