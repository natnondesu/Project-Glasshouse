import { apply, createWorkspace, type DomainError, type Workspace, type WorkspaceCommand } from '@glasshouse/domain';
import { create } from 'zustand';

export type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; at: Date } | { kind: 'failed'; reason: string };
export type LoadState = { kind: 'loading' } | { kind: 'ready' } | { kind: 'failed'; reason: string; raw: unknown };

export interface DispatchOptions {
  /** Consecutive edits with the same key inside COALESCE_WINDOW_MS become one undo step (e.g. typing in a field). */
  coalesceKey?: string;
}

const HISTORY_LIMIT = 100;
const COALESCE_WINDOW_MS = 1000;

interface Data {
  workspace: Workspace;
  load: LoadState;
  save: SaveState;
  past: Workspace[];
  future: Workspace[];
  lastEdit: { key: string; at: number } | null;
}

export interface WorkspaceState extends Data {
  dispatch: (command: WorkspaceCommand, options?: DispatchOptions) => DomainError | null;
  undo: () => void;
  redo: () => void;
  replace: (workspace: Workspace) => void;
  setLoad: (load: LoadState) => void;
  setSave: (save: SaveState) => void;
}

const initialData = (): Data => ({
  workspace: createWorkspace(),
  load: { kind: 'loading' },
  save: { kind: 'idle' },
  past: [],
  future: [],
  lastEdit: null,
});

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => ({
  ...initialData(),
  dispatch: (command, options = {}) => {
    const state = get();
    const result = apply(state.workspace, command);
    if (!result.ok) return result.error;
    const now = Date.now();
    const key = options.coalesceKey;
    const coalesce = key !== undefined && state.lastEdit?.key === key && now - state.lastEdit.at < COALESCE_WINDOW_MS;
    set({
      workspace: result.value,
      past: coalesce ? state.past : [...state.past, state.workspace].slice(-HISTORY_LIMIT),
      future: [],
      lastEdit: key === undefined ? null : { key, at: now },
    });
    return null;
  },
  undo: () => {
    const { past, workspace, future } = get();
    const previous = past[past.length - 1];
    if (!previous) return;
    set({ workspace: previous, past: past.slice(0, -1), future: [workspace, ...future], lastEdit: null });
  },
  redo: () => {
    const { past, workspace, future } = get();
    const [next, ...rest] = future;
    if (!next) return;
    set({ workspace: next, past: [...past, workspace], future: rest, lastEdit: null });
  },
  replace: (workspace) => set({ workspace, past: [], future: [], lastEdit: null }),
  setLoad: (load) => set({ load }),
  setSave: (save) => set({ save }),
}));

export const resetWorkspaceStore = (): void => useWorkspaceStore.setState(initialData());
