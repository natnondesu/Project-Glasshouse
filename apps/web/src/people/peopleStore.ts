import { create } from 'zustand';
import type { People } from '../ui/person';

interface PeopleState {
  byId: People;
  load: () => Promise<void>;
}

/** Server mode only. A failed load leaves names as they are stored (no email); it never blocks the app. */
export const usePeopleStore = create<PeopleState>()((set) => ({
  byId: {},
  load: async () => {
    const res = await fetch('/api/people', { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`The server answered ${res.status} for the people list.`);
    const body = (await res.json()) as { people: { id: string; name: string; email: string }[] };
    set({ byId: Object.fromEntries(body.people.map((p) => [p.id, { name: p.name, email: p.email }])) });
  },
}));

export const usePeople = (): People => usePeopleStore((s) => s.byId);
export const resetPeopleStore = (): void => usePeopleStore.setState({ byId: {} });
