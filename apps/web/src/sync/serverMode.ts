import { apply, exportProjectFile, findRoom, parseWorkspace, type WorkspaceCommand } from '@glasshouse/domain';
import { useAuthStore } from '../auth/authStore';
import { AuthError, type AuthUser } from '../auth/authApi';
import { usePeopleStore, resetPeopleStore } from '../people/peopleStore';
import { resetClaimsStore, useClaimsStore, type Claim } from '../claims/claimsStore';
import { messagesFor, useLangStore } from '../i18n';
import { useWorkspaceStore, setCommit } from '../store/workspaceStore';
import { httpTransport } from './httpTransport';
import { saveStash, takeStash } from './pendingStash';
import { createUnloadGuard } from './unloadGuard';
import { SyncClient, type Transport } from './syncClient';

/** Built with VITE_GLASSHOUSE_SERVER=1: the workspace lives on the Glasshouse server, not in this browser. */
export const SERVER_MODE = import.meta.env.VITE_GLASSHOUSE_SERVER === '1';

/** A failed "who am I now" check is tried once more after this. */
export const ROLE_RECHECK_RETRY_MS = 2000;

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
  let snapshot: { seq: number; workspace: unknown; claims?: Claim[] };
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
  useClaimsStore.getState().setClaims(snapshot.claims ?? []);
  const viewOnly = (): boolean => useAuthStore.getState().user?.role === 'viewer';
  const loadPeople = (): void => {
    usePeopleStore.getState().load().catch((e: unknown) => console.warn('Could not load the people list; names show without email.', e));
  };
  let roleRetryTimer: ReturnType<typeof setTimeout> | null = null;
  // Dev mode has nobody to re-check, so only a signed-in tab asks the server who it is now.
  const recheckRole = (): void => {
    if (!me) return;
    const refresh = (): Promise<void> => useAuthStore.getState().refresh();
    refresh().catch(() => {
      roleRetryTimer = setTimeout(() => {
        roleRetryTimer = null;
        refresh().catch((e: unknown) => console.warn('Could not re-check your role.', e));
      }, ROLE_RECHECK_RETRY_MS);
    });
  };
  let hasBeenLive = false;
  let offlineTimer: ReturnType<typeof setTimeout> | null = null;
  const unloadGuard = createUnloadGuard(window);
  const client = new SyncClient(transport, { seq: snapshot.seq, workspace: parsed.value }, {
    onWorkspace: (ws) => useWorkspaceStore.getState().adopt(ws),
    onSave: (save) => useWorkspaceStore.getState().setSave(save),
    onUnsaved: (has) => unloadGuard.set(has),
    onAuthLost: () => {
      // Saving an empty list would replace another person's unsent edits waiting in this tab.
      const pending = client.pendingCommands();
      if (me && pending.length > 0) saveStash({ userId: me.id, clientId: client.clientId, commands: pending });
      unloadGuard.set(false);
      useAuthStore.getState().signedOut(true);
    },
    onClaims: (claims) => useClaimsStore.getState().setClaims(claims),
    onClaimLost: ({ roomId, workspace, changes }) => {
      const loc = findRoom(workspace, roomId);
      const file = loc ? exportProjectFile(workspace, loc.project.id, new Date().toISOString()) : null;
      if (!loc || !file?.ok) {
        useWorkspaceStore.getState().setNotice(messagesFor(useLangStore.getState().lang).claims.lostNoCopy);
        return;
      }
      useClaimsStore.getState().pushLost({ roomId, roomName: loc.room.name, holderName: useClaimsStore.getState().byRoom[roomId]?.name ?? null, changes, file: file.value });
    },
    onDropped: (dropped) => {
      useWorkspaceStore.getState().setNotice(dropped.map((d) => d.error.message).join(' '));
      if (dropped.some((d) => d.error.code === 'forbidden')) recheckRole();
    },
    onConnection: (status) => {
      const s = useWorkspaceStore.getState();
      if (status === 'live') {
        if (offlineTimer !== null) clearTimeout(offlineTimer);
        offlineTimer = null;
        s.setConnection('live');
        if (viewOnly()) s.setReadOnly(true, 'view-only');
        else s.setReadOnly(false);
        if (hasBeenLive && me) {
          recheckRole();
          loadPeople();
        }
        hasBeenLive = true;
        return;
      }
      if (status === 'connecting') {
        s.setConnection('connecting');
        return;
      }
      offlineTimer ??= setTimeout(() => {
        offlineTimer = null;
        useWorkspaceStore.getState().setConnection('offline');
        useWorkspaceStore.getState().setReadOnly(true, 'offline');
      }, OFFLINE_GRACE_MS);
    },
  });
  activeSync = client;
  setCommit((_ws, command) => client.dispatch(command));
  store.replace(parsed.value);
  store.setLoad({ kind: 'ready' });
  if (viewOnly()) store.setReadOnly(true, 'view-only');
  if (me) loadPeople();
  const unsubscribeAuth = useAuthStore.subscribe((s, prev) => {
    if (s.user?.role === prev.user?.role) return;
    const ws = useWorkspaceStore.getState();
    if (s.user?.role === 'viewer') ws.setReadOnly(true, 'view-only');
    else if (ws.readOnlyReason === 'view-only') ws.setReadOnly(false);
  });
  client.start();
  return () => {
    unsubscribeAuth();
    if (offlineTimer !== null) clearTimeout(offlineTimer);
    if (roleRetryTimer !== null) clearTimeout(roleRetryTimer);
    client.stop();
    if (activeSync === client) activeSync = null;
    unloadGuard.dispose();
    resetClaimsStore();
    resetPeopleStore();
    setCommit(apply);
    useWorkspaceStore.getState().setConnection('local');
    useWorkspaceStore.getState().setReadOnly(false);
  };
}
