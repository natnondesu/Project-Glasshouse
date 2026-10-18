import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { expect, it } from 'vitest';
import { routes } from './routes';

it('renders the shell with the Glasshouse lockup, linking home', () => {
  render(<RouterProvider router={createMemoryRouter(routes)} />);
  const home = screen.getByRole('link', { name: 'Glasshouse' });
  expect(home).toHaveAttribute('href', '/');
  expect(within(home).getByRole('img', { name: 'Glasshouse' })).toHaveAttribute('src', '/brand/glasshouse-lockup-horizontal-color.svg');
});
