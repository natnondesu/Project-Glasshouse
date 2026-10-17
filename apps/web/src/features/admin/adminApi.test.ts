import { afterEach, expect, it, vi } from 'vitest';
import { createUser, resetPassword } from './adminApi';

afterEach(() => vi.restoreAllMocks());

const ok = () => new Response(JSON.stringify({ temporaryPassword: 'x' }), { status: 200, headers: { 'content-type': 'application/json' } });
const headersOf = (init: RequestInit | undefined) => new Headers(init?.headers);

it('sends a reset with no content-type, because Fastify refuses a JSON content-type with no body', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ok());
  await resetPassword('b');
  const init = fetchSpy.mock.calls[0]![1];
  expect(init?.method).toBe('POST');
  expect(init?.body).toBeUndefined();
  expect(headersOf(init).has('content-type')).toBe(false);
  expect(headersOf(init).get('x-glasshouse')).toBe('1');
});

it('still labels requests that carry a body as JSON', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ok());
  await createUser({ email: 'a@b.test', displayName: 'A', role: 'viewer' });
  expect(headersOf(fetchSpy.mock.calls[0]![1]).get('content-type')).toBe('application/json');
});
