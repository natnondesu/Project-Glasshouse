import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import { directoryOf, type Directory, type People } from '../ui/person';

interface PeopleState {
  byId: People;
  /** True once a list has arrived. Until then nobody can be called removed: a failed load must not mark the whole history. */
  loaded: boolean;
  /** People a fresh list confirmed are no longer accounts. History keeps their recorded names, marked removed. */
  gone: readonly string[];
  load: () => Promise<void>;
  /** What views look names up in. Reading it changes nothing but a note of which ids were unknown. */
  directory: () => Directory;
  /**
   * Refetches the list once for the unknown ids views have noted, then marks those still absent as removed.
   * Called from an effect, never during render. A failed check is not retried for a while and marks nobody.
   */
  confirmUnknown: () => Promise<void>;
}

/** After a failed check, wait this long before asking the server about the same person again. */
const RETRY_AFTER_MS = 30_000;

/** Ids views asked about that this tab has not seen, waiting for a check. Recording one is harmless to repeat, so it is safe during render. */
const unknown = new Set<string>();
/** Ids a fresh list has already answered (present or confirmed gone). */
const answered = new Set<string>();
const retryAt = new Map<string, number>();
let checking: Promise<void> | null = null;

function recordUnknown(id: string): void {
  if (!answered.has(id)) unknown.add(id);
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
  directory: () => directoryOf(get().byId, get().gone, get().loaded ? recordUnknown : undefined),
  confirmUnknown: () => {
    if (checking) return checking;
    const { loaded, byId } = get();
    if (!loaded) return Promise.resolve();
    const now = Date.now();
    const ids = [...unknown].filter((id) => !byId[id] && (retryAt.get(id) ?? 0) <= now);
    if (ids.length === 0) return Promise.resolve();
    checking = get()
      .load()
      .then(() => {
        const after = get();
        for (const id of ids) {
          answered.add(id);
          unknown.delete(id);
          retryAt.delete(id);
        }
        set({ gone: [...after.gone, ...ids.filter((id) => !after.byId[id] && !after.gone.includes(id))] });
      })
      .catch((e: unknown) => {
        // Unconfirmed, so unmarked: the name shows as recorded.
        for (const id of ids) retryAt.set(id, now + RETRY_AFTER_MS);
        console.warn('Could not confirm who was removed from the people list.', e);
      })
      .finally(() => {
        checking = null;
      });
    return checking;
  },
}));

export function usePeople(): Directory {
  const byId = usePeopleStore((s) => s.byId);
  const loaded = usePeopleStore((s) => s.loaded);
  const gone = usePeopleStore((s) => s.gone);
  const confirmUnknown = usePeopleStore((s) => s.confirmUnknown);
  // After every render: whatever it noted as unknown gets one check (a no-op when there is none).
  useEffect(() => {
    void confirmUnknown();
  });
  return useMemo(() => directoryOf(byId, gone, loaded ? recordUnknown : undefined), [byId, gone, loaded]);
}

export const resetPeopleStore = (): void => {
  unknown.clear();
  answered.clear();
  retryAt.clear();
  checking = null;
  usePeopleStore.setState({ byId: {}, loaded: false, gone: [] });
};
