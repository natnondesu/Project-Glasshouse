import { createWorkspace, withSample } from '@glasshouse/domain';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it } from 'vitest';
import { routes } from './routes';
import { resetWorkspaceStore, useWorkspaceStore } from '../store/workspaceStore';

beforeEach(() => {
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

it('leads with the last room opened, and lists every room with what holds its approval', () => {
  const mdf = useWorkspaceStore.getState().workspace.projects[0]!.sites[0]!.rooms.find((r) => r.name === 'MDF-1')!;
  localStorage.setItem('glasshouse:last-room', mdf.id);
  open();
  expect(screen.getByRole('heading', { level: 1, name: 'MDF-1' })).toBeInTheDocument();
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
});

it('adds a room to a site from Home and opens it', async () => {
  const user = userEvent.setup();
  const router = open();
  await user.click(screen.getByRole('button', { name: /^New room in Bangna campus/ }));
  expect(router.state.location.pathname).toMatch(/^\/rooms\/.+\/plan$/);
  expect(useWorkspaceStore.getState().workspace.projects[0]!.sites[0]!.rooms.map((r) => r.name)).toContain('New room');
});

it.each([
  [{}, 'Ploy (unverified)'],
  [{ byId: 'u1' }, 'Ploy S.'],
])('labels the hero person by whether they signed in (%j)', (who, label) => {
  const s = useWorkspaceStore.getState();
  const mdf = s.workspace.projects[0]!.sites[0]!.rooms.find((r) => r.name === 'MDF-1')!;
  localStorage.setItem('glasshouse:last-room', mdf.id);
  s.dispatch({ type: 'review', roomId: mdf.id, command: { type: 'review/submit', designedBy: 'byId' in who ? 'Ploy S.' : 'Ploy', ...who, at: '2026-10-15T09:00:00.000Z' } });
  open();
  const stamp = document.querySelector('.home-hero__stamp')!;
  expect(stamp).toHaveTextContent(label);
  if ('byId' in who) expect(stamp).not.toHaveTextContent('unverified');
});
