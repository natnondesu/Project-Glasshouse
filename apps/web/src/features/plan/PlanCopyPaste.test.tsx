import { createObject, currentRevision, findRoom, type Rack, type Template } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it } from 'vitest';
import { routes } from '../../app/routes';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';
import { usePlanClipboard } from './usePlanCopyPaste';

beforeEach(() => {
  resetWorkspaceStore();
  usePlanClipboard.getState().set(null);
  const s = useWorkspaceStore.getState();
  s.setLoad({ kind: 'ready' });
  const t = s.workspace.catalog.find((x) => x.id === 'tpl-server-2u') as Template;
  s.dispatch({ type: 'project/create', id: 'p', name: 'P' });
  s.dispatch({ type: 'site/create', projectId: 'p', id: 's', name: 'S' });
  s.dispatch({ type: 'room/create', siteId: 's', id: 'r', name: 'R' });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'object/add', object: { ...(createObject('rack', { x: 0.5, y: 0.6 }, []) as Rack), id: 'a', name: 'ROW-A-01', clearance: { front: 0, rear: 0 } } } });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'device/place', id: 'srv', rackId: 'a', bottomU: 1, template: t } });
});

const objects = () => currentRevision(findRoom(useWorkspaceStore.getState().workspace, 'r')!.room.plan).content.objects;

it('copies the selected rack and pastes copies side by side, devices and all, one undo step each', async () => {
  const user = userEvent.setup();
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/plan?sel=a'] })} />);
  await user.keyboard('{Control>}c{/Control}');
  expect(screen.getByRole('status')).toHaveTextContent('Copied ROW-A-01.');
  await user.keyboard('{Meta>}v{/Meta}{Meta>}v{/Meta}');
  // Default racks are 0.8 m wide and stand shoulder to shoulder.
  const racks = objects().filter((o): o is Rack => o.type === 'rack');
  expect(racks.map((r) => [r.name, r.x, r.y])).toEqual([['ROW-A-01', 0.5, 0.6], ['ROW-A-02', 1.3, 0.6], ['ROW-A-03', 2.1, 0.6]]);
  expect(racks[1]!.devices.map((d) => d.name)).toEqual(['SRV-02']);
  expect(screen.getByRole('status')).toHaveTextContent('Pasted ROW-A-03, a copy of ROW-A-01.');
  await user.keyboard('{Control>}z{/Control}');
  expect(objects()).toHaveLength(2);
});
