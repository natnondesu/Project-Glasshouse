import { resolveRemote, revisionIssues, siteLinkIssues, type CableEnd, type Id, type Issue, type RemoteEnd, type Revision, type Workspace } from '@glasshouse/domain';
import { useMemo } from 'react';
import type { Messages } from '../../i18n';
import { useWorkspaceStore } from '../../store/workspaceStore';

/** An uplink's far end as the cable schedule prints it: "IDF-2 · RK-01", the device and its port. */
export function farEndOf(ws: Workspace, m: Messages): (remote: RemoteEnd) => CableEnd {
  return (remote) => {
    const far = resolveRemote(ws, remote);
    return {
      rack: far.room ? (far.device ? `${far.room.name} · ${far.device.rack}` : far.room.name) : m.uplink.gone,
      device: far.device?.name ?? m.uplink.gone,
      port: remote.port,
    };
  };
}

/** A room's checks: its revision's own, plus its uplinks to other rooms of the site (warnings only). */
export function useRoomIssues(revision: Revision, roomId: Id): Issue[] {
  const ws = useWorkspaceStore((s) => s.workspace);
  return useMemo(() => [...revisionIssues(revision), ...siteLinkIssues(ws, roomId)], [revision, ws, roomId]);
}

/** Names uplinks' far devices for the network diagram: the device, and the room it is in. */
export function remoteNamer(ws: Workspace, m: Messages): (remote: RemoteEnd) => { name: string; where: string } {
  return (remote) => {
    const far = resolveRemote(ws, remote);
    return { name: far.device?.name ?? m.uplink.gone, where: m.uplink.box(far.room?.name ?? m.uplink.gone) };
  };
}
