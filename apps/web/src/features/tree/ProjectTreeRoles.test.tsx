import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it } from 'vitest';
import { routes } from '../../app/routes';
import type { Role } from '../../auth/authApi';
import { resetAuthStore, useAuthStore } from '../../auth/authStore';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';

function signInAs(role: Role): void {
  useAuthStore.setState({ status: 'signed-in', user: { id: 'u', name: 'U', email: 'u@company.test', role, mustChangePassword: false } });
}

beforeEach(() => {
  resetAuthStore();
  resetWorkspaceStore();
  const { dispatch, setLoad } = useWorkspaceStore.getState();
  setLoad({ kind: 'ready' });
  dispatch({ type: 'project/create', id: 'p', name: 'Northgate' });
  dispatch({ type: 'site/create', projectId: 'p', id: 's', name: 'Site A' });
  dispatch({ type: 'room/create', siteId: 's', id: 'r', floorAreaId: 'fa', name: 'MDF-1' });
});

const open = () => render(<RouterProvider router={createMemoryRouter(routes)} />);
const control = (name: string | RegExp) => screen.queryByRole('button', { name });

it('gives a viewer a read-only tree: no import, new, add, rename, delete or sample', () => {
  signInAs('viewer');
  open();
  expect(screen.getAllByRole('link', { name: /MDF-1/ }).length).toBeGreaterThan(0);
  for (const name of ['Import project file', 'New project', 'Add site to Northgate', 'Add room to Site A', 'Rename Northgate', 'Rename Site A', 'Rename MDF-1', 'Delete Northgate', 'Delete Site A', 'Delete MDF-1', 'Load sample project']) {
    expect(control(name), name).not.toBeInTheDocument();
  }
  expect(control(/^Add the sample/)).not.toBeInTheDocument();
  expect(control(/Collapse Northgate/i)).toBeInTheDocument();
});

it('lets an editor build and rename and delete sites and rooms, but not delete a project', () => {
  signInAs('editor');
  open();
  for (const name of ['Import project file', 'New project', 'Add site to Northgate', 'Add room to Site A', 'Rename Northgate', 'Delete Site A', 'Delete MDF-1']) {
    expect(control(name), name).toBeInTheDocument();
  }
  expect(control('Delete Northgate')).not.toBeInTheDocument();
});

it('lets an admin delete a project', () => {
  signInAs('admin');
  open();
  expect(control('Delete Northgate')).toBeInTheDocument();
  expect(control('Delete Site A')).toBeInTheDocument();
});

it('leaves local mode unchanged: everything is available', () => {
  open();
  expect(control('Delete Northgate')).toBeInTheDocument();
  expect(control('New project')).toBeInTheDocument();
});
