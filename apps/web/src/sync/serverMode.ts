import { parseWorkspace } from '@glasshouse/domain';
import { apply } from '@glasshouse/domain';
import { useAuthStore } from '../auth/authStore';
import type { AuthUser } from '../auth/authApi';
import { useWorkspaceStore, setCommit } from '../store/workspaceStore';
import { httpTransport } from './httpTransport';
import { saveStash, takeStash } from './pendingStash';
import { createUnloadGuard } from './unloadGuard';
import { SyncClient, type Transport } from './syncClient';

/** Built with VITE_GLASSHOUSE_SERVER=1: the workspace lives on the Glasshouse server, not in this browser. */
export const SERVER_MODE = import.meta.env.VITE_GLASSHOUSE_SERVER === '1';

/** A blip shorter than this doesn't flash the read-only banner. */
export const OFFLINE_GRACE_MS = 3000;

const describe = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export async function startServerSync(transport: Transport = httpTransport(), isCancelled: () => boolean = () => false, me: AuthUser | null = null): Promise<() => void> {
  const store = useWorkspaceStore.getState();
  if (me) {
    const stash = takeStash(me.id);
    if (stash && stash.commands.length > 0) {
      try {
        const outcome = await transport.postCommands(stash.clientId, stash.commands);
        if (outcome.rejected) store.setNotice(outcome.rejected.error.message);
      } catch (e) {
        // Couldn't send them: keep them for the next try rather than lose them.
        saveStash({ userId: me.id, clientId: stash.clientId, commands: stash.commands });
        store.setNotice(`Some changes from before you signed in aren't sent yet: ${describe(e)}`);
      }
    }
  }
  let snapshot: { seq: number; workspace: unknown };
  try {
    snapshot = await transport.fetchWorkspace();
  } catch (e) {
    if (isCancelled()) return () => {};
    store.setLoad({ kind: 'failed', reason: describe(e), raw: null });
    return () => {};
  }
  if (isCancelled()) return () => {};
  const parsed = parseWorkspace(snapshot.workspace);
  if (!parsed.ok) {
    store.setLoad({ kind: 'failed', reason: parsed.error.message, raw: snapshot.workspace });
    return () => {};
  }
  let offlineTimer: ReturnType<typeof setTimeout> | null = null;
  const unloadGuard = createUnloadGuard(window);
  const client = new SyncClient(transport, { seq: snapshot.seq, workspace: parsed.value }, {
    onWorkspace: (ws) => useWorkspaceStore.getState().adopt(ws),
    onSave: (save) => useWorkspaceStore.getState().setSave(save),
    onUnsaved: (has) => unloadGuard.set(has),
    onAuthLost: () => {
      if (me) saveStash({ userId: me.id, clientId: client.clientId, commands: client.pendingCommands() });
      unloadGuard.set(false);
      useAuthStore.getState().signedOut(true);
    },
    onDropped: (dropped) => useWorkspaceStore.getState().setNotice(dropped.map((d) => d.error.message).join(' ')),
    onConnection: (status) => {
      const s = useWorkspaceStore.getState();
      if (status === 'live') {
        if (offlineTimer !== null) clearTimeout(offlineTimer);
        offlineTimer = null;
        s.setConnection('live');
        s.setReadOnly(false);
        return;
      }
      if (status === 'connecting') {
        s.setConnection('connecting');
        return;
      }
      offlineTimer ??= setTimeout(() => {
        offlineTimer = null;
        useWorkspaceStore.getState().setConnection('offline');
        useWorkspaceStore.getState().setReadOnly(true);
      }, OFFLINE_GRACE_MS);
    },
  });
  setCommit((_ws, command) => client.dispatch(command));
  store.replace(parsed.value);
  store.setLoad({ kind: 'ready' });
  client.start();
  return () => {
    if (offlineTimer !== null) clearTimeout(offlineTimer);
    client.stop();
    unloadGuard.dispose();
    setCommit(apply);
    useWorkspaceStore.getState().setConnection('local');
    useWorkspaceStore.getState().setReadOnly(false);
  };
}
