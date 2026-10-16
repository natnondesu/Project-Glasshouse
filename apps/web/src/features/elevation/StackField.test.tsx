import { createObject, currentRevision, findRoom, type Rack, type Template } from '@glasshouse/domain';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it } from 'vitest';
import { routes } from '../../app/routes';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';
import { stackNameFor } from './StackField';

beforeEach(() => {
  resetWorkspaceStore();
  const s = useWorkspaceStore.getState();
  s.setLoad({ kind: 'ready' });
  const sw = s.workspace.catalog.find((x) => x.id === 'tpl-switch-1u') as Template;
  s.dispatch({ type: 'project/create', id: 'p', name: 'P' });
  s.dispatch({ type: 'site/create', projectId: 'p', id: 's', name: 'S' });
  s.dispatch({ type: 'room/create', siteId: 's', id: 'r', name: 'R' });
  for (const [id, x] of [['r1', 1], ['r2', 2.5]] as const) s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'object/add', object: { ...(createObject('rack', { x, y: 0.6 }, []) as Rack), id, name: id.toUpperCase() } } });
  for (const [id, rackId, name] of [['a', 'r1', 'CORE-SW-01'], ['b', 'r2', 'CORE-SW-02']] as const) {
    s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'device/place', id, rackId, bottomU: 40, template: sw } });
    s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'device/update', id, patch: { name } } });
  }
});

const stacks = () => currentRevision(findRoom(useWorkspaceStore.getState().workspace, 'r')!.room.plan).content.stacks;
const open = (sel: string) => render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [`/rooms/r/elevation?sel=${sel}`] })} />);

it('suggests a stack name from the switch name', () => {
  expect(stackNameFor('ICON-CS-B10-01')).toBe('ICON-CS-B10');
  expect(stackNameFor('core')).toBe('core');
});

it('starts a stack from one switch, adds another as the next member, and tags both in the rack', async () => {
  const user = userEvent.setup();
  const { unmount } = open('a');
  const group = () => screen.getByRole('group', { name: 'Stack' });
  await user.selectOptions(within(group()).getByRole('combobox'), 'New stack…');
  expect(within(group()).getByLabelText('Stack name')).toHaveValue('CORE-SW');
  await user.click(within(group()).getByRole('button', { name: 'Create stack' }));
  expect(stacks()).toMatchObject([{ name: 'CORE-SW', members: [{ deviceId: 'a', member: 1 }] }]);
  unmount();
  open('b');
  await user.selectOptions(within(group()).getByRole('combobox'), 'CORE-SW · 1 member');
  expect(stacks()![0]!.members).toEqual([{ deviceId: 'a', member: 1 }, { deviceId: 'b', member: 2 }]);
  expect(within(screen.getByRole('list', { name: 'Members of CORE-SW' })).getAllByRole('listitem')).toHaveLength(2);
  expect(screen.getByRole('button', { name: 'CORE-SW-01, U40' })).toHaveTextContent('S1');
  await user.click(within(group()).getByRole('button', { name: 'Leave stack' }));
  expect(stacks()![0]!.members).toEqual([{ deviceId: 'a', member: 1 }]);
});
