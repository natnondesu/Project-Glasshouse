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
  expect(within(diagram).getAllByRole('button', { name: /, RK-0\d/ })).toHaveLength(9);
  expect(container.querySelectorAll('.topo-edge')).toHaveLength(8);
  expect(container.querySelectorAll('.topo-edge.is-fibre')).toHaveLength(1);
});

it('shows a device’s ports and where they go, and opens its port manager', async () => {
  const user = userEvent.setup();
  open();
  await user.click(screen.getByRole('button', { name: 'SW-01, RK-01 · U42' }));
  const ports = screen.getByRole('table', { name: 'Ports' });
  expect(within(ports).getByRole('row', { name: /^Gi1\/0\/1 / })).toHaveTextContent('to SRV-01 eth0');
  expect(within(ports).getByRole('row', { name: /^Te1\/1\/1 / })).toHaveTextContent('Trunk all · native 99');
  await user.click(screen.getByRole('button', { name: 'Manage ports' }));
  expect(screen.getByRole('dialog', { name: 'SW-01 ports' })).toBeInTheDocument();
});

it('fades what does not carry the highlighted VLAN, and lists a cable line’s cables', async () => {
  const user = userEvent.setup();
  const { container } = open();
  await user.selectOptions(screen.getByLabelText('Highlight VLAN'), '20');
  // Only the trunked uplink and the two switches carry Storage.
  expect(container.querySelectorAll('.topo-edge:not(.is-dim)')).toHaveLength(1);
  expect(container.querySelectorAll('.topo-node:not(.is-dim)')).toHaveLength(2);
  await user.click(screen.getByRole('button', { name: /^SW-0[12] to SW-0[12], 1 cable$/ }));
  expect(screen.getByRole('heading', { name: /^SW-0[12] ↔ SW-0[12]$/ })).toBeInTheDocument();
  expect(screen.getByText(/^SW-0[12] Te1\/1\/1 ↔ SW-0[12] Te1\/1\/1$/)).toBeInTheDocument();
});

it('prints the diagram and VLAN list on the Install sheet', () => {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [`/rooms/${server}/install-sheet`] })} />);
  expect(screen.getByRole('img', { name: 'Network diagram' })).toBeInTheDocument();
  expect(screen.getByRole('table', { name: 'VLANs' })).toHaveTextContent('99Management2 ports');
});
