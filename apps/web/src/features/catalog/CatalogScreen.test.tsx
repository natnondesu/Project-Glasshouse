import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it } from 'vitest';
import { routes } from '../../app/routes';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';

const catalog = () => useWorkspaceStore.getState().workspace.catalog;
const open = () => render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/catalog'] })} />);

beforeEach(() => {
  resetWorkspaceStore();
  useWorkspaceStore.getState().setLoad({ kind: 'ready' });
});

it('edits a template only when Save is pressed', async () => {
  const user = userEvent.setup();
  open();
  await user.click(screen.getByRole('button', { name: /^Server 2U/ }));
  const watts = screen.getByLabelText('Demand in watts');
  await user.clear(watts);
  await user.type(watts, '500');
  expect(catalog().find((t) => t.id === 'tpl-server-2u')?.demand).toEqual({ kind: 'known', watts: 450 });
  await user.click(screen.getByRole('button', { name: 'Save template' }));
  expect(catalog().find((t) => t.id === 'tpl-server-2u')).toMatchObject({ version: 2, illustrative: false, demand: { watts: 500 } });
});

it('creates a template, shows save errors, and deletes after confirmation', async () => {
  const user = userEvent.setup();
  open();
  await user.click(screen.getByRole('button', { name: 'New template' }));
  await user.click(screen.getByRole('button', { name: 'Save template' }));
  expect(screen.getByRole('alert')).toHaveTextContent("Template name can't be empty.");
  await user.type(screen.getByLabelText('Name'), 'GPU node 4U');
  const height = screen.getByLabelText('Height');
  await user.clear(height);
  await user.type(height, '4');
  await user.click(screen.getByRole('button', { name: 'Save template' }));
  expect(catalog().find((t) => t.label === 'GPU node 4U')).toMatchObject({ heightU: 4, version: 1 });
  await user.click(screen.getByRole('button', { name: 'Delete template' }));
  await user.click(screen.getByRole('button', { name: 'Delete' }));
  expect(catalog().some((t) => t.label === 'GPU node 4U')).toBe(false);
});

it('restores missing default templates', async () => {
  const user = userEvent.setup();
  useWorkspaceStore.getState().dispatch({ type: 'template/delete', id: 'tpl-node' });
  open();
  await user.click(screen.getByRole('button', { name: 'Add 1 default template' }));
  expect(catalog().some((t) => t.id === 'tpl-node')).toBe(true);
});
