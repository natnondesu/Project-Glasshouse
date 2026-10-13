import { createWorkspace, parseWorkspace, withSample } from '@glasshouse/domain';
import type { Repository } from '../storage/repository';
import { useWorkspaceStore } from './workspaceStore';

export const SAVE_DEBOUNCE_MS = 400;

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export async function hydrate(repo: Repository): Promise<void> {
  const store = useWorkspaceStore.getState();
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
    const seeded = withSample(createWorkspace(), new Date().toISOString());
    store.replace(seeded.ok ? seeded.value : createWorkspace());
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
      () => useWorkspaceStore.getState().setSave({ kind: 'saved', at: new Date() }),
      (error: unknown) => useWorkspaceStore.getState().setSave({ kind: 'failed', reason: describeError(error) }),
    );
  };
  const flush = (): void => {
    if (timer === null) return;
    clearTimeout(timer);
    save();
  };

  const unsubscribe = useWorkspaceStore.subscribe((state, previous) => {
    if (state.workspace === previous.workspace || state.load.kind !== 'ready' || state.readOnly) return;
    if (timer !== null) clearTimeout(timer);
    state.setSave({ kind: 'saving' });
    timer = setTimeout(save, delayMs);
  });
  window.addEventListener('pagehide', flush);

  return () => {
    unsubscribe();
    window.removeEventListener('pagehide', flush);
    flush();
  };
}
