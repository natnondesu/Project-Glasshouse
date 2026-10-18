import { create } from 'zustand';

interface LocationState {
  /** The site whose Location dialog is open. */
  editing: string | null;
  /** The site being placed by clicking Home's map. */
  placing: string | null;
  /** A problem to show when the dialog opens again (a removal the server refused). */
  notice: string | null;
  /** The last location saved here (dialog or map), so Home can show that site. */
  saved: { siteId: string; at: number } | null;
  edit: (siteId: string, notice?: string) => void;
  place: (siteId: string) => void;
  done: () => void;
  markSaved: (siteId: string) => void;
}

/** Shared by the tree's row action, the site card, the not-placed list and the map: one site at a time. */
export const useLocationStore = create<LocationState>((set) => ({
  editing: null,
  placing: null,
  notice: null,
  saved: null,
  edit: (siteId, notice) => set({ editing: siteId, placing: null, notice: notice ?? null }),
  place: (siteId) => set({ editing: null, placing: siteId, notice: null }),
  done: () => set({ editing: null, placing: null, notice: null }),
  markSaved: (siteId) => set({ saved: { siteId, at: Date.now() } }),
}));
