import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetPeopleStore, usePeopleStore } from './peopleStore';
import { personLabel } from '../ui/person';
import { messagesFor } from '../i18n';

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

describe('telling a removed person from one who is new to this tab', () => {
  const list = (...people: { id: string; name: string; email: string }[]) => new Response(JSON.stringify({ people }), { status: 200 });
  const ploy = { id: 'u1', name: 'Ploy', email: 'ploy@x.test' };
  const nok = { id: 'u2', name: 'Nok', email: 'nok@x.test' };

  it('marks nobody removed before the first list has loaded', () => {
    expect(usePeopleStore.getState().directory().isRemoved('u9')).toBe(false);
  });

  it('refetches once for an unknown id before calling that person removed, and marks them when still absent', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => list(nok));
    await usePeopleStore.getState().load();
    fetchSpy.mockClear();
    expect(usePeopleStore.getState().directory().isRemoved('u1')).toBe(false);
    expect(usePeopleStore.getState().directory().isRemoved('u1')).toBe(false);
    await vi.waitFor(() => expect(usePeopleStore.getState().directory().isRemoved('u1')).toBe(true));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(usePeopleStore.getState().directory().isRemoved('u2')).toBe(false);
  });

  it('does not mark someone who joined after the list was loaded', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => list(nok));
    await usePeopleStore.getState().load();
    fetchSpy.mockImplementation(async () => list(nok, ploy));
    expect(usePeopleStore.getState().directory().isRemoved('u1')).toBe(false);
    await vi.waitFor(() => expect(usePeopleStore.getState().byId.u1).toEqual({ name: 'Ploy', email: 'ploy@x.test' }));
    const d = usePeopleStore.getState().directory();
    expect(d.isRemoved('u1')).toBe(false);
    expect(personLabel(messagesFor('en'), { name: 'Ploy', userId: 'u1' }, d)).toBe('Ploy (ploy@x.test)');
  });

  it('does not mark anyone when the refetch fails', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => list(nok));
    await usePeopleStore.getState().load();
    fetchSpy.mockImplementation(async () => new Response('', { status: 502 }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(usePeopleStore.getState().directory().isRemoved('u1')).toBe(false);
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    expect(usePeopleStore.getState().directory().isRemoved('u1')).toBe(false);
  });
});
