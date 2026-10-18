import { createWorkspace, withSample } from '@glasshouse/domain';
import { act, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resetAuthStore, useAuthStore } from '../auth/authStore';
import { resetWorkspaceStore, useWorkspaceStore } from '../store/workspaceStore';
import { resetRoomEditsStore, useRoomEditsStore } from '../sync/roomEdits';
import { routes } from './routes';

// The shared server: Home's pick-up strip says who edited the room last.
vi.mock('../sync/serverMode', async (importOriginal) => ({ ...(await importOriginal<typeof import('../sync/serverMode')>()), SERVER_MODE: true }));

const NOW = new Date('2026-10-19T10:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(NOW);
  resetAuthStore();
  resetRoomEditsStore();
  localStorage.clear();
  resetWorkspaceStore();
  const s = useWorkspaceStore.getState();
  s.setLoad({ kind: 'ready' });
  const ws = withSample(createWorkspace(), '2026-10-16T00:00:00.000Z');
  if (!ws.ok) throw new Error(ws.error.message);
  s.replace(ws.value);
});
afterEach(() => vi.useRealTimers());

const mdf = () => useWorkspaceStore.getState().workspace.projects[0]!.sites[0]!.rooms.find((r) => r.name === 'MDF-1')!;
const open = () => render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/'] })} />);

it('says who edited the last room and how long ago', () => {
  localStorage.setItem('glasshouse:last-room', mdf().id);
  useRoomEditsStore.getState().setAll([{ roomId: mdf().id, userId: 'u-ploy', name: 'Ploy', at: '2026-10-19T08:00:00.000Z' }]);
  open();
  expect(screen.getByRole('region', { name: 'Pick up where you left off' })).toHaveTextContent('edited by Ploy 2 hours ago · R01 draft');
});

it('says "you" for the signed-in person’s own edit, and follows a new edit from the stream', () => {
  useAuthStore.setState({ status: 'signed-in', user: { id: 'u-me', name: 'Few', email: 'f@x', role: 'editor', mustChangePassword: false } });
  localStorage.setItem('glasshouse:last-room', mdf().id);
  useRoomEditsStore.getState().setAll([{ roomId: mdf().id, userId: 'u-me', name: 'Few', at: '2026-10-19T09:59:30.000Z' }]);
  open();
  const strip = screen.getByRole('region', { name: 'Pick up where you left off' });
  expect(strip).toHaveTextContent('edited by you just now');
  // The time moves on by itself.
  act(() => vi.advanceTimersByTime(61_000));
  expect(strip).toHaveTextContent('edited by you 1 minute ago');
  act(() => useRoomEditsStore.getState().record({ roomId: mdf().id, userId: 'u-ada', name: 'Ada', at: '2026-10-19T09:00:00.000Z' }));
  expect(strip).toHaveTextContent('edited by Ada 1 hour ago');
});
