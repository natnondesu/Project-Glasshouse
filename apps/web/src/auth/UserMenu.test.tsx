import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as serverMode from '../sync/serverMode';
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
