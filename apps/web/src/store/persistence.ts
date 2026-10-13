import { createWorkspace, parseWorkspace, withSample } from '@glasshouse/domain';
import type { Repository } from '../storage/repository';
import { useWorkspaceStore } from './workspaceStore';

export const SAVE_DEBOUNCE_MS = 400;
/**
 * Browsers don't let an IndexedDB write started during unload finish, so an edit made just before
 * a reload or tab close would be lost. A synchronous localStorage copy bridges that gap.
 */
export const UNLOAD_JOURNAL_KEY = 'glasshouse:unsaved-workspace';

function readJournal(): string | null {
  try {
    return localStorage.getItem(UNLOAD_JOURNAL_KEY);
  } catch {
    return null;
  }
}

function clearJournal(): void {
  try {
    localStorage.removeItem(UNLOAD_JOURNAL_KEY);
  } catch {
    // Storage blocked: nothing was journalled either.
  }
}

/** Returns false when the copy couldn't be written (quota, blocked storage), so the caller knows it may be lost. */
function writeJournal(workspace: unknown): boolean {
  try {
    localStorage.setItem(UNLOAD_JOURNAL_KEY, JSON.stringify(workspace));
    return true;
  } catch {
    return false;
  }
}

async function replayJournal(repo: Repository): Promise<boolean> {
  const text = readJournal();
  if (text === null || useWorkspaceStore.getState().readOnly) return false;
  clearJournal();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return false;
  }
  const parsed = parseWorkspace(raw);
  if (!parsed.ok) return false;
  const store = useWorkspaceStore.getState();
  store.replace(parsed.value);
  try {
    await repo.save(parsed.value);
    store.setSave({ kind: 'saved', at: new Date() });
  } catch (error) {
    store.setSave({ kind: 'failed', reason: describeError(error) });
  }
  store.setLoad({ kind: 'ready' });
  return true;
}

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export async function hydrate(repo: Repository): Promise<void> {
  const store = useWorkspaceStore.getState();
  if (await replayJournal(repo)) return;
  let raw: unknown;
  try {
    raw = await repo.load();
  } catch (error) {
    store.setLoad({ kind: 'failed', reason: `Couldn't read browser storage: ${describeError(error)}`, raw: null });
    return;
  }
  if (raw === null) {
    // FR13: every new workspace starts with the Sample Project. If it can't be built, start empty;
    // the tree's "Load sample project" then reports the reason.
    // A read-only tab must not invent its own sample: its IDs would not exist in the writer tab.
    if (useWorkspaceStore.getState().readOnly) {
      store.replace(createWorkspace());
      store.setLoad({ kind: 'ready' });
      return;
    }
    const seeded = withSample(createWorkspace(), new Date().toISOString());
    const fresh = seeded.ok ? seeded.value : createWorkspace();
    store.replace(fresh);
    // Saved now, not on the first edit: otherwise a reload seeds a new sample with new IDs and room links break.
    try {
      await repo.save(fresh);
      store.setSave({ kind: 'saved', at: new Date() });
    } catch (error) {
      store.setSave({ kind: 'failed', reason: describeError(error) });
    }
    store.setLoad({ kind: 'ready' });
    return;
  }
  const parsed = parseWorkspace(raw);
  if (!parsed.ok) {
    store.setLoad({ kind: 'failed', reason: parsed.error.message, raw });
    return;
  }
  store.replace(parsed.value);
  store.setLoad({ kind: 'ready' });
}

export function startPersistence(repo: Repository, delayMs = SAVE_DEBOUNCE_MS): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const save = (): void => {
    timer = null;
    repo.save(useWorkspaceStore.getState().workspace).then(
      () => {
        clearJournal();
        useWorkspaceStore.getState().setSave({ kind: 'saved', at: new Date() });
      },
      (error: unknown) => useWorkspaceStore.getState().setSave({ kind: 'failed', reason: describeError(error) }),
    );
  };
  const flush = (): void => {
    if (timer === null) return;
    clearTimeout(timer);
    save();
  };
  const onPageHide = (): void => {
    if (timer !== null) writeJournal(useWorkspaceStore.getState().workspace);
    flush();
  };
  // Hidden comes before unload and leaves time for the async write to finish.
  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') flush();
  };

  const unsubscribe = useWorkspaceStore.subscribe((state, previous) => {
    if (state.workspace === previous.workspace || state.load.kind !== 'ready' || state.readOnly) return;
    if (timer !== null) clearTimeout(timer);
    state.setSave({ kind: 'saving' });
    timer = setTimeout(save, delayMs);
  });
  window.addEventListener('pagehide', onPageHide);
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    unsubscribe();
    window.removeEventListener('pagehide', onPageHide);
    document.removeEventListener('visibilitychange', onVisibility);
    flush();
  };
}
