import { createObject, type Rack } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it } from 'vitest';
import { routes } from '../../app/routes';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';

beforeEach(() => {
  localStorage.clear();
  resetWorkspaceStore();
  const s = useWorkspaceStore.getState();
  s.setLoad({ kind: 'ready' });
  s.dispatch({ type: 'project/create', id: 'p', name: 'P' });
  s.dispatch({ type: 'site/create', projectId: 'p', id: 's', name: 'S' });
  s.dispatch({ type: 'room/create', siteId: 's', id: 'r', name: 'R' });
  const plan = (command: Parameters<typeof s.dispatch>[0] extends infer C ? C : never) => s.dispatch(command);
  plan({ type: 'plan', roomId: 'r', command: { type: 'object/add', object: { ...(createObject('rack', { x: 2, y: 1.5 }, []) as Rack), id: 'rk', name: 'RK-01' } } });
  plan({ type: 'plan', roomId: 'r', command: { type: 'object/add', object: { ...createObject('mcb', { x: 0, y: 1 }, []), id: 'm', angle: 270 } } });
  plan({ type: 'plan', roomId: 'r', command: { type: 'feed/add', feed: { id: 'f', rackId: 'rk', sourceId: 'm', label: 'Feed A' } } });
  plan({ type: 'plan', roomId: 'r', command: { type: 'dimension/add', dimension: { id: 'd', a: { kind: 'point', x: 0, y: 3 }, b: { kind: 'point', x: 2, y: 3 }, offset: 0 } } });
});

const open = () => render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/plan'] })} />);

it('hides dimensions, clearance zones and power feeds from the View menu, and remembers it', async () => {
  const user = userEvent.setup();
  const { container, unmount } = open();
  const count = (sel: string) => container.querySelectorAll(sel).length;
  expect(count('.plan-canvas .pdim')).toBe(1);
  expect(count('.plan-canvas .clearance')).toBe(2);
  expect(count('.plan-canvas .feed__run')).toBe(1);
  expect(count('.plan-canvas .dim__label')).toBe(2);

  await user.click(screen.getByRole('button', { name: 'View' }));
  await user.click(screen.getByRole('menuitemcheckbox', { name: 'Dimensions' }));
  await user.click(screen.getByRole('menuitemcheckbox', { name: 'Clearance zones' }));
  await user.click(screen.getByRole('menuitemcheckbox', { name: 'Power feeds' }));
  expect(count('.plan-canvas .pdim')).toBe(0);
  expect(count('.plan-canvas .dim__label')).toBe(0);
  expect(count('.plan-canvas .clearance')).toBe(0);
  expect(count('.plan-canvas .feed__run')).toBe(0);

  unmount();
  const again = open();
  expect(again.container.querySelectorAll('.plan-canvas .feed__run')).toHaveLength(0);
  await user.click(screen.getByRole('button', { name: 'View' }));
  expect(screen.getByRole('menuitemcheckbox', { name: 'Power feeds' })).toHaveAttribute('aria-checked', 'false');
});
