import { createObject, type Rack, type Template } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { routes } from '../../app/routes';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';

beforeEach(() => {
  resetWorkspaceStore();
  const s = useWorkspaceStore.getState();
  s.setLoad({ kind: 'ready' });
  const t = (id: string) => s.workspace.catalog.find((x) => x.id === id) as Template;
  const rack = { ...(createObject('rack', { x: 1, y: 0.6 }, []) as Rack), name: 'RK-01' };
  s.dispatch({ type: 'project/create', id: 'p', name: 'Northgate' });
  s.dispatch({ type: 'site/create', projectId: 'p', id: 's', name: 'Site A' });
  s.dispatch({ type: 'room/create', siteId: 's', id: 'r', floorAreaId: 'fa-r', name: 'MDF 1' });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'object/add', object: rack } });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'device/place', id: 'ch', rackId: rack.id, bottomU: 5, template: t('tpl-chassis-6u') } });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'node/insert', id: 'n1', chassisId: 'ch', slot: 1, template: t('tpl-node') } });
});
afterEach(() => vi.restoreAllMocks());

it('lists devices with nodes and downloads the CSV', async () => {
  const user = userEvent.setup();
  const created: Blob[] = [];
  URL.createObjectURL = vi.fn((blob: Blob) => {
    created.push(blob);
    return 'blob:bom';
  });
  URL.revokeObjectURL = vi.fn();
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/bom'] })} />);
  expect(screen.getByRole('link', { name: 'Devices & BOM' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getAllByRole('row')).toHaveLength(3);
  expect(screen.getByRole('cell', { name: 'NODE-01' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Download CSV' }));
  expect(created).toHaveLength(1);
  expect(await created[0]!.text()).toContain('RK-01,CH-01,1,Node,Planned,NODE-01');
});

it('starts the CSV with a UTF-8 byte-order mark so Excel keeps en dashes and Thai text', async () => {
  const user = userEvent.setup();
  const created: Blob[] = [];
  URL.createObjectURL = vi.fn((blob: Blob) => {
    created.push(blob);
    return 'blob:bom';
  });
  URL.revokeObjectURL = vi.fn();
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/bom'] })} />);
  await user.click(screen.getByRole('button', { name: 'Download CSV' }));
  const bytes = new Uint8Array(await created[0]!.arrayBuffer());
  expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
});

it('adds a Ports column and offers the cable schedule as CSV once the room has links', async () => {
  const user = userEvent.setup();
  const created: Blob[] = [];
  URL.createObjectURL = vi.fn((blob: Blob) => {
    created.push(blob);
    return 'blob:cables';
  });
  URL.revokeObjectURL = vi.fn();
  const s = useWorkspaceStore.getState();
  const node = (deviceId: string) => ({ type: 'port/add' as const, deviceId, port: { name: 'eth0', media: 'rj45' as const, speed: '1G' } });
  s.dispatch({ type: 'plan', roomId: 'r', command: node('ch') });
  s.dispatch({ type: 'plan', roomId: 'r', command: node('n1') });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'link/add', link: { id: 'l', a: { deviceId: 'n1', port: 'eth0' }, b: { deviceId: 'ch', port: 'eth0' }, label: 'X1', cable: 'cat6' } } });
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/bom'] })} />);
  expect(screen.getByRole('columnheader', { name: 'Ports' })).toBeInTheDocument();
  expect(screen.getAllByRole('cell', { name: '1× RJ45 1G' })).toHaveLength(2);
  await user.click(screen.getByRole('button', { name: 'Cable schedule CSV (1)' }));
  expect(await created[0]!.text()).toContain('X1,RK-01,NODE-01,eth0,RK-01,CH-01,eth0,Cat 6');
});
