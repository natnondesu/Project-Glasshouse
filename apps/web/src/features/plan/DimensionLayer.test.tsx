import { createObject, type Rack } from '@glasshouse/domain';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it } from 'vitest';
import { routes } from '../../app/routes';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';
import { currentRevision, findRoom } from '@glasshouse/domain';

const dims = () => currentRevision(findRoom(useWorkspaceStore.getState().workspace, 'r')!.room.plan).content.dimensions;

beforeEach(() => {
  localStorage.clear();
  resetWorkspaceStore();
  const s = useWorkspaceStore.getState();
  s.setLoad({ kind: 'ready' });
  s.dispatch({ type: 'project/create', id: 'p', name: 'P' });
  s.dispatch({ type: 'site/create', projectId: 'p', id: 's', name: 'S' });
  s.dispatch({ type: 'room/create', siteId: 's', id: 'r', name: 'MDF-1' });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'object/add', object: { ...(createObject('rack', { x: 1, y: 1 }, []) as Rack), id: 'rk', name: 'RK-01' } } });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'dimension/add', dimension: { id: 'd1', a: { kind: 'point', x: 0, y: 1 }, b: { kind: 'object', objectId: 'rk', u: -0.5, v: -0.5 }, offset: 0 } } });
});

const open = (sel = '') => render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [`/rooms/r/plan${sel}`] })} />);

it('draws saved dimensions that follow their object', () => {
  open();
  expect(screen.getByRole('button', { name: 'Dimension 1.00 m, wall to RK-01' })).toBeInTheDocument();
  act(() => {
    useWorkspaceStore.getState().dispatch({ type: 'plan', roomId: 'r', command: { type: 'object/update', id: 'rk', patch: { x: 1.5 } } });
  });
  expect(screen.getByRole('button', { name: 'Dimension 1.50 m, wall to RK-01' })).toBeInTheDocument();
});

it('selects a dimension, moves its line with the offset field, and deletes it', async () => {
  const user = userEvent.setup();
  open();
  fireEvent.focus(screen.getByRole('button', { name: /^Dimension 1.00 m/ }));
  expect(screen.getByRole('heading', { name: 'Dimension' })).toBeInTheDocument();
  const offset = screen.getByLabelText('Line offset');
  await user.clear(offset);
  await user.type(offset, '0.4');
  await user.tab();
  expect(dims()[0]!.offset).toBe(0.4);
  await user.click(screen.getByRole('button', { name: 'Delete dimension' }));
  expect(dims()).toEqual([]);
});

it('offers the Dimension tool with the D shortcut', () => {
  open();
  const canvas = screen.getByLabelText(/Room plan drawing/);
  fireEvent.keyDown(canvas, { key: 'd' });
  expect(screen.getByRole('button', { name: 'Dimension' })).toHaveAttribute('aria-pressed', 'true');
});
