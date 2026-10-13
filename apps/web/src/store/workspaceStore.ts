import {
  apply,
  createWorkspace,
  currentRevision,
  findRoom,
  replaceDraftContent,
  type DomainError,
  type Id,
  type PlanContent,
  type Workspace,
  type WorkspaceCommand,
} from '@glasshouse/domain';
import { create } from 'zustand';

export type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; at: Date } | { kind: 'failed'; reason: string };
export type LoadState = { kind: 'loading' } | { kind: 'ready' } | { kind: 'failed'; reason: string; raw: unknown };

export interface DispatchOptions {
  /** Consecutive edits with the same key in the same room inside COALESCE_WINDOW_MS become one undo step. */
  coalesceKey?: string;
}

/** Undo covers a room's Draft content only (design spec §5); hierarchy changes have their own confirmations. */
interface RoomHistory {
  past: PlanContent[];
  future: PlanContent[];
}

const HISTORY_LIMIT = 100;
const COALESCE_WINDOW_MS = 1000;
const READ_ONLY_ERROR: DomainError = {
  code: 'invalid_value',
  message: 'This tab is read-only because Glasshouse is open in another tab.',
  targets: [],
};

interface Data {
  workspace: Workspace;
  load: LoadState;
  save: SaveState;
  readOnly: boolean;
  history: Record<Id, RoomHistory>;
  lastEdit: { key: string; roomId: Id; at: number } | null;
}

export interface WorkspaceState extends Data {
  dispatch: (command: WorkspaceCommand, options?: DispatchOptions) => DomainError | null;
  undo: (roomId: Id) => void;
  redo: (roomId: Id) => void;
  replace: (workspace: Workspace) => void;
  setLoad: (load: LoadState) => void;
  setSave: (save: SaveState) => void;
  setReadOnly: (readOnly: boolean) => void;
}

const initialData = (): Data => ({
  workspace: createWorkspace(),
  load: { kind: 'loading' },
  save: { kind: 'idle' },
  readOnly: false,
  history: {},
  lastEdit: null,
});

const draftContent = (ws: Workspace, roomId: Id): PlanContent | null => {
  const loc = findRoom(ws, roomId);
  return loc ? currentRevision(loc.room.plan).content : null;
};

const emptyHistory = (): RoomHistory => ({ past: [], future: [] });

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => ({
  ...initialData(),
  dispatch: (command, options = {}) => {
    const state = get();
    if (state.readOnly) return READ_ONLY_ERROR;
    const result = apply(state.workspace, command);
    if (!result.ok) return result.error;
    if (command.type !== 'plan') {
      set({ workspace: result.value, lastEdit: null });
      return null;
    }
    const { roomId } = command;
    const before = draftContent(state.workspace, roomId);
    const now = Date.now();
    const key = options.coalesceKey;
    const last = state.lastEdit;
    const coalesce = key !== undefined && last !== null && last.key === key && last.roomId === roomId && now - last.at < COALESCE_WINDOW_MS;
    const h = state.history[roomId] ?? emptyHistory();
    const past = coalesce || before === null ? h.past : [...h.past, before].slice(-HISTORY_LIMIT);
    set({
      workspace: result.value,
      history: { ...state.history, [roomId]: { past, future: [] } },
      lastEdit: key === undefined ? null : { key, roomId, at: now },
    });
    return null;
  },
  undo: (roomId) => {
    const state = get();
    const h = state.history[roomId];
    const previous = h?.past[h.past.length - 1];
    const current = draftContent(state.workspace, roomId);
    if (!h || !previous || !current || state.readOnly) return;
    const result = replaceDraftContent(state.workspace, roomId, previous);
    if (!result.ok) return;
    set({
      workspace: result.value,
      history: { ...state.history, [roomId]: { past: h.past.slice(0, -1), future: [current, ...h.future] } },
      lastEdit: null,
    });
  },
  redo: (roomId) => {
    const state = get();
    const h = state.history[roomId];
    const next = h?.future[0];
    const current = draftContent(state.workspace, roomId);
    if (!h || !next || !current || state.readOnly) return;
    const result = replaceDraftContent(state.workspace, roomId, next);
    if (!result.ok) return;
    set({
      workspace: result.value,
      history: { ...state.history, [roomId]: { past: [...h.past, current], future: h.future.slice(1) } },
      lastEdit: null,
    });
  },
  replace: (workspace) => set({ workspace, history: {}, lastEdit: null }),
  setLoad: (load) => set({ load }),
  setSave: (save) => set({ save }),
  setReadOnly: (readOnly) => set({ readOnly }),
}));

export const resetWorkspaceStore = (): void => useWorkspaceStore.setState(initialData());
