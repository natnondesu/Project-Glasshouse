import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resetPeopleStore, usePeopleStore } from './peopleStore';

beforeEach(() => resetPeopleStore());
afterEach(() => vi.restoreAllMocks());

it('loads the directory keyed by person id', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ people: [{ id: 'u1', name: 'Ploy Sriwan', email: 'ploy@x.test' }] }), { status: 200 }));
  await usePeopleStore.getState().load();
  expect(usePeopleStore.getState().byId).toEqual({ u1: { name: 'Ploy Sriwan', email: 'ploy@x.test' } });
});

it('throws, and keeps what it had, when the server refuses', async () => {
  usePeopleStore.setState({ byId: { u1: { name: 'Ploy', email: 'p@x' } } });
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }));
  await expect(usePeopleStore.getState().load()).rejects.toThrow('404');
  expect(usePeopleStore.getState().byId).toEqual({ u1: { name: 'Ploy', email: 'p@x' } });
});
