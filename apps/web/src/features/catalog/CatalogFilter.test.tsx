import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it } from 'vitest';
import { routes } from '../../app/routes';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';

beforeEach(() => {
  resetWorkspaceStore();
  useWorkspaceStore.getState().setLoad({ kind: 'ready' });
});

it('filters the Catalog screen list too', async () => {
  const user = userEvent.setup();
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/catalog'] })} />);
  const catalog = useWorkspaceStore.getState().workspace.catalog;
  const one = catalog[0]!;
  await user.type(screen.getByRole('searchbox', { name: 'Filter catalog' }), one.label);
  const matching = catalog.filter((t) => t.label.toLowerCase().includes(one.label.toLowerCase()));
  expect(screen.getByRole('status')).toHaveTextContent(`${matching.length} of ${catalog.length} templates`);
  expect(screen.getByRole('button', { name: new RegExp(one.label) })).toBeInTheDocument();
});
