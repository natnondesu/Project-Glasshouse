import {
  apply,
  createWorkspace,
  currentRevision,
  findRoom,
  type DomainError,
  type Id,
  type PlanContent,
  type Result,
  type Workspace,
  type WorkspaceCommand,
} from '@glasshouse/domain';
import { create } from 'zustand';
import type { ConnectionStatus } from '../sync/syncClient';

export type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; at: Date } | { kind: 'failed'; reason: string };
type LoadState = { kind: 'loading' } | { kind: 'ready' } | { kind: 'failed'; reason: string; raw: unknown };

interface DispatchOptions {
  /** Consecutive edits with the same key in the same room inside COALESCE_WINDOW_MS become one undo step. */
  coalesceKey?: string;
}

/** Undo covers a room's Draft content only (design spec §5); hierarchy changes have their own confirmations. */
interface RoomHistory {
  past: PlanContent[];
  future: PlanContent[];
  /** Draft content right after this user's own last edit, undo or redo; undo checks it so other people's edits aren't overwritten. */
  head: PlanContent | null;
}

const HISTORY_LIMIT = 100;
const COALESCE_WINDOW_MS = 1000;
const READ_ONLY_ERROR: DomainError = {
  code: 'invalid_value',
  message: 'This tab is read-only because Glasshouse is open in another tab.',
  targets: [],
};

type Commit = (ws: Workspace, command: WorkspaceCommand) => Result<Workspace>;
let commit: Commit = apply;
/** Server mode sends every edit through the sync client; local mode applies it here. */
export function setCommit(next: Commit): void {
  commit = next;
}

export type ReadOnlyReason = 'other-tab' | 'offline' | 'view-only';

interface Data {
  workspace: Workspace;
  load: LoadState;
  save: SaveState;
  readOnly: boolean;
  readOnlyReason: ReadOnlyReason | null;
  history: Record<Id, RoomHistory>;
  lastEdit: { key: string; roomId: Id; at: number } | null;
  connection: 'local' | ConnectionStatus;
  notice: string | null;
}

interface WorkspaceState extends Data {
  dispatch: (command: WorkspaceCommand, options?: DispatchOptions) => DomainError | null;
  undo: (roomId: Id) => DomainError | null;
  redo: (roomId: Id) => DomainError | null;
  replace: (workspace: Workspace) => void;
  setLoad: (load: LoadState) => void;
  setSave: (save: SaveState) => void;
  setReadOnly: (readOnly: boolean, reason?: ReadOnlyReason) => void;
  adopt: (workspace: Workspace) => void;
  setConnection: (c: Data['connection']) => void;
  setNotice: (n: string | null) => void;
}

const initialData = (): Data => ({
  workspace: createWorkspace(),
  load: { kind: 'loading' },
  save: { kind: 'idle' },
  readOnly: false,
  readOnlyReason: null,
  history: {},
  lastEdit: null,
  connection: 'local',
  notice: null,
});

const draftContent = (ws: Workspace, roomId: Id): PlanContent | null => {
  const loc = findRoom(ws, roomId);
  return loc ? currentRevision(loc.room.plan).content : null;
};

const emptyHistory = (): RoomHistory => ({ past: [], future: [], head: null });

/** A Snapshot is a hard boundary: undo never reaches back across a review step, and an import may replace whole Rooms. */
function historyAfter(history: Record<Id, RoomHistory>, command: WorkspaceCommand): Record<Id, RoomHistory> {
  if (command.type === 'review') {
    const { [command.roomId]: _dropped, ...rest } = history;
    return rest;
  }
  if (command.type === 'project/import') return {};
  return history;
}

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => ({
  ...initialData(),
  dispatch: (command, options = {}) => {
    const state = get();
    if (state.readOnly) return READ_ONLY_ERROR;
    const result = commit(state.workspace, command);
    if (!result.ok) return result.error;
    if (command.type !== 'plan') {
      set({ workspace: result.value, history: historyAfter(state.history, command), lastEdit: null });
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
      history: { ...state.history, [roomId]: { past, future: [], head: draftContent(result.value, roomId) } },
      lastEdit: key === undefined ? null : { key, roomId, at: now },
    });
    return null;
  },
  undo: (roomId) => {
    const state = get();
    const h = state.history[roomId];
    const previous = h?.past[h.past.length - 1];
    const current = draftContent(state.workspace, roomId);
    if (!h || !previous || !current || state.readOnly) return null;
    const result = commit(state.workspace, { type: 'draft/replace', roomId, content: previous, expected: h.head ?? current });
    if (!result.ok) {
      set({ notice: result.error.message });
      return result.error;
    }
    set({
      workspace: result.value,
      history: { ...state.history, [roomId]: { past: h.past.slice(0, -1), future: [current, ...h.future], head: previous } },
      lastEdit: null,
    });
    return null;
  },
  redo: (roomId) => {
    const state = get();
    const h = state.history[roomId];
    const next = h?.future[0];
    const current = draftContent(state.workspace, roomId);
    if (!h || !next || !current || state.readOnly) return null;
    const result = commit(state.workspace, { type: 'draft/replace', roomId, content: next, expected: h.head ?? current });
    if (!result.ok) {
      set({ notice: result.error.message });
      return result.error;
    }
    set({
      workspace: result.value,
      history: { ...state.history, [roomId]: { past: [...h.past, current], future: h.future.slice(1), head: next } },
      lastEdit: null,
    });
    return null;
  },
  adopt: (workspace) => set({ workspace }),
  setConnection: (connection) => set({ connection }),
  setNotice: (notice) => set({ notice }),
  replace: (workspace) => set({ workspace, history: {}, lastEdit: null }),
  setLoad: (load) => set({ load }),
  setSave: (save) => set({ save }),
  setReadOnly: (readOnly, reason) => set((s) => ({ readOnly, readOnlyReason: readOnly ? (reason ?? s.readOnlyReason ?? 'other-tab') : null })),
}));

export const resetWorkspaceStore = (): void => {
  setCommit(apply);
  useWorkspaceStore.setState(initialData());
};
