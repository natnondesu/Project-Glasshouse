import type { WorkspaceCommand } from '@glasshouse/domain';
import type { Actor, LoggedCommand } from './store/commandStore';

/** Ids of the unverified dev stand-in (GLASSHOUSE_AUTH=dev-insecure) start with this; see devAuth. */
export const DEV_ACTOR_PREFIX = 'dev:';

/**
 * Whether an edit can be put to a person's name: someone signed in, never the dev stand-in. The id decides as well as
 * the flag, because entries read back from Postgres (catch-up, recovery) keep only id and name and say verified.
 */
export const isAttributable = (actor: Pick<Actor, 'id' | 'verified'>): boolean => actor.verified && !actor.id.startsWith(DEV_ACTOR_PREFIX);

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

/** The latest-edit record a logged command makes, if it names someone: every path (live, catch-up, recovery) uses this. */
export function roomEditOf(entry: LoggedCommand): RoomEdit | null {
  const roomId = editedRoom(entry.command);
  if (!roomId || !isAttributable(entry.actor) || !entry.receivedAt) return null;
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
