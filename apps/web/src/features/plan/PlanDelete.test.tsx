import { createObject, findRoom, currentRevision, type Rack, type Template } from '@glasshouse/domain';
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
  const t = s.workspace.catalog.find((x) => x.id === 'tpl-server-2u') as Template;
  s.dispatch({ type: 'project/create', id: 'p', name: 'P' });
  s.dispatch({ type: 'site/create', projectId: 'p', id: 's', name: 'S' });
  s.dispatch({ type: 'room/create', siteId: 's', id: 'r', floorAreaId: 'fa-r', name: 'R' });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'object/add', object: { ...(createObject('rack', { x: 1, y: 0.6 }, []) as Rack), id: 'rk', name: 'RK-01' } } });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'device/place', id: 'srv', rackId: 'rk', bottomU: 1, template: t } });
});

it('removes the selected object with Delete after a popup that names what goes with it', async () => {
  const user = userEvent.setup();
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/plan?sel=rk'] })} />);
  const objects = () => currentRevision(findRoom(useWorkspaceStore.getState().workspace, 'r')!.room.plan).content.objects;
  screen.getByRole('button', { name: 'RK-01, Rack' }).focus();
  await user.keyboard('{Delete}');
  expect(screen.getByRole('alertdialog', { name: 'Remove RK-01 and its 1 Device from the plan?' })).toBeInTheDocument();
  await user.keyboard('{Escape}');
  expect(objects()).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'Remove RK-01' }));
  await user.keyboard('{Enter}');
  expect(objects()).toHaveLength(0);
});
