import { createWorkspace, withSample } from '@glasshouse/domain';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it } from 'vitest';
import { resetAuthStore, useAuthStore } from '../auth/authStore';
import { routes } from './routes';
import { resetWorkspaceStore, useWorkspaceStore } from '../store/workspaceStore';

beforeEach(() => {
  resetAuthStore();
  localStorage.clear();
  resetWorkspaceStore();
  const s = useWorkspaceStore.getState();
  s.setLoad({ kind: 'ready' });
  const ws = withSample(createWorkspace(), '2026-10-16T00:00:00.000Z');
  if (!ws.ok) throw new Error(ws.error.message);
  s.replace(ws.value);
});

const open = (path = '/') => {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
};

it('leads with the last room opened: its site, the room picked in the card, and every room with what holds its approval', () => {
  const mdf = useWorkspaceStore.getState().workspace.projects[0]!.sites[0]!.rooms.find((r) => r.name === 'MDF-1')!;
  localStorage.setItem('glasshouse:last-room', mdf.id);
  open();
  expect(screen.getByRole('heading', { level: 1, name: 'Bangna campus' })).toBeInTheDocument();
  const card = screen.getByRole('list', { name: 'Rooms in Bangna campus' });
  expect(within(card).getByRole('button', { name: 'Show MDF-1 in 3D' })).toHaveAttribute('aria-pressed', 'true');
  // In the card, holds are links to Review, in the Review badge's terms.
  expect(within(card).getByRole('link', { name: '1 blocking' })).toHaveAttribute('href', `/rooms/${mdf.id}/review`);
  expect(within(card).getByRole('link', { name: '1 to acknowledge' })).toHaveAttribute('href', `/rooms/${mdf.id}/review`);
  const cards = screen.getByRole('region', { name: /Bangna campus/ });
  const mdfCard = within(cards).getByRole('link', { name: 'MDF-1' }).closest('article')!;
  // A note is for reading, not a hold.
  expect(mdfCard).toHaveTextContent('2 before approval');
  expect(mdfCard).toHaveTextContent('Last opened');
  // Each hold leads to where it is resolved.
  expect(within(mdfCard).getByRole('link', { name: '1 blocking' })).toHaveAttribute('href', `/rooms/${mdf.id}/plan`);
  expect(within(mdfCard).queryByRole('link', { name: /note/ })).toBeNull();
  expect(within(cards).getByRole('link', { name: 'Server room A' }).closest('article')).toHaveTextContent('No issues · install sheet ready');
  // A room with holds leads with the way to them.
  expect(screen.getByRole('link', { name: /^Resolve 2 items/ })).toHaveAttribute('href', `/rooms/${mdf.id}/review`);
  expect(screen.getByRole('link', { name: 'Open MDF-1' })).toHaveAttribute('href', `/rooms/${mdf.id}/plan`);
});

it('adds a room to a site from Home and opens it', async () => {
  const user = userEvent.setup();
  const router = open();
  await user.click(screen.getByRole('button', { name: /^New room in Bangna campus/ }));
  expect(router.state.location.pathname).toMatch(/^\/rooms\/.+\/plan$/);
  expect(useWorkspaceStore.getState().workspace.projects[0]!.sites[0]!.rooms.map((r) => r.name)).toContain('New room');
});

it.each([
  ['viewer', false],
  ['editor', true],
] as const)('signed in as a %s, the New room card is present: %s', (role, present) => {
  useAuthStore.setState({ status: 'signed-in', user: { id: 'u1', name: 'Nok', email: 'n@x', role, mustChangePassword: false } });
  open();
  expect(screen.queryByRole('button', { name: /^New room in Bangna campus/ }) !== null).toBe(present);
  expect(screen.getByRole('region', { name: /Bangna campus/ })).toBeInTheDocument();
});
