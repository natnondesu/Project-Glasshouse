import { createObject, findRoom, currentRevision, type Rack, type Template } from '@glasshouse/domain';
import { fireEvent, render, screen } from '@testing-library/react';
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
  s.dispatch({ type: 'room/create', siteId: 's', id: 'r', name: 'R' });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'object/add', object: { ...(createObject('rack', { x: 1, y: 0.6 }, []) as Rack), id: 'rk', name: 'RK-01' } } });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'device/place', id: 'srv', rackId: 'rk', bottomU: 1, template: t } });
});

it('does not delete a populated rack from the keyboard; the inspector names what goes with it', () => {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/plan?sel=rk'] })} />);
  fireEvent.keyDown(screen.getByRole('button', { name: 'RK-01, Rack' }), { key: 'Delete' });
  const objects = currentRevision(findRoom(useWorkspaceStore.getState().workspace, 'r')!.room.plan).content.objects;
  expect(objects).toHaveLength(1);
  expect(screen.getByRole('status')).toHaveTextContent('RK-01 holds 1 Device. Remove it from the inspector to confirm.');
  fireEvent.click(screen.getByRole('button', { name: 'Remove RK-01' }));
  expect(screen.getByText('Remove RK-01 and its 1 Device from the plan?')).toBeInTheDocument();
});
