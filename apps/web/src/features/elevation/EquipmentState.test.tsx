import { createObject, equipmentStateOf, findRoom, type Rack, type Template } from '@glasshouse/domain';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it } from 'vitest';
import { routes } from '../../app/routes';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';

const AT = '2026-10-15T00:00:00.000Z';
const state = (id: string) => equipmentStateOf(findRoom(useWorkspaceStore.getState().workspace, 'r')!.room.plan, id);

beforeEach(() => {
  localStorage.clear();
  resetWorkspaceStore();
  const s = useWorkspaceStore.getState();
  s.setLoad({ kind: 'ready' });
  const t = (id: string) => s.workspace.catalog.find((x) => x.id === id) as Template;
  s.dispatch({ type: 'project/create', id: 'p', name: 'P' });
  s.dispatch({ type: 'site/create', projectId: 'p', id: 's', name: 'S' });
  s.dispatch({ type: 'room/create', siteId: 's', id: 'r', floorAreaId: 'fa-r', name: 'R' });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'object/add', object: { ...(createObject('rack', { x: 1, y: 1 }, []) as Rack), id: 'rk', name: 'RK-01' } } });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'device/place', id: 'srv', rackId: 'rk', bottomU: 1, template: t('tpl-server-2u') } });
  s.dispatch({ type: 'review', roomId: 'r', command: { type: 'review/submit', designedBy: 'A', at: AT } });
  s.dispatch({ type: 'review', roomId: 'r', command: { type: 'review/approve', reviewer: 'B', at: AT } });
});

it('marks equipment deployed or in maintenance on an approved plan, shown on the rack', async () => {
  const user = userEvent.setup();
  const { container } = render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/elevation?sel=srv'] })} />);
  const group = screen.getByRole('group', { name: 'Equipment state' });
  expect(within(group).getByRole('button', { name: /Planned/ })).toHaveAttribute('aria-pressed', 'true');
  await user.click(within(group).getByRole('button', { name: /Deployed/ }));
  expect(state('srv')).toBe('deployed');
  expect(container.querySelector('[data-elev-id="srv"]')).toHaveClass('dev--state-deployed');
  await user.click(within(group).getByRole('button', { name: /In maintenance/ }));
  expect(container.querySelector('[data-elev-id="srv"] .dev__state')).toHaveAttribute('data-state', 'maintenance');
  expect(screen.getByRole('list', { name: 'Equipment states' })).toHaveTextContent('Planned');
});

it('filters the BOM by state', async () => {
  const user = userEvent.setup();
  useWorkspaceStore.getState().dispatch({ type: 'equipment/state', roomId: 'r', ids: ['srv'], state: 'deployed' });
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/bom'] })} />);
  expect(screen.getAllByRole('row')).toHaveLength(2);
  await user.click(screen.getByRole('button', { name: 'Planned' }));
  expect(screen.getAllByRole('row')).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'Deployed' }));
  expect(screen.getAllByRole('row')).toHaveLength(2);
});

it('keeps ports inside the device form, before Configuration, and usable on an approved plan', async () => {
  const user = userEvent.setup();
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/elevation?sel=srv'] })} />);
  const ports = screen.getByRole('group', { name: 'Network ports' });
  const config = screen.getByLabelText('Configuration');
  expect(ports.compareDocumentPosition(config) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByLabelText('Name')).toBeDisabled();
  await user.click(within(ports).getByRole('button', { name: 'Manage ports' }));
  expect(screen.getByRole('dialog', { name: 'SRV-01 ports' })).toBeInTheDocument();
});
