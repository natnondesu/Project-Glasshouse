import { parseWorkspace } from '@glasshouse/domain';
import { apply } from '@glasshouse/domain';
import { useWorkspaceStore, setCommit } from '../store/workspaceStore';
import { httpTransport } from './httpTransport';
import { SyncClient, type Transport } from './syncClient';

/** Built with VITE_GLASSHOUSE_SERVER=1: the workspace lives on the Glasshouse server, not in this browser. */
export const SERVER_MODE = import.meta.env.VITE_GLASSHOUSE_SERVER === '1';

/** A blip shorter than this doesn't flash the read-only banner. */
export const OFFLINE_GRACE_MS = 3000;

const describe = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export async function startServerSync(transport: Transport = httpTransport(), isCancelled: () => boolean = () => false): Promise<() => void> {
  const store = useWorkspaceStore.getState();
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
  const client = new SyncClient(transport, { seq: snapshot.seq, workspace: parsed.value }, {
    onWorkspace: (ws) => useWorkspaceStore.getState().adopt(ws),
    onSave: (save) => useWorkspaceStore.getState().setSave(save),
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
    setCommit(apply);
    useWorkspaceStore.getState().setConnection('local');
    useWorkspaceStore.getState().setReadOnly(false);
  };
}
