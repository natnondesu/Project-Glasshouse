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

it('creates Project → Site → Room and opens the room', async () => {
  const user = userEvent.setup();
  const router = createMemoryRouter(routes);
  render(<RouterProvider router={router} />);

  await user.click(screen.getByRole('button', { name: 'New project' }));
  expect(screen.getByRole('textbox', { name: 'Project name' })).toHaveFocus();
  await user.keyboard('Northgate{Enter}');
  await user.click(screen.getByRole('button', { name: 'Add site to Northgate' }));
  expect(screen.getByRole('textbox', { name: 'Site name' })).toHaveFocus();
  await user.keyboard('Site A{Enter}');
  await user.click(screen.getByRole('button', { name: 'Add room to Site A' }));
  expect(screen.getByRole('textbox', { name: 'Room name' })).toHaveFocus();
  await user.keyboard('MDF-1{Enter}');

  expect(router.state.location.pathname).toMatch(/^\/rooms\/.+\/plan$/);
  expect(screen.getByRole('link', { name: /MDF-1/ })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByText('R01 DRAFT')).toBeInTheDocument();
});

it('shows rename errors inline and deletes after confirmation', async () => {
  const user = userEvent.setup();
  useWorkspaceStore.getState().dispatch({ type: 'project/create', id: 'p', name: 'Northgate' });
  render(<RouterProvider router={createMemoryRouter(routes)} />);

  await user.click(screen.getByRole('button', { name: 'Rename Northgate' }));
  const input = screen.getByRole('textbox', { name: 'Project name' });
  await user.clear(input);
  await user.keyboard('{Enter}');
  expect(screen.getByRole('alert')).toHaveTextContent("Project name can't be empty.");
  await user.keyboard('{Escape}');

  await user.click(screen.getByRole('button', { name: 'Delete Northgate' }));
  await user.click(screen.getByRole('button', { name: 'Delete' }));
  expect(screen.queryByText('Northgate')).not.toBeInTheDocument();
});
