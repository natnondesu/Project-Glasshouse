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
const bangna = () => useWorkspaceStore.getState().workspace.projects[0]!.sites[0]!;
const atBangna = () => `/?scope=site:${bangna().id}`;

it('offers the last room opened in the workspace bar, and marks it among every room with what holds its approval', () => {
  const mdf = bangna().rooms.find((r) => r.name === 'MDF-1')!;
  localStorage.setItem('glasshouse:last-room', mdf.id);
  open();
  expect(screen.getByRole('heading', { level: 1, name: 'Workspace' })).toBeInTheDocument();
  const strip = screen.getByRole('region', { name: 'Pick up where you left off' });
  expect(strip).toHaveTextContent('MDF-1 · Bangna campus');
  expect(strip).toHaveTextContent('R01 draft');
  // Browser mode: nobody signed in made the edit, so no "edited by".
  expect(strip).not.toHaveTextContent('edited by');
  expect(strip).toHaveTextContent('1 blocking');
  expect(within(strip).getByRole('link', { name: 'Continue to MDF-1' })).toHaveAttribute('href', `/rooms/${mdf.id}/plan`);
  // No New project or New room in the bar: the tree has them.
  const bar = within(document.querySelector<HTMLElement>('.workspace-bar')!);
  expect(bar.queryAllByRole('button')).toHaveLength(0);
  expect(bar.getAllByRole('link').map((l) => l.getAttribute('aria-label'))).toEqual(['Continue to MDF-1']);
  const cards = screen.getByRole('region', { name: 'All rooms' });
  const mdfCard = within(cards).getByRole('link', { name: 'MDF-1' }).closest('article')!;
  // A note is for reading, not a hold.
  expect(mdfCard).toHaveTextContent('2 before approval');
  expect(mdfCard).toHaveTextContent('Last opened');
  expect(mdfCard).toHaveTextContent('Bangna campus · Sample · Northgate DC');
  // Each hold leads to where it is resolved.
  expect(within(mdfCard).getByRole('link', { name: '1 blocking' })).toHaveAttribute('href', `/rooms/${mdf.id}/plan`);
  expect(within(mdfCard).queryByRole('link', { name: /note/ })).toBeNull();
  expect(within(cards).getByRole('link', { name: 'Server room A' }).closest('article')).toHaveTextContent('No issues · install sheet ready');
});

it('offers the first room with holds when no room was opened yet', () => {
  open();
  const strip = screen.getByRole('region', { name: 'Needs attention next' });
  expect(within(strip).getByRole('link', { name: 'Continue to MDF-1' })).toBeInTheDocument();
});

it('leads the picked site’s card with the way to its holds, in the Review badge’s terms', () => {
  const mdf = bangna().rooms.find((r) => r.name === 'MDF-1')!;
  localStorage.setItem('glasshouse:last-room', mdf.id);
  open(atBangna());
  const card = screen.getByRole('list', { name: 'Rooms in Bangna campus' });
  expect(within(card).getByRole('button', { name: 'Show MDF-1 in 3D' })).toHaveAttribute('aria-pressed', 'true');
  // In the card, holds are links to Review, in the Review badge's terms.
  expect(within(card).getByRole('link', { name: '1 blocking' })).toHaveAttribute('href', `/rooms/${mdf.id}/review`);
  expect(within(card).getByRole('link', { name: '1 to acknowledge' })).toHaveAttribute('href', `/rooms/${mdf.id}/review`);
  // A room with holds leads with the way to them.
  expect(screen.getByRole('link', { name: /^Resolve 2 items/ })).toHaveAttribute('href', `/rooms/${mdf.id}/review`);
  expect(screen.getByRole('link', { name: 'Open MDF-1' })).toHaveAttribute('href', `/rooms/${mdf.id}/plan`);
});

it('adds a room to a site from Home and opens it', async () => {
  const user = userEvent.setup();
  const router = open(atBangna());
  await user.click(within(screen.getByRole('region', { name: 'Rooms in Bangna campus' })).getByRole('button', { name: /^New room in Bangna campus/ }));
  expect(router.state.location.pathname).toMatch(/^\/rooms\/.+\/plan$/);
  expect(useWorkspaceStore.getState().workspace.projects[0]!.sites[0]!.rooms.map((r) => r.name)).toContain('New room');
});

it.each([
  ['viewer', false],
  ['editor', true],
] as const)('signed in as a %s, the New room card is present: %s', (role, present) => {
  useAuthStore.setState({ status: 'signed-in', user: { id: 'u1', name: 'Nok', email: 'n@x', role, mustChangePassword: false } });
  open(atBangna());
  expect(screen.queryByRole('button', { name: /^New room in Bangna campus/ }) !== null).toBe(present);
  expect(screen.getByRole('region', { name: 'Rooms in Bangna campus' })).toBeInTheDocument();
});

it.each([
  [{}, 'Ploy (unverified)'],
  [{ byId: 'u1' }, 'Ploy S.'],
])('labels the picked room’s designer by whether they signed in (%j)', (who, label) => {
  const s = useWorkspaceStore.getState();
  const mdf = s.workspace.projects[0]!.sites[0]!.rooms.find((r) => r.name === 'MDF-1')!;
  localStorage.setItem('glasshouse:last-room', mdf.id);
  s.dispatch({ type: 'review', roomId: mdf.id, command: { type: 'review/submit', designedBy: 'byId' in who ? 'Ploy S.' : 'Ploy', ...who, at: '2026-10-15T09:00:00.000Z' } });
  open(atBangna());
  const stamp = document.querySelector('.site-card__stamp')!;
  expect(stamp).toHaveTextContent('IN REVIEW');
  expect(stamp).toHaveTextContent(`R01 · 2026-10-15 · ${label}`);
  if ('byId' in who) expect(stamp).not.toHaveTextContent('unverified');
});

it('stamps an approved room with its approver and offers its Install sheet', () => {
  open(atBangna());
  const stamp = document.querySelector('.site-card__stamp')!;
  expect(stamp).toHaveTextContent('APPROVED');
  expect(stamp).toHaveTextContent(/R01 · \d{4}-\d{2}-\d{2} · .+/);
  expect(screen.getByRole('link', { name: 'Install sheet · R01' })).toHaveAttribute('href', expect.stringMatching(/install-sheet$/));
});

it('shows no search on a Home with nothing to search', () => {
  resetWorkspaceStore();
  useWorkspaceStore.getState().setLoad({ kind: 'ready' });
  open();
  expect(screen.getByRole('heading', { level: 1, name: 'Start with a project' })).toBeInTheDocument();
  expect(screen.queryByRole('combobox', { name: 'Search sites and rooms' })).toBeNull();
});
