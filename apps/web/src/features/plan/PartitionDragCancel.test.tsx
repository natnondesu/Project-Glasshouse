import { createObject, currentRevision, findRoom, type Rack } from '@glasshouse/domain';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it } from 'vitest';
import { routes } from '../../app/routes';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';

beforeEach(() => {
  // jsdom has no pointer capture.
  Object.assign(SVGElement.prototype, { setPointerCapture: () => undefined, releasePointerCapture: () => undefined });
  resetWorkspaceStore();
  const s = useWorkspaceStore.getState();
  s.setLoad({ kind: 'ready' });
  s.dispatch({ type: 'project/create', id: 'p', name: 'P' });
  s.dispatch({ type: 'site/create', projectId: 'p', id: 's', name: 'S' });
  s.dispatch({ type: 'room/create', siteId: 's', id: 'r', floorAreaId: 'fa-r', name: 'R' });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'object/add', object: { ...(createObject('rack', { x: 0.5, y: 0.6 }, []) as Rack), id: 'a', name: 'ROW-A-01' } } });
});

const objects = () => currentRevision(findRoom(useWorkspaceStore.getState().workspace, 'r')!.room.plan).content.objects;

async function dragging() {
  const user = userEvent.setup();
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/plan'] })} />);
  await user.click(screen.getByRole('button', { name: /Walls & doors tools/ }));
  await user.click(screen.getByRole('menuitemradio', { name: 'Partition' }));
  const canvas = screen.getByLabelText(/Room plan drawing/);
  fireEvent.pointerDown(canvas, { clientX: 200, clientY: 300, button: 0, pointerId: 1 });
  fireEvent.pointerMove(canvas, { clientX: 400, clientY: 300, pointerId: 1 });
  expect(canvas.querySelector('.wall-preview')).not.toBeNull();
  return { user, canvas };
}

it('draws the partition when the drag is released', async () => {
  const { canvas } = await dragging();
  fireEvent.pointerUp(canvas, { clientX: 400, clientY: 300, pointerId: 1 });
  expect(objects().some((o) => o.type === 'partition')).toBe(true);
});

it('Escape during the drag cancels it: nothing is placed on release', async () => {
  const { user, canvas } = await dragging();
  await user.keyboard('{Escape}');
  expect(canvas.querySelector('.wall-preview')).toBeNull();
  fireEvent.pointerUp(canvas, { clientX: 400, clientY: 300, pointerId: 1 });
  expect(objects().some((o) => o.type === 'partition')).toBe(false);
});

it('Ctrl+Z during the drag cancels it and does not undo the step before it', async () => {
  const { user, canvas } = await dragging();
  await user.keyboard('{Control>}z{/Control}');
  expect(canvas.querySelector('.wall-preview')).toBeNull();
  fireEvent.pointerUp(canvas, { clientX: 400, clientY: 300, pointerId: 1 });
  expect(objects().map((o) => o.type)).toEqual(['rack']);
});

it('Cmd+Z during the drag cancels it too', async () => {
  const { user, canvas } = await dragging();
  await user.keyboard('{Meta>}z{/Meta}');
  fireEvent.pointerUp(canvas, { clientX: 400, clientY: 300, pointerId: 1 });
  expect(objects().map((o) => o.type)).toEqual(['rack']);
});
