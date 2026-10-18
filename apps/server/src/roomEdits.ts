import type { WorkspaceCommand } from '@glasshouse/domain';
import type { LoggedCommand } from './store/commandStore';

/** The latest change to a room by someone signed in: who, and when the server took it. Home says "edited by Ploy 2 h ago". */
export interface RoomEdit {
  roomId: string;
  userId: string;
  name: string;
  at: string;
}

/** The room a command changes, if it changes one: everything addressed to a room, and the room a create makes. */
export function editedRoom(command: WorkspaceCommand): string | null {
  if (command.type === 'room/create') return command.id;
  const roomId = (command as { roomId?: unknown }).roomId;
  return typeof roomId === 'string' ? roomId : null;
}

/** The dev stand-in is unverified, so nothing is stamped with its name (as for approvals). */
export function roomEditOf(entry: LoggedCommand): RoomEdit | null {
  const roomId = editedRoom(entry.command);
  if (!roomId || !entry.actor.verified || !entry.receivedAt) return null;
  return { roomId, userId: entry.actor.id, name: entry.actor.name, at: entry.receivedAt };
}

/** The latest edit of every room, seeded from the log at start and kept current as commands are accepted. */
export class RoomEdits {
  private readonly byRoom = new Map<string, RoomEdit>();

  constructor(initial: readonly RoomEdit[] = []) {
    for (const edit of initial) this.byRoom.set(edit.roomId, edit);
  }

  record(entry: LoggedCommand): RoomEdit | null {
    const edit = roomEditOf(entry);
    if (edit) this.byRoom.set(edit.roomId, edit);
    return edit;
  }

  /** Newest first; rooms that no longer exist are left out. */
  list(exists: (roomId: string) => boolean): RoomEdit[] {
    return [...this.byRoom.values()].filter((e) => exists(e.roomId)).sort((a, b) => b.at.localeCompare(a.at));
  }
}
