import { createObject, type Rack } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it } from 'vitest';
import { routes } from '../../app/routes';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';

function seed(withRack: boolean): void {
  resetWorkspaceStore();
  const s = useWorkspaceStore.getState();
  s.setLoad({ kind: 'ready' });
  s.dispatch({ type: 'project/create', id: 'p', name: 'P' });
  s.dispatch({ type: 'site/create', projectId: 'p', id: 's', name: 'S' });
  s.dispatch({ type: 'room/create', siteId: 's', id: 'r', name: 'MDF-1' });
  if (withRack) s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'object/add', object: { ...(createObject('rack', { x: 1, y: 0.6 }, []) as Rack), name: 'RK-01' } } });
}
const open = () => render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/elevation'] })} />);

beforeEach(() => seed(true));

it('adds a device from the palette and edits it in the inspector', async () => {
  const user = userEvent.setup();
  open();
  expect(screen.getByRole('heading', { name: 'Room demand' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Elevation' })).toHaveAttribute('aria-current', 'page');
  await user.click(screen.getByRole('button', { name: 'Add Server 2U to RK-01' }));
  expect(screen.getByRole('button', { name: 'SRV-01, U1–U2' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'SRV-01' })).toBeInTheDocument();
  expect(screen.getByText('450 W known')).toBeInTheDocument();
});

it('lists depth and demand problems in the checks', async () => {
  const user = userEvent.setup();
  open();
  await user.click(screen.getByRole('button', { name: 'Add Server 1U to RK-01' }));
  const depth = screen.getByLabelText('Depth');
  await user.clear(depth);
  await user.type(depth, '1070');
  expect(screen.getByText('SRV-01 is 1070 mm deep, but RK-01 accepts 1000 mm.')).toBeInTheDocument();
});

it('sends you to the plan when the room has no racks', () => {
  seed(false);
  open();
  expect(screen.getByRole('heading', { name: 'This room has no racks yet' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Go to the plan' })).toHaveAttribute('href', '/rooms/r/plan');
});
