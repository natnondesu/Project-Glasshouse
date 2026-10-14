import { createObject, currentRevision, findRoom, type Rack, type Template } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it } from 'vitest';
import { routes } from '../../app/routes';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';

const content = () => currentRevision(findRoom(useWorkspaceStore.getState().workspace, 'r')!.room.plan).content;

beforeEach(() => {
  localStorage.clear();
  resetWorkspaceStore();
  const s = useWorkspaceStore.getState();
  s.setLoad({ kind: 'ready' });
  const sw: Template = { ...(s.workspace.catalog.find((x) => x.id === 'tpl-switch-1u') as Template), ports: [{ count: 2, prefix: 'p', start: 1, media: 'rj45', speed: '1G' }] };
  s.dispatch({ type: 'project/create', id: 'p', name: 'P' });
  s.dispatch({ type: 'site/create', projectId: 'p', id: 's', name: 'S' });
  s.dispatch({ type: 'room/create', siteId: 's', id: 'r', name: 'R' });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'object/add', object: { ...(createObject('rack', { x: 1, y: 1 }, []) as Rack), id: 'rk', name: 'RK-01' } } });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'device/place', id: 'sw', rackId: 'rk', bottomU: 40, template: sw } });
});

it('adds VLANs, counts the ports that use them, renumbers and removes them', async () => {
  const user = userEvent.setup();
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/network'] })} />);
  expect(screen.getByRole('link', { name: 'Network' })).toHaveAttribute('aria-current', 'page');
  await user.type(screen.getByLabelText('New VLAN ID'), '10');
  await user.type(screen.getByLabelText('New VLAN name'), 'Servers');
  await user.click(screen.getByRole('button', { name: 'Add VLAN' }));
  expect(content().vlans).toEqual([{ vid: 10, name: 'Servers' }]);
  useWorkspaceStore.getState().dispatch({ type: 'plan', roomId: 'r', command: { type: 'port/vlan', deviceId: 'sw', name: 'p1', vlan: { mode: 'access', vid: 10 } } });
  expect(await screen.findByText('1 port')).toBeInTheDocument();
  const id = screen.getByLabelText('VLAN 10 ID');
  await user.clear(id);
  await user.type(id, '110{Enter}');
  expect(content().vlans).toEqual([{ vid: 110, name: 'Servers' }]);
  expect(screen.getByText('1 port')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Remove VLAN 110' }));
  expect(content().vlans).toEqual([]);
  expect(screen.getByText('No VLANs yet.')).toBeInTheDocument();
});

it('refuses a duplicate VLAN ID with a reason', async () => {
  const user = userEvent.setup();
  useWorkspaceStore.getState().dispatch({ type: 'plan', roomId: 'r', command: { type: 'vlan/add', vlan: { vid: 10, name: 'A' } } });
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/network'] })} />);
  await user.type(screen.getByLabelText('New VLAN ID'), '10{Enter}');
  expect(screen.getByRole('alert')).toHaveTextContent('VLAN 10 already exists.');
});
