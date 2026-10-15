import { createObject, currentRevision, findRoom, racksOf, type Rack, type Template } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it } from 'vitest';
import { routes } from '../../app/routes';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';
import { useDeviceClipboard } from './useCopyPaste';

beforeEach(() => {
  resetWorkspaceStore();
  useDeviceClipboard.getState().set(null);
  const s = useWorkspaceStore.getState();
  s.setLoad({ kind: 'ready' });
  const t = s.workspace.catalog.find((x) => x.id === 'tpl-server-2u') as Template;
  s.dispatch({ type: 'project/create', id: 'p', name: 'P' });
  s.dispatch({ type: 'site/create', projectId: 'p', id: 's', name: 'S' });
  s.dispatch({ type: 'room/create', siteId: 's', id: 'r', name: 'R' });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'object/add', object: { ...(createObject('rack', { x: 1, y: 0.6 }, []) as Rack), id: 'a', name: 'RK-01' } } });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'object/add', object: { ...(createObject('rack', { x: 2, y: 0.6 }, []) as Rack), id: 'b', name: 'RK-02' } } });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'device/place', id: 'srv', rackId: 'a', bottomU: 1, template: t } });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'device/update', id: 'srv', patch: { config: 'BIOS 2.1' } } });
});

const racks = () => racksOf(currentRevision(findRoom(useWorkspaceStore.getState().workspace, 'r')!.room.plan).content);

it('copies the selected device and pastes it into the selected rack at its lowest free U', async () => {
  const user = userEvent.setup();
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/elevation?sel=srv'] })} />);
  // Selected through the URL; the shortcut works wherever focus is, outside text fields.
  await user.keyboard('{Control>}c{/Control}');
  expect(screen.getByRole('status')).toHaveTextContent('Copied SRV-01.');
  await user.click(screen.getByRole('button', { name: 'RK-02' }));
  await user.keyboard('{Meta>}v{/Meta}');
  const pasted = racks().find((r) => r.id === 'b')!.devices;
  expect(pasted).toHaveLength(1);
  expect(pasted[0]).toMatchObject({ bottomU: 1, config: 'BIOS 2.1', name: 'SRV-02' });
  expect(screen.getByRole('status')).toHaveTextContent('Pasted a copy of SRV-01 into RK-02 at U1.');
  // The copy is selected; pasting again stacks the next one above it.
  await user.keyboard('{Control>}v{/Control}');
  expect(racks().find((r) => r.id === 'b')!.devices.map((d) => d.bottomU).sort()).toEqual([1, 3]);
});

it('leaves copy and paste in text fields alone', async () => {
  const user = userEvent.setup();
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/elevation?sel=srv'] })} />);
  await user.click(screen.getByLabelText('Name'));
  await user.keyboard('{Control>}c{/Control}{Control>}v{/Control}');
  expect(useDeviceClipboard.getState().copied).toBeNull();
  expect(racks().flatMap((r) => r.devices)).toHaveLength(1);
});
