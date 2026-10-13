import { Navigate, type RouteObject } from 'react-router';
import { Home } from './Home';
import { NotFound } from './NotFound';
import { RoomScreen } from './RoomScreen';
import { Shell } from './Shell';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <Home /> },
      { path: 'rooms/:roomId', element: <Navigate to="plan" replace /> },
      { path: 'rooms/:roomId/:view', element: <RoomScreen /> },
      { path: '*', element: <NotFound /> },
    ],
  },
];
