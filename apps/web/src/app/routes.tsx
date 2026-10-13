import type { RouteObject } from 'react-router';
import { Home } from './Home';
import { NotFound } from './NotFound';
import { Shell } from './Shell';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <Home /> },
      { path: '*', element: <NotFound /> },
    ],
  },
];
