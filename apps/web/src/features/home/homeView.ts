import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { create } from 'zustand';
import { parseFilter, type RoomFilter } from './homeRooms';
import { parseScope, scopeParam, WORLD, type Scope } from './scope';

/** Where the globe flies when asked from outside it: a site (a search pick), a set of sites (Show matches), or the whole world (the plain Home). */
export type FrameTarget = { kind: 'site'; id: string } | { kind: 'points'; ids: string[] } | { kind: 'world' };

interface HomeViewState {
  q: string;
  scope: Scope;
  filter: RoomFilter;
  /** Counts Enter presses in the search; Home answers each one (open the top room, or fly to the site). */
  enterSeq: number;
  frame: { seq: number; target: FrameTarget } | null;
  /** A room picked in the search: its site's card shows it. */
  cardRoom: { seq: number; siteId: string; roomId: string } | null;
  setQ: (q: string) => void;
  setScope: (scope: Scope) => void;
  setFilter: (filter: RoomFilter) => void;
  enter: () => void;
  flyTo: (target: FrameTarget) => void;
  showRoom: (siteId: string, roomId: string) => void;
  load: (params: URLSearchParams) => void;
  reset: () => void;
}

const EMPTY = { q: '', scope: WORLD, filter: 'all' as RoomFilter, enterSeq: 0, frame: null, cardRoom: null };

/**
 * Home's view: the search (typed in the title block), the globe's scope and the room chip. Home answers from this
 * state and mirrors it into the address (`?q=`, `?scope=`, `?rooms=`), so a filtered Home can be shared or reloaded;
 * the router updates the address in a transition, and typing must never read a stale view back from it.
 */
export const useHomeView = create<HomeViewState>()((set) => ({
  ...EMPTY,
  setQ: (q) => set({ q }),
  setScope: (scope) => set({ scope }),
  setFilter: (filter) => set({ filter }),
  enter: () => set((s) => ({ enterSeq: s.enterSeq + 1 })),
  flyTo: (target) => set((s) => ({ frame: { seq: (s.frame?.seq ?? 0) + 1, target } })),
  showRoom: (siteId, roomId) => set((s) => ({ cardRoom: { seq: (s.cardRoom?.seq ?? 0) + 1, siteId, roomId } })),
  // Enter presses and flights keep counting: a view read from the address must not replay or swallow one.
  load: (params) => set({ q: params.get('q') ?? '', scope: parseScope(params.get('scope')), filter: parseFilter(params.get('rooms')) }),
  reset: () => set(EMPTY),
}));

const VIEW_KEYS = ['q', 'scope', 'rooms'] as const;

/** Whether an address names a view; without one Home opens on the whole world. */
export const hasViewParams = (params: URLSearchParams): boolean => VIEW_KEYS.some((key) => (params.get(key) ?? '').trim() !== '');

export function viewParams(view: { q: string; scope: Scope; filter: RoomFilter }, base: URLSearchParams = new URLSearchParams()): URLSearchParams {
  const next = new URLSearchParams(base);
  const put = (key: string, value: string | null): void => {
    if (value) next.set(key, value);
    else next.delete(key);
  };
  put('q', view.q.trim() ? view.q : null);
  put('scope', scopeParam(view.scope));
  put('rooms', view.filter === 'all' ? null : view.filter);
  return next;
}

const isOwnWrite = (state: unknown): boolean => typeof state === 'object' && state !== null && (state as { homeView?: unknown }).homeView === true;

/** Typing settles this long before the address follows it. */
export const URL_TYPING_MS = 150;

/**
 * Keeps the view and the address in step both ways. The view writes the address (typing settles first, and only a
 * scope or chip change adds a history step); an address the view didn't write (the logo's plain "/", a pasted link,
 * back and forward) is read into the view, and a plain one flies the globe out to the world, even when the address
 * was plain already (the logo on a Home that wandered in). The view is forgotten when Home closes.
 */
export function useHomeViewUrl(): void {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const q = useHomeView((s) => s.q);
  const scope = useHomeView((s) => s.scope);
  const filter = useHomeView((s) => s.filter);
  // The query string this hook last wrote, or read: anything else in the address came from outside.
  const known = useRef<string | null>(null);
  // A navigation this hook didn't make (its own carry `homeView` state) is someone going there on purpose, even when
  // the address is the one already showing.
  const seenKey = useRef(location.key);
  const written = useRef({ scope: scopeParam(scope), filter });

  useLayoutEffect(() => {
    useHomeView.getState().load(params);
    known.current = params.toString();
    seenKey.current = location.key;
    const v = useHomeView.getState();
    written.current = { scope: scopeParam(v.scope), filter: v.filter };
    return () => useHomeView.getState().reset();
    // Only on opening Home; later address changes are handled below.
  }, []);

  // The address changed and the view didn't do it: read it in.
  useLayoutEffect(() => {
    const current = params.toString();
    const arrived = location.key !== seenKey.current && !isOwnWrite(location.state);
    seenKey.current = location.key;
    if (known.current === null || (current === known.current && !arrived)) return;
    // The same address again (the logo on a plain Home): the view already is that address, only the globe goes back
    // out. Reading it in again would also wipe what was typed while the router was still getting there.
    if (current === known.current) {
      if (!hasViewParams(params)) useHomeView.getState().flyTo({ kind: 'world' });
      return;
    }
    known.current = current;
    useHomeView.getState().load(params);
    const v = useHomeView.getState();
    written.current = { scope: scopeParam(v.scope), filter: v.filter };
    if (!hasViewParams(params)) v.flyTo({ kind: 'world' });
  }, [params, location.key]);

  useEffect(() => {
    const write = (): void => {
      // From the store, not this render: it may have moved on since.
      const v = useHomeView.getState();
      const next = viewParams(v, params);
      if (next.toString() === params.toString()) return;
      const step = scopeParam(v.scope) !== written.current.scope || v.filter !== written.current.filter;
      written.current = { scope: scopeParam(v.scope), filter: v.filter };
      known.current = next.toString();
      setParams(next, { replace: !step, state: { homeView: true } });
    };
    const typing = (useHomeView.getState().q.trim() ? useHomeView.getState().q : '') !== (params.get('q') ?? '');
    const onlyTyping = typing && scopeParam(scope) === written.current.scope && filter === written.current.filter;
    if (!onlyTyping) {
      write();
      return;
    }
    const timer = setTimeout(write, URL_TYPING_MS);
    return () => clearTimeout(timer);
  }, [q, scope, filter, params, setParams]);
}
