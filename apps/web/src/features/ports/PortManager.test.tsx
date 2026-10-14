import { createObject, findRoom, currentRevision, type Rack, type Template } from '@glasshouse/domain';
import { render, screen, within } from '@testing-library/react';
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
  const base = (id: string) => s.workspace.catalog.find((x) => x.id === id) as Template;
  const sw: Template = { ...base('tpl-switch-1u'), ports: [{ count: 4, prefix: 'Gi', start: 1, media: 'rj45', speed: '1G' }, { count: 2, prefix: 'Te', start: 1, media: 'sfp_plus', speed: '10G' }] };
  const srv: Template = { ...base('tpl-server-2u'), ports: [{ count: 1, prefix: 'eth', start: 0, media: 'rj45', speed: '1G' }] };
  s.dispatch({ type: 'project/create', id: 'p', name: 'P' });
  s.dispatch({ type: 'site/create', projectId: 'p', id: 's', name: 'S' });
  s.dispatch({ type: 'room/create', siteId: 's', id: 'r', name: 'R' });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'object/add', object: { ...(createObject('rack', { x: 1, y: 1 }, []) as Rack), id: 'rk', name: 'RK-01' } } });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'device/place', id: 'sw', rackId: 'rk', bottomU: 40, template: sw } });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'device/place', id: 'srv', rackId: 'rk', bottomU: 1, template: srv } });
});

const open = (id: string) => render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [`/rooms/r/elevation?sel=${id}`] })} />);

it('shows a device’s ports in its inspector and opens the port manager', async () => {
  const user = userEvent.setup();
  open('sw');
  expect(screen.getByRole('group', { name: 'Network ports' })).toHaveTextContent('6 ports · 0 linked');
  await user.click(screen.getByRole('button', { name: 'Manage ports' }));
  const mgr = screen.getByRole('dialog', { name: 'SW-01 ports' });
  expect(within(mgr).getAllByRole('button', { name: /^Port / })).toHaveLength(6);
});

it('links a server NIC to a switch port, labels the cable, then unlinks it', async () => {
  const user = userEvent.setup();
  open('srv');
  await user.click(screen.getByRole('button', { name: 'Manage ports' }));
  const mgr = screen.getByRole('dialog', { name: 'SRV-01 ports' });
  await user.click(within(mgr).getByRole('button', { name: 'Port eth0, free' }));
  await user.selectOptions(within(mgr).getByLabelText('Link to device'), 'sw');
  await user.selectOptions(within(mgr).getByLabelText('Link to port'), 'Gi3');
  await user.click(within(mgr).getByRole('button', { name: 'Link' }));
  expect(content().links).toMatchObject([{ a: { deviceId: 'srv', port: 'eth0' }, b: { deviceId: 'sw', port: 'Gi3' } }]);
  expect(within(mgr).getByRole('button', { name: 'Port eth0, linked to SW-01 Gi3' })).toBeInTheDocument();
  await user.type(within(mgr).getByLabelText('Cable label'), 'C-001');
  await user.tab();
  await user.selectOptions(within(mgr).getByLabelText('Cable type'), 'cat6');
  expect(content().links[0]).toMatchObject({ label: 'C-001', cable: 'cat6' });
  await user.click(within(mgr).getByRole('button', { name: 'Unlink' }));
  expect(content().links).toEqual([]);
});

it('adds and renames ports on one device without touching its template', async () => {
  const user = userEvent.setup();
  open('srv');
  await user.click(screen.getByRole('button', { name: 'Manage ports' }));
  const mgr = screen.getByRole('dialog', { name: 'SRV-01 ports' });
  await user.click(within(mgr).getByRole('button', { name: 'Add port' }));
  expect(within(mgr).getByRole('button', { name: 'Port eth1, free' })).toBeInTheDocument();
  await user.click(within(mgr).getByRole('button', { name: 'Port eth1, free' }));
  const name = within(mgr).getByLabelText('Port name');
  await user.clear(name);
  await user.type(name, 'ipmi{Enter}');
  expect(within(mgr).getByRole('button', { name: 'Port ipmi, free' })).toBeInTheDocument();
  expect(useWorkspaceStore.getState().workspace.catalog.find((t) => t.id === 'tpl-server-2u')?.ports).toBeUndefined();
});

it('links to a device without ports by creating one as part of the link', async () => {
  const user = userEvent.setup();
  const s = useWorkspaceStore.getState();
  const plain = s.workspace.catalog.find((x) => x.id === 'tpl-server-2u') as Template;
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'device/place', id: 'bare', rackId: 'rk', bottomU: 10, template: plain } });
  open('sw');
  await user.click(screen.getByRole('button', { name: 'Manage ports' }));
  const mgr = screen.getByRole('dialog', { name: 'SW-01 ports' });
  await user.click(within(mgr).getByRole('button', { name: 'Port Gi1, free' }));
  await user.selectOptions(within(mgr).getByLabelText('Link to device'), 'bare');
  expect(within(within(mgr).getByLabelText('Link to port')).getByRole('option', { name: 'New port: eth0' })).toBeInTheDocument();
  await user.selectOptions(within(mgr).getByLabelText('Link to port'), 'New port: eth0');
  await user.click(within(mgr).getByRole('button', { name: 'Link' }));
  expect(content().links).toMatchObject([{ a: { deviceId: 'sw', port: 'Gi1' }, b: { deviceId: 'bare', port: 'eth0' } }]);
});
