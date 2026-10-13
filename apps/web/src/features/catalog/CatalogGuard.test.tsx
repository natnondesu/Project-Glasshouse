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

it('asks before throwing away unsaved template edits', async () => {
  const user = userEvent.setup();
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/catalog'] })} />);
  await user.click(screen.getByRole('button', { name: /^Server 2U/ }));
  await user.type(screen.getByLabelText('Default configuration'), '2× CPU');
  await user.click(screen.getByRole('button', { name: /^Server 4U/ }));
  const confirm = screen.getByRole('group', { name: 'Unsaved changes' });
  expect(confirm).toHaveTextContent('Discard your changes to Server 2U?');
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Default configuration')).toHaveValue('2× CPU');
  await user.click(screen.getByRole('button', { name: /^Server 4U/ }));
  await user.click(screen.getByRole('button', { name: 'Discard changes and continue' }));
  expect(screen.getByRole('heading', { name: 'Server 4U' })).toBeInTheDocument();
});
