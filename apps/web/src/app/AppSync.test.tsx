import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resetAuthStore, useAuthStore } from '../auth/authStore';

const stopSync = vi.fn();
const startServerSync = vi.fn(async () => stopSync);
vi.mock('../sync/serverMode', () => ({ SERVER_MODE: true, startServerSync, getActiveSync: () => null }));

const person = (role: 'viewer' | 'editor') => ({ id: 'u1', name: 'Ploy', email: 'p@x', role, mustChangePassword: false });

beforeEach(() => {
  startServerSync.mockClear();
  stopSync.mockClear();
  resetAuthStore();
});
afterEach(() => resetAuthStore());

it('keeps the sync running when only the signed-in person’s role changes', async () => {
  const { App } = await import('./App');
  useAuthStore.setState({ status: 'signed-in', user: person('editor'), init: async () => {} });
  const view = render(<App />);
  await vi.waitFor(() => expect(startServerSync).toHaveBeenCalledTimes(1));

  act(() => useAuthStore.setState({ user: person('viewer') }));

  expect(startServerSync).toHaveBeenCalledTimes(1);
  expect(stopSync).not.toHaveBeenCalled();
  view.unmount();
});

it('restarts the sync for a different person', async () => {
  const { App } = await import('./App');
  useAuthStore.setState({ status: 'signed-in', user: person('editor'), init: async () => {} });
  const view = render(<App />);
  await vi.waitFor(() => expect(startServerSync).toHaveBeenCalledTimes(1));

  act(() => useAuthStore.setState({ user: { ...person('editor'), id: 'u2' } }));

  await vi.waitFor(() => expect(startServerSync).toHaveBeenCalledTimes(2));
  view.unmount();
});
