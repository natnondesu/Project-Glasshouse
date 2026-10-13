import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { expect, it } from 'vitest';
import { routes } from './routes';

it('renders the shell with the Glasshouse wordmark', () => {
  render(<RouterProvider router={createMemoryRouter(routes)} />);
  expect(screen.getByText('Glasshouse')).toBeInTheDocument();
});
