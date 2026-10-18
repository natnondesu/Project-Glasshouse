import { create } from 'zustand';

/** The latest change to a room by someone signed in, as the server logged it. Matches the server's RoomEdit. */
export interface RoomEdit {
  roomId: string;
  userId: string;
  name: string;
  at: string;
}

interface RoomEditsState {
  byRoom: Record<string, RoomEdit>;
  setAll: (list: RoomEdit[]) => void;
  record: (edit: RoomEdit) => void;
}

/** Shared-server only: filled from the workspace snapshot and kept current by the event stream. */
export const useRoomEditsStore = create<RoomEditsState>()((set) => ({
  byRoom: {},
  setAll: (list) => set({ byRoom: Object.fromEntries(list.map((e) => [e.roomId, e])) }),
  record: (edit) => set((s) => ({ byRoom: { ...s.byRoom, [edit.roomId]: edit } })),
}));

export const resetRoomEditsStore = (): void => useRoomEditsStore.setState({ byRoom: {} });
