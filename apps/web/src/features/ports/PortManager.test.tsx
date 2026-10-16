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
  await user.type(within(mgr).getByRole('combobox', { name: 'Link to device' }), 'sw');
  await user.click(within(mgr).getByRole('option', { name: 'SW-01, RK-01, 6 free' }));
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
  await user.type(within(mgr).getByRole('combobox', { name: 'Link to device' }), 'srv-02');
  await user.click(within(mgr).getByRole('option', { name: /^SRV-02, RK-01, No free port/ }));
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

it('finds the far device by typing any part of its name or rack, and says how many ports are free', async () => {
  const user = userEvent.setup();
  open('srv');
  await user.click(screen.getByRole('button', { name: 'Manage ports' }));
  const mgr = screen.getByRole('dialog', { name: 'SRV-01 ports' });
  await user.click(within(mgr).getByRole('button', { name: 'Port eth0, free' }));
  const box = within(mgr).getByRole('combobox', { name: 'Link to device' });
  await user.click(box);
  // Focus lists everything, like the dropdown it replaces; eth0 itself doesn't count as free.
  const options = () => within(within(mgr).getByRole('listbox', { name: 'Link to device' })).getAllByRole('option');
  expect(options().map((o) => o.getAttribute('aria-label'))).toEqual(['SW-01, RK-01, 6 free', 'SRV-01, RK-01, No free port · adds one']);
  await user.type(box, 'rk-01 sw');
  expect(options()).toHaveLength(1);
  await user.keyboard('{Enter}');
  expect(box).toHaveValue('SW-01 · RK-01');
  expect(within(mgr).getByLabelText('Link to port')).toBeEnabled();
  await user.clear(box);
  await user.type(box, 'nothing like it');
  expect(within(mgr).getByRole('status')).toHaveTextContent('No device matches “nothing like it”.');
  expect(within(mgr).getByLabelText('Link to port')).toBeDisabled();
});

it('says on the jack and the link when the device at the other end is in maintenance', async () => {
  const user = userEvent.setup();
  const s = useWorkspaceStore.getState();
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'link/add', link: { id: 'l1', a: { deviceId: 'srv', port: 'eth0' }, b: { deviceId: 'sw', port: 'Gi1' }, label: '', cable: null } } });
  s.dispatch({ type: 'equipment/state', roomId: 'r', ids: ['sw'], state: 'maintenance' });
  open('srv');
  await user.click(screen.getByRole('button', { name: 'Manage ports' }));
  const mgr = screen.getByRole('dialog', { name: 'SRV-01 ports' });
  const jack = within(mgr).getByRole('button', { name: 'Port eth0, linked to SW-01 Gi1, the far end is in maintenance' });
  await user.click(jack);
  expect(within(mgr).getByText(/Linked to/).closest('p')).toHaveTextContent('In maintenance');
});

it('picks a range with Shift and one more with ⌘, then changes only the field filled in on all of them', async () => {
  const user = userEvent.setup();
  const s = useWorkspaceStore.getState();
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'vlan/add', vlan: { vid: 10, name: 'Servers' } } });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'port/vlan', deviceId: 'sw', name: 'Gi2', vlan: { mode: 'access', vid: 10 } } });
  open('sw');
  await user.click(screen.getByRole('button', { name: 'Manage ports' }));
  const mgr = screen.getByRole('dialog', { name: 'SW-01 ports' });
  await user.click(within(mgr).getByRole('button', { name: 'Port Gi1, free' }));
  await user.keyboard('{Shift>}');
  await user.click(within(mgr).getByRole('button', { name: 'Port Gi3, free' }));
  await user.keyboard('{/Shift}{Meta>}');
  await user.click(within(mgr).getByRole('button', { name: 'Port Te1, free' }));
  await user.keyboard('{/Meta}');
  expect(within(mgr).getAllByRole('button', { pressed: true }).map((b) => b.getAttribute('aria-label'))).toEqual(['Port Gi1, free', 'Port Gi2, free', 'Port Gi3, free', 'Port Te1, free']);
  const apply = within(mgr).getByRole('button', { name: 'Apply to 4 ports' });
  expect(apply).toBeDisabled();
  // Mixed speeds (1G and 10G) say so; the field stays on "Leave as is" unless changed.
  expect(within(mgr).getByLabelText('Speed')).toHaveDisplayValue('Leave as is (mixed)');
  await user.selectOptions(within(mgr).getByLabelText('Speed'), '25G');
  await user.click(apply);
  expect(within(mgr).getByRole('status')).toHaveTextContent('Applied to 4 ports.');
  const ports = Object.fromEntries((content().objects[0] as Rack).devices.find((d) => d.id === 'sw')!.ports!.map((p) => [p.name, p]));
  expect(['Gi1', 'Gi2', 'Gi3', 'Gi4', 'Te1'].map((n) => ports[n]!.speed)).toEqual(['25G', '25G', '25G', '1G', '25G']);
  // Untouched fields keep each port's own value.
  expect(ports.Gi2!.vlan).toEqual({ mode: 'access', vid: 10 });
  expect(ports.Te1!.media).toBe('sfp_plus');
});

it('draws the faceplate in the layout the catalog sets, even for a device placed before it was set', async () => {
  const user = userEvent.setup();
  const s = useWorkspaceStore.getState();
  s.dispatch({ type: 'template/update', id: 'tpl-switch-1u', patch: { ports: [{ count: 4, prefix: 'Gi', start: 1, media: 'rj45', speed: '1G', rows: 2 }, { count: 2, prefix: 'Te', start: 1, media: 'sfp_plus', speed: '10G' }] } });
  open('sw');
  await user.click(screen.getByRole('button', { name: 'Manage ports' }));
  const mgr = screen.getByRole('dialog', { name: 'SW-01 ports' });
  expect(within(mgr).getAllByRole('button', { name: /^Port / }).map((b) => b.getAttribute('aria-label')!.replace(/^Port (\S+),.*$/, '$1'))).toEqual(['Gi1', 'Gi3', 'Gi2', 'Gi4', 'Te1', 'Te2']);
});
