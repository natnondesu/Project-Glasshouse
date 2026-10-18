import { createObject, type Rack } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it } from 'vitest';
import { resetWorkspaceStore, useWorkspaceStore } from '../store/workspaceStore';
import { routes } from './routes';

beforeEach(() => {
  localStorage.clear();
  resetWorkspaceStore();
  const s = useWorkspaceStore.getState();
  s.setLoad({ kind: 'ready' });
  s.dispatch({ type: 'project/create', id: 'p', name: 'P' });
  s.dispatch({ type: 'site/create', projectId: 'p', id: 's', name: 'S' });
  s.dispatch({ type: 'room/create', siteId: 's', id: 'r', floorAreaId: 'fa-r', name: 'MDF-1' });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'object/add', object: { ...(createObject('rack', { x: 1, y: 0.6 }, []) as Rack), id: 'rk', name: 'RK-01' } } });
});

const open = (path: string) => render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);

it('collapses the project tree on Home to a rail and remembers it', async () => {
  const user = userEvent.setup();
  const { unmount } = open('/');
  await user.click(screen.getByRole('button', { name: 'Hide projects' }));
  expect(screen.queryByRole('heading', { name: 'Projects' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Show projects' })).toHaveAttribute('aria-expanded', 'false');
  unmount();
  open('/');
  await user.click(screen.getByRole('button', { name: 'Show projects' }));
  expect(screen.getByRole('heading', { name: 'Projects' })).toBeInTheDocument();
});

it.each([
  ['plan', 'Survey'],
  ['elevation', 'Equipment details'],
])('collapses the %s inspector and brings it back', async (view, panel) => {
  const user = userEvent.setup();
  open(`/rooms/r/${view}`);
  expect(screen.getByRole('complementary', { name: panel })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Hide inspector' }));
  expect(screen.queryByRole('complementary', { name: panel })).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Show inspector' }));
  expect(screen.getByRole('complementary', { name: panel })).toBeInTheDocument();
});

it('starts the plan inspector collapsed on a narrow laptop until someone opens it, then remembers', async () => {
  const user = userEvent.setup();
  window.innerWidth = 1280;
  const { unmount } = open('/rooms/r/plan');
  expect(screen.queryByRole('complementary', { name: 'Survey' })).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Show inspector' }));
  expect(screen.getByRole('complementary', { name: 'Survey' })).toBeInTheDocument();
  unmount();
  open('/rooms/r/plan');
  expect(screen.getByRole('complementary', { name: 'Survey' })).toBeInTheDocument();
});
