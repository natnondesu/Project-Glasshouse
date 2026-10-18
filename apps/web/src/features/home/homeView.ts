import { useEffect, useLayoutEffect } from 'react';
import { useSearchParams } from 'react-router';
import { create } from 'zustand';
import { parseFilter, type RoomFilter } from './homeRooms';
import { parseScope, scopeParam, WORLD, type Scope } from './scope';

/** Where the globe flies when asked from outside it: a site (Enter on a site match) or a set of sites (Show matches). */
export type FrameTarget = { kind: 'site'; id: string } | { kind: 'points'; ids: string[] };

interface HomeViewState {
  q: string;
  scope: Scope;
  filter: RoomFilter;
  /** Counts Enter presses in the search; Home answers each one (open the top room, or fly to the site). */
  enterSeq: number;
  frame: { seq: number; target: FrameTarget } | null;
  setQ: (q: string) => void;
  setScope: (scope: Scope) => void;
  setFilter: (filter: RoomFilter) => void;
  enter: () => void;
  flyTo: (target: FrameTarget) => void;
  load: (params: URLSearchParams) => void;
  reset: () => void;
}

const EMPTY = { q: '', scope: WORLD, filter: 'all' as RoomFilter, enterSeq: 0, frame: null };

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
  load: (params) => set({ ...EMPTY, q: params.get('q') ?? '', scope: parseScope(params.get('scope')), filter: parseFilter(params.get('rooms')) }),
  reset: () => set(EMPTY),
}));

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

/** Reads the view from the address when Home opens, mirrors it back as it changes, and forgets it when Home closes. */
export function useHomeViewUrl(): void {
  const [params, setParams] = useSearchParams();
  const q = useHomeView((s) => s.q);
  const scope = useHomeView((s) => s.scope);
  const filter = useHomeView((s) => s.filter);

  useLayoutEffect(() => {
    useHomeView.getState().load(params);
    return () => useHomeView.getState().reset();
    // Only on opening Home: afterwards the view is the source and the address follows it.
  }, []);

  useEffect(() => {
    // From the store, not this render: on opening, the address has just been read into it.
    const next = viewParams(useHomeView.getState(), params);
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }, [q, scope, filter, params, setParams]);
}
