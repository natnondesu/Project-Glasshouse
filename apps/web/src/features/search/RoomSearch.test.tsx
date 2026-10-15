import { createObject, type Rack, type Template } from '@glasshouse/domain';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { routes } from '../../app/routes';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';

vi.mock('../room3d/Room3DCanvas', () => ({
  hasWebGL: () => true,
  Room3DCanvas: ({ selectedId, focus }: { selectedId: string | null; focus: unknown }) => (
    <output data-testid="canvas">{`${selectedId ?? 'none'}|${focus ? 'focused' : ''}`}</output>
  ),
}));

beforeEach(() => {
  localStorage.clear();
  resetWorkspaceStore();
  const s = useWorkspaceStore.getState();
  s.setLoad({ kind: 'ready' });
  const t = s.workspace.catalog.find((x) => x.id === 'tpl-server-2u') as Template;
  s.dispatch({ type: 'project/create', id: 'p', name: 'P' });
  s.dispatch({ type: 'site/create', projectId: 'p', id: 's', name: 'S' });
  s.dispatch({ type: 'room/create', siteId: 's', id: 'r', name: 'MDF-1' });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'object/add', object: { ...(createObject('rack', { x: 1, y: 1 }, []) as Rack), id: 'rk', name: 'RK-01' } } });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'object/add', object: { ...createObject('door', { x: 3, y: 0 }, []), id: 'door', name: 'D-01' } } });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'device/place', id: 'srv', rackId: 'rk', bottomU: 3, template: t } });
});

function open(view: string) {
  const router = createMemoryRouter(routes, { initialEntries: [`/rooms/r/${view}`] });
  render(<RouterProvider router={router} />);
  return router;
}

it('plan: finds a device and highlights the rack that holds it, with a way to its elevation', async () => {
  const user = userEvent.setup();
  const router = open('plan');
  fireEvent.keyDown(window, { key: '/' });
  const box = screen.getByRole('combobox', { name: 'Search this room' });
  expect(box).toHaveFocus();
  await user.type(box, 'srv-01');
  const options = within(screen.getByRole('listbox')).getAllByRole('option');
  expect(options[0]).toHaveTextContent('SRV-01');
  expect(options[0]).toHaveTextContent('Server 2U in RK-01, U3–U4');
  await user.keyboard('{Enter}');
  expect(router.state.location.search).toBe('?sel=rk');
  expect(screen.getByRole('heading', { name: 'RK-01' })).toBeInTheDocument();
  expect(document.querySelector('.search-pulse')).not.toBeNull();
});

it('plan: offers the elevation for a device', async () => {
  const user = userEvent.setup();
  const router = open('plan');
  await user.type(screen.getByRole('combobox', { name: 'Search this room' }), 'srv');
  await user.click(screen.getByRole('link', { name: 'Open SRV-01 in elevation' }));
  expect(router.state.location.pathname).toBe('/rooms/r/elevation');
  expect(router.state.location.search).toBe('?sel=srv');
});

it('elevation: selects the device itself; plan-only objects link to the plan', async () => {
  const user = userEvent.setup();
  const router = open('elevation');
  const box = screen.getByRole('combobox', { name: 'Search this room' });
  await user.type(box, 'srv-01{Enter}');
  expect(router.state.location.search).toBe('?sel=srv');
  await user.clear(box);
  await user.type(box, 'd-01');
  expect(screen.getByRole('link', { name: 'Show D-01 on plan' })).toHaveAttribute('href', '/rooms/r/plan?sel=door');
});

it('3D: highlights the rack and focuses the camera on it', async () => {
  const user = userEvent.setup();
  open('3d');
  await screen.findByTestId('canvas');
  await user.type(screen.getByRole('combobox', { name: 'Search this room' }), 'srv-01{Enter}');
  expect(screen.getByTestId('canvas')).toHaveTextContent('rk|focused');
});

it('says when nothing matches', async () => {
  const user = userEvent.setup();
  open('plan');
  await user.type(screen.getByRole('combobox', { name: 'Search this room' }), 'zzz');
  expect(screen.getByRole('status')).toHaveTextContent('No matches in MDF-1.');
});
