import { createObject, currentRevision, findRoom, type Rack, type Template } from '@glasshouse/domain';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it } from 'vitest';
import { routes } from '../../app/routes';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';

beforeEach(() => {
  resetWorkspaceStore();
  const s = useWorkspaceStore.getState();
  s.setLoad({ kind: 'ready' });
  const sw = { ...(s.workspace.catalog.find((x) => x.id === 'tpl-switch-1u') as Template), ports: [{ count: 4, prefix: 'Gi', start: 1, media: 'rj45' as const, speed: '1G' }] };
  s.dispatch({ type: 'project/create', id: 'p', name: 'P' });
  s.dispatch({ type: 'site/create', projectId: 'p', id: 's', name: 'Campus' });
  for (const room of ['mdf', 'idf']) {
    s.dispatch({ type: 'room/create', siteId: 's', id: room, floorAreaId: `fa-${room}`, name: room.toUpperCase() });
    s.dispatch({ type: 'plan', roomId: room, command: { type: 'object/add', object: { ...(createObject('rack', { x: 1, y: 1 }, []) as Rack), id: `${room}-rk`, name: 'RK-01' } } });
    s.dispatch({ type: 'plan', roomId: room, command: { type: 'device/place', id: `${room}-sw`, rackId: `${room}-rk`, bottomU: 40, template: sw } });
    s.dispatch({ type: 'plan', roomId: room, command: { type: 'device/update', id: `${room}-sw`, patch: { name: `${room.toUpperCase()}-SW` } } });
  }
});

const portOf = (room: string, name: string) =>
  (currentRevision(findRoom(useWorkspaceStore.getState().workspace, room)!.room.plan).content.objects[0] as Rack).devices[0]!.ports!.find((p) => p.name === name)!;

it('links a port to a port in another room of the site, sets the far end to point back, and unlinks both', async () => {
  const user = userEvent.setup();
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/mdf/elevation?sel=mdf-sw'] })} />);
  await user.click(screen.getByRole('button', { name: 'Manage ports' }));
  const mgr = screen.getByRole('dialog', { name: 'MDF-SW ports' });
  await user.click(within(mgr).getByRole('button', { name: 'Port Gi4, free' }));
  await user.click(within(mgr).getByRole('button', { name: 'Link to another room…' }));
  expect(within(mgr).getByText('Link to another room in Campus')).toBeInTheDocument();
  await user.click(within(mgr).getByRole('combobox', { name: 'Link to device' }));
  await user.click(within(mgr).getByRole('option', { name: /^IDF-SW, RK-01/ }));
  await user.selectOptions(within(mgr).getByLabelText('Port'), 'Gi1');
  await user.click(within(mgr).getByRole('button', { name: 'Link uplink' }));
  expect(portOf('mdf', 'Gi4').remote).toEqual({ roomId: 'idf', deviceId: 'idf-sw', port: 'Gi1' });
  expect(portOf('idf', 'Gi1').remote).toEqual({ roomId: 'mdf', deviceId: 'mdf-sw', port: 'Gi4' });
  expect(within(mgr).getByRole('button', { name: 'Port Gi4, uplink to IDF-SW Gi1 in IDF' })).toBeInTheDocument();
  expect(within(mgr).getByText('The far end points back.')).toBeInTheDocument();
  await user.click(within(mgr).getByRole('button', { name: 'Unlink uplink' }));
  expect(portOf('mdf', 'Gi4').remote).toBeUndefined();
  expect(portOf('idf', 'Gi1').remote).toBeUndefined();
});

it('does not offer an archived room as the far end of an uplink', async () => {
  const user = userEvent.setup();
  useWorkspaceStore.getState().dispatch({ type: 'room/archive', roomId: 'idf', by: '', at: '2026-10-18T00:00:00.000Z' });
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/mdf/elevation?sel=mdf-sw'] })} />);
  await user.click(screen.getByRole('button', { name: 'Manage ports' }));
  const mgr = screen.getByRole('dialog', { name: 'MDF-SW ports' });
  await user.click(within(mgr).getByRole('button', { name: 'Port Gi4, free' }));
  await user.click(within(mgr).getByRole('button', { name: 'Link to another room…' }));
  expect(within(mgr).queryByRole('combobox', { name: 'Link to device' })).toBeNull();
  expect(within(mgr).getByText(/no other room/i)).toBeInTheDocument();
});

it('unlinks this end of an uplink to a room that was archived since, leaving the archived room untouched', async () => {
  const user = userEvent.setup();
  const { dispatch } = useWorkspaceStore.getState();
  dispatch({ type: 'plan', roomId: 'mdf', command: { type: 'port/remote', deviceId: 'mdf-sw', name: 'Gi4', remote: { roomId: 'idf', deviceId: 'idf-sw', port: 'Gi1' } } });
  dispatch({ type: 'plan', roomId: 'idf', command: { type: 'port/remote', deviceId: 'idf-sw', name: 'Gi1', remote: { roomId: 'mdf', deviceId: 'mdf-sw', port: 'Gi4' } } });
  dispatch({ type: 'room/archive', roomId: 'idf', by: '', at: '2026-10-18T00:00:00.000Z' });
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/mdf/elevation?sel=mdf-sw'] })} />);
  await user.click(screen.getByRole('button', { name: 'Manage ports' }));
  const mgr = screen.getByRole('dialog', { name: 'MDF-SW ports' });
  await user.click(within(mgr).getByRole('button', { name: /^Port Gi4, uplink/ }));
  await user.click(within(mgr).getByRole('button', { name: 'Unlink uplink' }));
  expect(within(mgr).queryByRole('alert')).toBeNull();
  expect(portOf('mdf', 'Gi4').remote).toBeUndefined();
  expect(portOf('idf', 'Gi1').remote).toEqual({ roomId: 'mdf', deviceId: 'mdf-sw', port: 'Gi4' });
});
