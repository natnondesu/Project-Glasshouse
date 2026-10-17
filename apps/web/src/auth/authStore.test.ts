import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resetAuthStore, useAuthStore } from './authStore';

const respond = (routes: Record<string, [number, unknown]>) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const [status, body] = routes[String(input)] ?? [404, {}];
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  });

beforeEach(() => resetAuthStore());
afterEach(() => vi.restoreAllMocks());

it('knows dev mode, signed-out, must-change and signed-in', async () => {
  respond({ '/auth/config': [200, { mode: 'dev' }] });
  await useAuthStore.getState().init();
  expect(useAuthStore.getState().status).toBe('dev');

  vi.restoreAllMocks();
  respond({ '/auth/config': [200, { mode: 'on', localLogin: true, sso: true }], '/auth/me': [401, { error: { code: 'unauthorised' } }] });
  await useAuthStore.getState().init();
  expect(useAuthStore.getState()).toMatchObject({ status: 'signed-out', config: { sso: true } });

  vi.restoreAllMocks();
  respond({ '/auth/config': [200, { mode: 'on', localLogin: true, sso: false }], '/auth/me': [200, { id: 'u1', name: 'Ploy', email: 'p@x', role: 'editor', mustChangePassword: true }] });
  await useAuthStore.getState().init();
  expect(useAuthStore.getState().status).toBe('must-change');
});

it('refresh adopts a changed role, and signs out with a notice when the session is gone', async () => {
  useAuthStore.setState({ status: 'signed-in', user: { id: 'u1', name: 'Ploy', email: 'p@x', role: 'viewer', mustChangePassword: false } });
  respond({ '/auth/me': [200, { id: 'u1', name: 'Ploy', email: 'p@x', role: 'editor', mustChangePassword: false }] });
  await useAuthStore.getState().refresh();
  expect(useAuthStore.getState()).toMatchObject({ status: 'signed-in', user: { role: 'editor' } });

  vi.restoreAllMocks();
  respond({ '/auth/me': [401, { error: { code: 'unauthorised' } }] });
  await useAuthStore.getState().refresh();
  expect(useAuthStore.getState()).toMatchObject({ status: 'signed-out', user: null, sessionEnded: true });
});
