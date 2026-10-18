import { createObject, findRoom, currentRevision } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
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
  s.dispatch({ type: 'room/create', siteId: 's', id: 'r', floorAreaId: 'fa-r', name: 'R' });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'object/add', object: { ...createObject('mcb', { x: 2, y: 0 }, []), id: 'mcb', name: 'MCB-01' } } });
});

const panel = () => currentRevision(findRoom(useWorkspaceStore.getState().workspace, 'r')!.room.plan).content.objects.find((o) => o.id === 'mcb');

it('keeps keys pressed inside the panel manager away from the plan: no nudge, rotate or remove', async () => {
  const user = userEvent.setup();
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/plan?sel=mcb'] })} />);
  await user.click(screen.getByRole('button', { name: 'Manage ways' }));
  const before = panel();
  screen.getByRole('button', { name: /^Way 1,/ }).focus();
  // Way 1 sits at the left end of a one-row panel: Left has nowhere to go and must not fall through to the plan.
  await user.keyboard('{ArrowLeft}{ArrowRight}{ArrowDown}{ArrowUp}rR{Delete}{Backspace}');
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(panel()).toEqual(before);
  expect(screen.getByRole('button', { name: /^Way 2,/ })).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog', { name: /MCB-01/ })).not.toBeInTheDocument();
});
