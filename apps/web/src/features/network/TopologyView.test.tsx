import { createWorkspace, withSample } from '@glasshouse/domain';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it } from 'vitest';
import { routes } from '../../app/routes';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';

let server = '';
beforeEach(() => {
  localStorage.clear();
  resetWorkspaceStore();
  const seeded = withSample(createWorkspace(), '2026-10-15T00:00:00.000Z');
  if (!seeded.ok) throw new Error(seeded.error.message);
  useWorkspaceStore.getState().replace(seeded.value);
  useWorkspaceStore.getState().setLoad({ kind: 'ready' });
  server = seeded.value.projects[0]!.sites[0]!.rooms[0]!.id;
});

const open = () => render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [`/rooms/${server}/network`] })} />);

it('draws every cabled device and one line per cabled pair', () => {
  const { container } = open();
  const diagram = screen.getByRole('group', { name: 'Network diagram' });
  // Two cores, two access switches, an edge router and five servers.
  expect(within(diagram).getAllByRole('button', { name: /, RK-0\d/ })).toHaveLength(10);
  expect(container.querySelectorAll('.topo-edge')).toHaveLength(12);
  // Core-to-core and every uplink are fibre; server links are copper.
  expect(container.querySelectorAll('.topo-edge.is-fibre')).toHaveLength(7);
});

it('shows a device’s ports and where they go, and opens its port manager', async () => {
  const user = userEvent.setup();
  open();
  await user.click(screen.getByRole('button', { name: 'CORE-01, RK-01 · U42' }));
  const ports = screen.getByRole('table', { name: 'Ports' });
  expect(within(ports).getByRole('row', { name: /^Te1\/1\/1 / })).toHaveTextContent('to ACC-01 Te1/1/1');
  expect(within(ports).getByRole('row', { name: /^Te1\/1\/7 / })).toHaveTextContent('Trunk all · native 99');
  await user.click(screen.getByRole('button', { name: 'Manage ports' }));
  expect(screen.getByRole('dialog', { name: 'CORE-01 ports' })).toBeInTheDocument();
});

it('fades what does not carry the highlighted VLAN, and lists a cable line’s cables', async () => {
  const user = userEvent.setup();
  const { container } = open();
  await user.selectOptions(screen.getByLabelText('Highlight VLAN'), '20');
  // Storage: the bonded storage server, its access switch, and every trunk (they allow all VLANs).
  expect(container.querySelectorAll('.topo-edge:not(.is-dim)')).toHaveLength(8);
  expect(container.querySelectorAll('.topo-node:not(.is-dim)')).toHaveLength(6);
  await user.click(screen.getByRole('button', { name: /^CORE-0[12] to CORE-0[12], 2 cables$/ }));
  expect(screen.getByRole('heading', { name: /^CORE-0[12] ↔ CORE-0[12]$/ })).toBeInTheDocument();
  expect(screen.getByText(/^CORE-0[12] Te1\/1\/7 ↔ CORE-0[12] Te1\/1\/7$/)).toBeInTheDocument();
});

it('prints the diagram and VLAN list on the Install sheet', () => {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [`/rooms/${server}/install-sheet`] })} />);
  expect(screen.getByRole('img', { name: 'Network diagram' })).toBeInTheDocument();
  expect(screen.getByRole('table', { name: 'VLANs' })).toHaveTextContent('99Management16 ports');
});

it('marks gear in maintenance on its box and its cables, and on the far end of each of its ports', async () => {
  const user = userEvent.setup();
  const ws = useWorkspaceStore.getState().workspace;
  const racks = ws.projects[0]!.sites[0]!.rooms[0]!.plan.revisions[0]!.content.objects.flatMap((o) => ('devices' in o ? o.devices : []));
  const acc = racks.find((d) => d.name === 'ACC-01')!;
  useWorkspaceStore.getState().dispatch({ type: 'equipment/state', roomId: server, ids: [acc.id], state: 'maintenance' });
  const { container } = open();
  const box = screen.getByRole('button', { name: /^ACC-01, RK-0\d · U\d+, In maintenance$/ });
  expect(box).toHaveClass('is-maint');
  expect(box).toHaveTextContent('In maintenance');
  expect(container.querySelectorAll('.topo-edge.is-maint').length).toBeGreaterThan(0);
  await user.click(screen.getByRole('button', { name: /^CORE-01, RK-01 · U42/ }));
  expect(within(screen.getByRole('table', { name: 'Ports' })).getByRole('row', { name: /^Te1\/1\/1 / })).toHaveTextContent('to ACC-01 Te1/1/1In maintenance');
});

it('finds a device from the search box: selects its box and lists its ports', async () => {
  const user = userEvent.setup();
  open();
  await user.type(screen.getByRole('combobox', { name: 'Search this room' }), 'acc-01');
  await user.keyboard('{Enter}');
  expect(screen.getByRole('button', { name: /^ACC-01, RK-0\d/ })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('table', { name: 'Ports' })).toBeInTheDocument();
});
