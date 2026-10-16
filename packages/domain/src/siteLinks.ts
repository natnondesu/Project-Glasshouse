import type { Issue } from './checks/types';
import { findNode, findRackDevice, racksOf } from './devices';
import { currentRevision, findRoom } from './lookup';
import type { Id, Port, RemoteEnd, Room, Workspace } from './model/types';
import { linkAt, portsOf } from './ports';

/** A remote end resolved against its room's current revision; null parts no longer exist. */
export interface ResolvedRemote {
  room: Room | null;
  device: { id: Id; name: string; rack: string } | null;
  port: Port | null;
}

export function resolveRemote(ws: Workspace, remote: RemoteEnd): ResolvedRemote {
  const room = findRoom(ws, remote.roomId)?.room ?? null;
  if (!room) return { room: null, device: null, port: null };
  const content = currentRevision(room.plan).content;
  const rd = findRackDevice(content, remote.deviceId);
  const node = rd ? null : findNode(content, remote.deviceId);
  const device = rd ? { id: rd.device.id, name: rd.device.name, rack: rd.rack.name } : node ? { id: node.node.id, name: node.node.name, rack: node.rack.name } : null;
  const port = device ? (portsOf(content, device.id).find((p) => p.name === remote.port) ?? null) : null;
  return { room, device, port };
}

/** Other rooms of the same site: the only places an uplink can reach. */
export function siteRooms(ws: Workspace, roomId: Id): Room[] {
  const loc = findRoom(ws, roomId);
  return loc ? loc.site.rooms.filter((r) => r.id !== roomId) : [];
}

/** Every port in a room that is an uplink to another room, with its own device. */
export function uplinksOf(ws: Workspace, roomId: Id): { deviceId: Id; device: string; rack: string; port: Port; remote: RemoteEnd }[] {
  const room = findRoom(ws, roomId)?.room;
  if (!room) return [];
  const content = currentRevision(room.plan).content;
  return racksOf(content).flatMap((rack) =>
    rack.devices.flatMap((d) =>
      [d, ...(d.kind === 'chassis' ? d.nodes : [])].flatMap((owner) =>
        (owner.ports ?? []).filter((p) => p.remote).map((p) => ({ deviceId: owner.id, device: owner.name, rack: rack.name, port: p, remote: p.remote! })),
      ),
    ),
  );
}

const warn = (key: string, code: Issue['code'], message: string, hint: string, params: Issue['params'], targets: Id[]): Issue => ({ key, code, severity: 'warn', message, hint, params, targets });

/**
 * Uplinks to other rooms, checked from this room's side. Warnings only: the other room may not be
 * drawn yet, and each room approves on its own.
 */
export function siteLinkIssues(ws: Workspace, roomId: Id): Issue[] {
  return uplinksOf(ws, roomId).flatMap(({ deviceId, device, port, remote }): Issue[] => {
    const far = resolveRemote(ws, remote);
    const base = { device, port: port.name, room: far.room?.name ?? '', farDevice: far.device?.name ?? '', farPort: remote.port };
    const key = `${deviceId}:${port.name}`;
    if (!far.room || !far.device || !far.port) {
      return [warn(`remote_missing:${key}`, 'remote_missing', `${device} ${port.name} is an uplink to a port that no longer exists${far.room ? ` in ${far.room.name}` : ''}.`, 'Point it at a port that exists, or unlink it.', base, [deviceId])];
    }
    const farContent = currentRevision(far.room.plan).content;
    if (linkAt(farContent, { deviceId: far.device.id, port: far.port.name })) {
      return [warn(`remote_conflict:${key}`, 'remote_conflict', `${device} ${port.name} is an uplink to ${far.device.name} ${far.port.name} in ${far.room.name}, but that port is cabled inside its own room.`, `Unlink it in ${far.room.name}, or choose another port.`, base, [deviceId])];
    }
    const back = far.port.remote;
    if (!back || back.roomId !== roomId || back.deviceId !== deviceId || back.port !== port.name) {
      return [warn(`remote_unpaired:${key}`, 'remote_unpaired', `${device} ${port.name} is an uplink to ${far.device.name} ${far.port.name} in ${far.room.name}, but that port doesn't point back.`, `Set its uplink in ${far.room.name}'s next draft.`, base, [deviceId])];
    }
    return [];
  });
}
