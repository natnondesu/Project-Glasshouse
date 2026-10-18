import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it } from 'vitest';
import { resetAuthStore, useAuthStore } from '../auth/authStore';
import { resetClaimsStore, useClaimsStore } from '../claims/claimsStore';
import { resetWorkspaceStore, useWorkspaceStore } from '../store/workspaceStore';
import { routes } from './routes';

beforeEach(() => {
  resetWorkspaceStore();
  resetAuthStore();
  resetClaimsStore();
  const s = useWorkspaceStore.getState();
  s.setLoad({ kind: 'ready' });
  s.dispatch({ type: 'project/create', id: 'p', name: 'P' });
  s.dispatch({ type: 'site/create', projectId: 'p', id: 's', name: 'S' });
  s.dispatch({ type: 'room/create', siteId: 's', id: 'r', floorAreaId: 'fa-r', name: 'MDF-1' });
  useAuthStore.setState({ status: 'signed-in', user: { id: 'u-me', name: 'Me', email: 'me@x', role: 'editor', mustChangePassword: false } });
});

const open = (view: string) => render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [`/rooms/r/${view}`] })} />);

it('shows who is editing and makes the draft read-only for everyone else', () => {
  useClaimsStore.getState().setClaims([{ roomId: 'r', userId: 'u-ada', name: 'Ada', since: 't', lastEditAt: new Date().toISOString() }]);
  open('plan');
  const chip = screen.getByRole('region', { name: 'Ada is editing this room.' });
  // A chip in the view-tab bar, not a strip of its own above the drawing.
  expect(screen.getByRole('navigation', { name: 'Room views' })).toContainElement(chip);
  expect(screen.getByLabelText('Width')).toBeDisabled();
});

it('leaves the draft editable when nobody holds the room', () => {
  open('plan');
  expect(screen.queryByRole('region', { name: /is editing this room/ })).toBeNull();
  expect(screen.getByLabelText('Width')).toBeEnabled();
});
