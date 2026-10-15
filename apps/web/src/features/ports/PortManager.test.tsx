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

it('sets a port to access or trunk using the room VLANs, and tags the jack', async () => {
  const user = userEvent.setup();
  const s = useWorkspaceStore.getState();
  for (const [vid, name] of [[10, 'Servers'], [99, 'Mgmt']] as const) s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'vlan/add', vlan: { vid, name } } });
  open('sw');
  await user.click(screen.getByRole('button', { name: 'Manage ports' }));
  const mgr = screen.getByRole('dialog', { name: 'SW-01 ports' });
  const vlan = within(mgr).getByRole('group', { name: 'VLAN' });
  await user.selectOptions(within(vlan).getByLabelText('Mode'), 'access');
  expect(content().objects.flatMap((o) => (o.type === 'rack' ? o.devices : [])).find((d) => d.id === 'sw')!.ports![0]!.vlan).toEqual({ mode: 'access', vid: 10 });
  expect(within(mgr).getByRole('button', { name: /^Port Gi1,/ })).toHaveTextContent('10');
  await user.selectOptions(within(vlan).getByLabelText('Mode'), 'trunk');
  await user.click(within(vlan).getByLabelText('All VLANs'));
  await user.click(within(vlan).getByLabelText('99 · Mgmt'));
  await user.selectOptions(within(vlan).getByLabelText('Native VLAN'), '10');
  expect(content().objects.flatMap((o) => (o.type === 'rack' ? o.devices : [])).find((d) => d.id === 'sw')!.ports![0]!.vlan).toEqual({ mode: 'trunk', allowed: [10], native: 10 });
});

it('points to the Network tab when the room has no VLANs', async () => {
  const user = userEvent.setup();
  open('sw');
  await user.click(screen.getByRole('button', { name: 'Manage ports' }));
  expect(screen.getByRole('link', { name: 'Add VLANs on the Network tab' })).toHaveAttribute('href', '/rooms/r/network');
});

it('groups two ports into a LAG and says the VLAN setting is shared', async () => {
  const user = userEvent.setup();
  open('sw');
  await user.click(screen.getByRole('button', { name: 'Manage ports' }));
  const mgr = screen.getByRole('dialog', { name: 'SW-01 ports' });
  for (const n of ['1', '2']) {
    await user.click(within(mgr).getAllByRole('button', { name: /^Port / })[Number(n) - 1]!);
    const field = within(mgr).getByLabelText('LAG');
    await user.clear(field);
    await user.type(field, 'Po1{Enter}');
  }
  expect(within(mgr).getByText('Po1: 2 ports. The VLAN setting below applies to all of them.')).toBeInTheDocument();
  const sw = content().objects.flatMap((o) => (o.type === 'rack' ? o.devices : [])).find((d) => d.id === 'sw')!;
  expect(sw.ports!.filter((p) => p.lag === 'Po1').map((p) => p.name)).toEqual(['Gi1', 'Gi2']);
});

it('sets the VLAN on every member of a LAG from one port’s VLAN field', async () => {
  const user = userEvent.setup();
  useWorkspaceStore.getState().dispatch({ type: 'plan', roomId: 'r', command: { type: 'vlan/add', vlan: { vid: 10, name: 'Servers' } } });
  for (const n of ['Gi1', 'Gi2']) useWorkspaceStore.getState().dispatch({ type: 'plan', roomId: 'r', command: { type: 'port/update', deviceId: 'sw', name: n, patch: { lag: 'Po1' } } });
  open('sw');
  await user.click(screen.getByRole('button', { name: 'Manage ports' }));
  const mgr = screen.getByRole('dialog', { name: 'SW-01 ports' });
  await user.click(within(mgr).getAllByRole('button', { name: /^Port / })[0]!);
  await user.selectOptions(within(mgr).getByLabelText('Mode'), 'access');
  const sw = content().objects.flatMap((o) => (o.type === 'rack' ? o.devices : [])).find((d) => d.id === 'sw')!;
  expect(sw.ports!.filter((p) => p.name === 'Gi1' || p.name === 'Gi2').map((p) => p.vlan)).toEqual([
    { mode: 'access', vid: 10 },
    { mode: 'access', vid: 10 },
  ]);
  expect(sw.ports!.find((p) => p.name === 'Gi3')!.vlan).toBeUndefined();
});
