import { createBrowserRouter } from 'react-router-dom';

import { PetsPage } from '../features/pets/pages/pets-page';

export const router: ReturnType<typeof createBrowserRouter> =
  createBrowserRouter([
    {
      path: '/pets',
      element: <PetsPage />,
    },
  ]);
