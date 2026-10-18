import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as files from '../ui/files';
import * as serverMode from '../sync/serverMode';
import { resetWorkspaceStore, useWorkspaceStore } from '../store/workspaceStore';
import { takeStash } from '../sync/pendingStash';
import { resetAuthStore, useAuthStore } from './authStore';
import { UserMenu } from './UserMenu';

const edit = { commandId: 'c1', command: { type: 'project/create' as const, id: 'p', name: 'P' } };

beforeEach(() => {
  resetAuthStore();
  sessionStorage.clear();
  useAuthStore.setState({ status: 'signed-in', user: { id: 'u1', name: 'Ploy', email: 'p@x', role: 'editor', mustChangePassword: false } });
});
afterEach(() => vi.restoreAllMocks());

it('keeps an edit the server never confirmed when signing out, and still signs out', async () => {
  vi.spyOn(serverMode, 'getActiveSync').mockReturnValue({ clientId: 'tab-1', pendingCommands: () => [edit], flush: () => new Promise<void>(() => {}) });
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
  vi.useFakeTimers({ shouldAdvanceTime: true });
  render(<UserMenu />);
  await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByRole('button', { name: 'Account menu for Ploy' }));
  await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByRole('menuitem', { name: 'Sign out' }));
  await vi.advanceTimersByTimeAsync(5100);
  vi.useRealTimers();
  await vi.waitFor(() => expect(useAuthStore.getState().status).toBe('signed-out'));
  expect(fetchSpy).toHaveBeenCalledWith('/auth/logout', expect.objectContaining({ method: 'POST' }));
  expect(takeStash('u1')).toEqual({ clientId: 'tab-1', commands: [edit] });
});

const asRole = (role: 'editor' | 'admin'): void =>
  useAuthStore.setState({ status: 'signed-in', user: { id: 'u1', name: 'Ploy', email: 'p@x', role, mustChangePassword: false } });

it('offers the workspace backup to admins only', async () => {
  asRole('editor');
  const { unmount } = render(<MemoryRouter><UserMenu /></MemoryRouter>);
  await userEvent.click(screen.getByRole('button', { name: 'Account menu for Ploy' }));
  expect(screen.queryByRole('menuitem', { name: 'Download workspace backup' })).toBeNull();
  unmount();
  asRole('admin');
  render(<MemoryRouter><UserMenu /></MemoryRouter>);
  await userEvent.click(screen.getByRole('button', { name: 'Account menu for Ploy' }));
  expect(screen.getByRole('menuitem', { name: 'Download workspace backup' })).toBeInTheDocument();
});

it('downloads the backup under the name the server gives it', async () => {
  asRole('admin');
  const save = vi.spyOn(files, 'downloadJson').mockImplementation(() => {});
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ projects: [] }), { status: 200, headers: { 'content-disposition': 'attachment; filename="glasshouse-backup-2026-10-18.json"' } }));
  render(<MemoryRouter><UserMenu /></MemoryRouter>);
  await userEvent.click(screen.getByRole('button', { name: 'Account menu for Ploy' }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'Download workspace backup' }));
  await vi.waitFor(() => expect(save).toHaveBeenCalledWith('glasshouse-backup-2026-10-18.json', { projects: [] }));
  expect(fetchSpy).toHaveBeenCalledWith('/api/admin/backup');
});

it('says so when the backup cannot be downloaded', async () => {
  asRole('admin');
  resetWorkspaceStore();
  const save = vi.spyOn(files, 'downloadJson').mockImplementation(() => {});
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
  render(<MemoryRouter><UserMenu /></MemoryRouter>);
  await userEvent.click(screen.getByRole('button', { name: 'Account menu for Ploy' }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'Download workspace backup' }));
  await vi.waitFor(() => expect(useWorkspaceStore.getState().notice).toBe('The backup could not be downloaded (server answered 500).'));
  expect(save).not.toHaveBeenCalled();
});

it('says in the app language when the backup download cannot reach the server', async () => {
  asRole('admin');
  vi.spyOn(files, 'downloadJson').mockImplementation(() => {});
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
  render(<MemoryRouter><UserMenu /></MemoryRouter>);
  await userEvent.click(screen.getByRole('button', { name: 'Account menu for Ploy' }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'Download workspace backup' }));
  await vi.waitFor(() => expect(useWorkspaceStore.getState().notice).toBe('Could not reach the Glasshouse server. Check your connection and try again.'));
});

it('draws the account menu on a solid surface so it stays readable over the page', async () => {
  render(<MemoryRouter><UserMenu /></MemoryRouter>);
  await userEvent.click(screen.getByRole('button', { name: 'Account menu for Ploy' }));
  const menu = screen.getByRole('menu');
  expect(menu).toHaveClass('popover-surface');
  expect(menu).not.toHaveClass('glass');
});
