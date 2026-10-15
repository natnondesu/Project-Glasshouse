import { createObject, currentRevision, findRoom, racksOf, type Rack, type Template } from '@glasshouse/domain';
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
  s.dispatch({ type: 'room/create', siteId: 's', id: 'r', name: 'R' });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'object/add', object: { ...(createObject('rack', { x: 1, y: 0.6 }, []) as Rack), id: 'rk', name: 'RK-01' } } });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'device/place', id: 'srv', rackId: 'rk', bottomU: 1, template: t } });
});

const devices = () => racksOf(currentRevision(findRoom(useWorkspaceStore.getState().workspace, 'r')!.room.plan).content)[0]!.devices;

it('removes the selected device with Delete after a popup; Escape keeps it; typing in a field never deletes', async () => {
  const user = userEvent.setup();
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/elevation?sel=srv'] })} />);
  await user.click(screen.getByLabelText('Name'));
  await user.keyboard('{End}x{Backspace}');
  expect(screen.queryByRole('alertdialog')).toBeNull();
  // Selected through the URL; leave the Name field so the key reaches the page.
  await user.click(document.body);
  await user.keyboard('{Delete}');
  expect(screen.getByRole('alertdialog', { name: 'Remove SRV-01?' })).toBeInTheDocument();
  await user.keyboard('{Escape}');
  expect(devices()).toHaveLength(1);
  await user.keyboard('{Delete}');
  await user.keyboard('{Enter}');
  expect(devices()).toHaveLength(0);
});
