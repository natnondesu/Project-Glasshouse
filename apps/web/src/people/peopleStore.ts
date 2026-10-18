import { useMemo } from 'react';
import { create } from 'zustand';
import { directoryOf, type Directory, type People } from '../ui/person';

interface PeopleState {
  byId: People;
  /** True once a list has arrived. Until then nobody can be called removed: a failed load must not mark the whole history. */
  loaded: boolean;
  /** People a fresh list confirmed are no longer accounts. History keeps their recorded names, marked removed. */
  gone: readonly string[];
  load: () => Promise<void>;
  /** What views look names up in. Asking about an id this tab has not seen queues one refresh before that person can be called removed. */
  directory: () => Directory;
}

/** Ids already asked about, so one unknown name costs one refresh rather than one per render. */
const asked = new Set<string>();
let queued: string[] = [];

function noteUnknown(id: string): void {
  if (asked.has(id) || usePeopleStore.getState().byId[id]) return;
  asked.add(id);
  queued.push(id);
  if (queued.length > 1) return;
  // Everything unknown in the same render pass is settled by one refresh.
  setTimeout(() => {
    const ids = queued;
    queued = [];
    usePeopleStore
      .getState()
      .load()
      .then(() => {
        const { byId, gone } = usePeopleStore.getState();
        usePeopleStore.setState({ gone: [...gone, ...ids.filter((x) => !byId[x] && !gone.includes(x))] });
      })
      .catch((e: unknown) => {
        // Unconfirmed, so unmarked: the name shows as recorded, and a later render may ask again.
        for (const x of ids) asked.delete(x);
        console.warn('Could not confirm who was removed from the people list.', e);
      });
  }, 0);
}

/** Server mode only. A failed load leaves names as they are stored (no email); it never blocks the app. */
export const usePeopleStore = create<PeopleState>()((set, get) => ({
  byId: {},
  loaded: false,
  gone: [],
  load: async () => {
    const res = await fetch('/api/people', { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`The server answered ${res.status} for the people list.`);
    const body = (await res.json()) as { people: { id: string; name: string; email: string }[] };
    const byId = Object.fromEntries(body.people.map((p) => [p.id, { name: p.name, email: p.email }]));
    set((s) => ({ byId, loaded: true, gone: s.gone.filter((id) => !byId[id]) }));
  },
  directory: () => directoryOf(get().byId, get().gone, get().loaded ? noteUnknown : undefined),
}));

export function usePeople(): Directory {
  const byId = usePeopleStore((s) => s.byId);
  const loaded = usePeopleStore((s) => s.loaded);
  const gone = usePeopleStore((s) => s.gone);
  return useMemo(() => directoryOf(byId, gone, loaded ? noteUnknown : undefined), [byId, gone, loaded]);
}

export const resetPeopleStore = (): void => {
  asked.clear();
  queued = [];
  usePeopleStore.setState({ byId: {}, loaded: false, gone: [] });
};
