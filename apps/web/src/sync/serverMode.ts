import { parseWorkspace, type WorkspaceCommand } from '@glasshouse/domain';
import { apply } from '@glasshouse/domain';
import { useAuthStore } from '../auth/authStore';
import { AuthError, type AuthUser } from '../auth/authApi';
import { messagesFor, useLangStore } from '../i18n';
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

/** The running sync, so the sign-out button can send or keep what is still unsent. */
export interface ActiveSync {
  clientId: string;
  pendingCommands(): { commandId: string; command: WorkspaceCommand }[];
  flush(): Promise<void>;
}
let activeSync: ActiveSync | null = null;
export const getActiveSync = (): ActiveSync | null => activeSync;

export async function startServerSync(transport: Transport = httpTransport(), isCancelled: () => boolean = () => false, me: AuthUser | null = null): Promise<() => void> {
  const store = useWorkspaceStore.getState();
  if (me) {
    const stash = takeStash(me.id);
    if (stash && stash.commands.length > 0) {
      const keep = (commands: typeof stash.commands): void => saveStash({ userId: me.id, clientId: stash.clientId, commands });
      const t = messagesFor(useLangStore.getState().lang).auth;
      try {
        const outcome = await transport.postCommands(stash.clientId, stash.commands);
        const skipped = stash.commands.filter((c) => outcome.skipped.includes(c.commandId));
        const notes = [outcome.rejected?.error.message, skipped.length > 0 ? t.skippedBefore(skipped.length) : null].filter((n): n is string => !!n);
        if (skipped.length > 0) keep(skipped);
        if (notes.length > 0) store.setNotice(notes.join(' '));
      } catch (e) {
        // Couldn't send them: keep them for the next try rather than lose them.
        keep(stash.commands);
        if (e instanceof AuthError) {
          useAuthStore.getState().signedOut(true);
          return () => {};
        }
        store.setNotice(t.unsentBefore(describe(e)));
      }
    }
  }
  let snapshot: { seq: number; workspace: unknown };
  try {
    snapshot = await transport.fetchWorkspace();
  } catch (e) {
    if (isCancelled()) return () => {};
    if (e instanceof AuthError) {
      useAuthStore.getState().signedOut(true);
      return () => {};
    }
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
  activeSync = client;
  setCommit((_ws, command) => client.dispatch(command));
  store.replace(parsed.value);
  store.setLoad({ kind: 'ready' });
  client.start();
  return () => {
    if (offlineTimer !== null) clearTimeout(offlineTimer);
    client.stop();
    if (activeSync === client) activeSync = null;
    unloadGuard.dispose();
    setCommit(apply);
    useWorkspaceStore.getState().setConnection('local');
    useWorkspaceStore.getState().setReadOnly(false);
  };
}
