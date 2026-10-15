import { createObject, type Rack } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { routes } from '../../app/routes';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';

// jsdom has no WebGL: stand in for the canvas and keep the rest of the view real.
vi.mock('./Room3DCanvas', () => ({
  hasWebGL: () => true,
  Room3DCanvas: ({ onCamera, onSelect, path }: { onCamera: (u: (c: { distance: number }) => object) => void; onSelect: (id: string | null) => void; path: { feedIds: Set<string> } | null }) => (
    <>
      <output data-testid="path">{path ? [...path.feedIds].join(',') : 'none'}</output>
      <button type="button" data-testid="room3d-canvas" onClick={() => onCamera((c) => ({ ...c, distance: c.distance * 2 }))}>
        move camera
      </button>
      <button type="button" data-testid="click-mcb" onClick={() => onSelect('mcb')}>
        click the MCB in the room
      </button>
    </>
  ),
}));

beforeEach(() => {
  resetWorkspaceStore();
  const s = useWorkspaceStore.getState();
  s.setLoad({ kind: 'ready' });
  s.dispatch({ type: 'project/create', id: 'p', name: 'P' });
  s.dispatch({ type: 'site/create', projectId: 'p', id: 's', name: 'S' });
  s.dispatch({ type: 'room/create', siteId: 's', id: 'r', name: 'MDF-1' });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'object/add', object: { ...(createObject('rack', { x: 1, y: 0.6 }, []) as Rack), id: 'rk', name: 'RK-01' } } });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'object/add', object: { ...createObject('mcb', { x: 3, y: 0 }, []), id: 'mcb', name: 'MCB-01' } } });
});

it('shows the room in 3D with a keyboard path to each rack’s elevation', async () => {
  const user = userEvent.setup();
  const router = createMemoryRouter(routes, { initialEntries: ['/rooms/r/3d'] });
  render(<RouterProvider router={router} />);
  expect(await screen.findByTestId('room3d-canvas')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '3D' })).toHaveAttribute('aria-current', 'page');
  await user.click(screen.getByRole('button', { name: /RK-01/ }));
  // Selecting highlights first; navigating is a separate, explicit step.
  expect(router.state.location.pathname).toBe('/rooms/r/3d');
  expect(screen.getByRole('button', { name: /^RK-01/ })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('region', { name: 'RK-01 details' })).toHaveTextContent('0/42U');
  await user.click(screen.getByRole('button', { name: 'Open RK-01 elevation' }));
  expect(router.state.location.pathname).toBe('/rooms/r/elevation');
  expect(router.state.location.search).toBe('?sel=rk');
});

it('resets the camera', async () => {
  const user = userEvent.setup();
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/3d'] })} />);
  const zoom = await screen.findByText(/^\d+\.\d m$/);
  const before = zoom.textContent;
  await user.click(screen.getByTestId('room3d-canvas'));
  expect(screen.getByText(/^\d+\.\d m$/).textContent).not.toBe(before);
  await user.click(screen.getByRole('button', { name: 'Reset view' }));
  expect(screen.getByText(/^\d+\.\d m$/).textContent).toBe(before);
});

it('chooses which kinds are always labelled, and remembers it', async () => {
  const user = userEvent.setup();
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/3d'] })} />);
  await screen.findByTestId('room3d-canvas');
  await user.click(screen.getByRole('button', { name: 'Labels (3)' }));
  const menu = screen.getByRole('group', { name: 'Always label' });
  expect(screen.getByRole('checkbox', { name: 'Power sources' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Doors' })).not.toBeChecked();
  await user.click(screen.getByRole('checkbox', { name: 'Doors' }));
  await user.click(screen.getByRole('checkbox', { name: 'Racks' }));
  expect(JSON.parse(localStorage.getItem('glasshouse:3d-label-kinds')!)).toEqual(['existing', 'power', 'door']);
  await user.keyboard('{Escape}');
  expect(menu).not.toBeInTheDocument();
});

it('selects an MCB clicked in the room, and opens its ways only from Manage ways', async () => {
  const user = userEvent.setup();
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/3d'] })} />);
  await user.click(await screen.findByTestId('click-mcb'));
  expect(screen.getByRole('region', { name: 'MCB-01 details' })).toHaveTextContent('MCB panel');
  expect(screen.queryByRole('dialog', { name: 'MCB-01 ways' })).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Manage ways' }));
  const manager = screen.getByRole('dialog', { name: 'MCB-01 ways' });
  await user.click(screen.getByRole('button', { name: 'Close MCB-01 ways' }));
  expect(manager).not.toBeInTheDocument();
});

it('hides and shows power lines, and remembers it', async () => {
  const user = userEvent.setup();
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/3d'] })} />);
  await screen.findByTestId('room3d-canvas');
  await user.click(screen.getByRole('button', { name: 'Hide power lines' }));
  expect(screen.getByRole('button', { name: 'Show power lines' })).toHaveAttribute('aria-pressed', 'false');
  expect(localStorage.getItem('glasshouse:3d-feeds')).toBe('false');
});

it('highlights the power path of the selected object until it is cleared', async () => {
  const user = userEvent.setup();
  useWorkspaceStore.getState().dispatch({ type: 'plan', roomId: 'r', command: { type: 'feed/add', feed: { id: 'f1', sourceId: 'mcb', targetId: 'rk', label: 'A' } } });
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/3d'] })} />);
  await screen.findByTestId('room3d-canvas');
  await user.click(screen.getByRole('button', { name: /^RK-01/ }));
  await user.click(screen.getByRole('button', { name: 'Show power path' }));
  expect(screen.getByTestId('path')).toHaveTextContent('f1');
  expect(screen.getByText(/1 line on the path/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Clear the power path of RK-01' }));
  expect(screen.getByTestId('path')).toHaveTextContent('none');
});

it('says when nothing is wired to the selected object', async () => {
  const user = userEvent.setup();
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/3d'] })} />);
  await user.click(await screen.findByTestId('click-mcb'));
  expect(screen.getByText('No power lines connect to MCB-01.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Show power path' })).toBeNull();
});
