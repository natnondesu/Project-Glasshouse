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
  Room3DCanvas: ({ onCamera }: { onCamera: (u: (c: { distance: number }) => object) => void }) => (
    <button type="button" data-testid="room3d-canvas" onClick={() => onCamera((c) => ({ ...c, distance: c.distance * 2 }))}>
      move camera
    </button>
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
