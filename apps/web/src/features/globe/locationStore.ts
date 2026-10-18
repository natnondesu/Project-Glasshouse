import { create } from 'zustand';

interface LocationState {
  /** The site whose Location dialog is open. */
  editing: string | null;
  /** The site being placed by clicking Home's map. */
  placing: string | null;
  edit: (siteId: string) => void;
  place: (siteId: string) => void;
  done: () => void;
}

/** Shared by the tree's row action, the site card, the not-placed list and the map: one site at a time. */
export const useLocationStore = create<LocationState>((set) => ({
  editing: null,
  placing: null,
  edit: (siteId) => set({ editing: siteId, placing: null }),
  place: (siteId) => set({ editing: null, placing: siteId }),
  done: () => set({ editing: null, placing: null }),
}));
