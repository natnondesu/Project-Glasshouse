import { createObject, findRoom, type Rack } from '@glasshouse/domain';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it } from 'vitest';
import { routes } from '../../app/routes';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';

beforeEach(() => {
  resetWorkspaceStore();
  const s = useWorkspaceStore.getState();
  s.setLoad({ kind: 'ready' });
  s.dispatch({ type: 'project/create', id: 'p', name: 'P' });
  s.dispatch({ type: 'site/create', projectId: 'p', id: 's', name: 'S' });
  s.dispatch({ type: 'room/create', siteId: 's', id: 'r', name: 'R' });
  // Added out of order: the back row first, then the front row right to left.
  for (const [id, x, y] of [['B1', 1, 2], ['A2', 2.2, 0.6], ['A1', 1, 0.6]] as const) {
    s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'object/add', object: { ...(createObject('rack', { x, y }, []) as Rack), id, name: id } } });
  }
});

const shown = () => within(screen.getByRole('region', { name: 'Rack elevations' })).getAllByRole('button', { name: /^[AB]\d$/ }).map((b) => b.textContent);
const saved = () => findRoom(useWorkspaceStore.getState().workspace, 'r')!.room.plan.rackOrder;

it('shows racks in plan order, moves one with Alt+arrow, saves that on the room, and resets to plan order', async () => {
  const user = userEvent.setup();
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/elevation'] })} />);
  expect(shown()).toEqual(['A1', 'A2', 'B1']);
  screen.getByRole('button', { name: 'B1' }).focus();
  await user.keyboard('{Alt>}{ArrowLeft}{ArrowLeft}{/Alt}');
  expect(shown()).toEqual(['B1', 'A1', 'A2']);
  expect(saved()).toEqual(['B1', 'A1', 'A2']);
  expect(screen.getByRole('button', { name: 'B1' })).toHaveFocus();
  await user.click(screen.getByRole('button', { name: 'Reset to plan order' }));
  expect(shown()).toEqual(['A1', 'A2', 'B1']);
  expect(saved()).toBeUndefined();
  expect(screen.queryByRole('button', { name: 'Reset to plan order' })).not.toBeInTheDocument();
});
