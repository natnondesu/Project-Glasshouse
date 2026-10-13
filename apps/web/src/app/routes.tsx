import { Navigate, type RouteObject } from 'react-router';
import { CatalogScreen } from '../features/catalog/CatalogScreen';
import { InstallSheet } from '../features/sheet/InstallSheet';
import { Home } from './Home';
import { NotFound } from './NotFound';
import { RoomScreen } from './RoomScreen';
import { Shell } from './Shell';

export const routes: RouteObject[] = [
  // Outside the Shell: a plain document that prints cleanly at A4.
  { path: '/rooms/:roomId/install-sheet', element: <InstallSheet /> },
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <Home /> },
      { path: 'rooms/:roomId', element: <Navigate to="plan" replace /> },
      { path: 'rooms/:roomId/:view', element: <RoomScreen /> },
      { path: 'catalog', element: <CatalogScreen /> },
      { path: '*', element: <NotFound /> },
    ],
  },
];
