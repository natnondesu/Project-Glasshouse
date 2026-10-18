import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetPeopleStore, usePeople, usePeopleStore } from './peopleStore';
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
  const dir = () => usePeopleStore.getState().directory();
  const confirm = () => usePeopleStore.getState().confirmUnknown();

  it('marks nobody removed before the first list has loaded, and fetches nothing', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(dir().isRemoved('u9')).toBe(false);
    await confirm();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('asking about an id fetches nothing by itself; the confirmation does, once, and then marks the absent', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => list(nok));
    await usePeopleStore.getState().load();
    fetchSpy.mockClear();
    expect(dir().isRemoved('u1')).toBe(false);
    expect(dir().isRemoved('u1')).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    await confirm();
    await confirm();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(dir().isRemoved('u1')).toBe(true);
    expect(dir().isRemoved('u2')).toBe(false);
  });

  it('does not mark someone who joined after the list was loaded', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => list(nok));
    await usePeopleStore.getState().load();
    fetchSpy.mockImplementation(async () => list(nok, ploy));
    expect(dir().isRemoved('u1')).toBe(false);
    await confirm();
    expect(usePeopleStore.getState().byId.u1).toEqual({ name: 'Ploy', email: 'ploy@x.test' });
    expect(dir().isRemoved('u1')).toBe(false);
    expect(personLabel(messagesFor('en'), { name: 'Ploy', userId: 'u1' }, dir())).toBe('Ploy (ploy@x.test)');
  });

  it('does not mark anyone when the refetch fails, and waits before trying again', async () => {
    vi.useFakeTimers();
    try {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => list(nok));
      await usePeopleStore.getState().load();
      fetchSpy.mockClear();
      fetchSpy.mockImplementation(async () => new Response('', { status: 502 }));
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      expect(dir().isRemoved('u1')).toBe(false);
      await confirm();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(dir().isRemoved('u1')).toBe(false);
      await confirm();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      fetchSpy.mockImplementation(async () => list(nok));
      vi.setSystemTime(Date.now() + 31_000);
      dir().isRemoved('u1');
      await confirm();
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(dir().isRemoved('u1')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('usePeople in a component', () => {
  const Names = () => {
    const people = usePeople();
    return <p>{personLabel(messagesFor('en'), { name: 'Ploy', userId: 'u1' }, people)}</p>;
  };

  it('confirms an unknown id from an effect, once however often it renders, and then shows the removed mark', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ people: [{ id: 'u2', name: 'Nok', email: 'n@x' }] }), { status: 200 }));
    await usePeopleStore.getState().load();
    fetchSpy.mockClear();
    const { rerender } = render(<Names />);
    rerender(<Names />);
    rerender(<Names />);
    expect(await screen.findByText('Ploy (removed)')).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
