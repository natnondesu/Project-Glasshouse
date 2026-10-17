import { canonicalJson } from './canonical';
import { findRoom } from './lookup';
import type { Id, Workspace } from './model/types';

export interface ApprovedChange {
  roomId: Id;
  roomName: string;
  revision: number;
}

/**
 * Approved revisions that `after` altered or removed while their room still exists. An approved revision is a
 * record: the whole revision (content, people, times, fingerprint) must come through byte-identical.
 */
export function approvedRevisionChanges(before: Workspace, after: Workspace): ApprovedChange[] {
  const changes: ApprovedChange[] = [];
  for (const project of before.projects) {
    for (const site of project.sites) {
      for (const room of site.rooms) {
        const now = findRoom(after, room.id);
        if (!now) continue;
        for (const rev of room.plan.revisions) {
          if (rev.state !== 'approved') continue;
          const same = now.room.plan.revisions.find((r) => r.number === rev.number);
          if (!same || canonicalJson(same) !== canonicalJson(rev)) changes.push({ roomId: room.id, roomName: now.room.name, revision: rev.number });
        }
      }
    }
  }
  return changes;
}

/**
 * Approved revisions of rooms that already exist in `before` that were not approved, byte-identical, in `before`.
 * Rooms new in `after` are not listed: an imported copy may carry approvals as history.
 */
export function newlyApprovedRevisions(before: Workspace, after: Workspace): ApprovedChange[] {
  const changes: ApprovedChange[] = [];
  for (const project of after.projects) {
    for (const site of project.sites) {
      for (const room of site.rooms) {
        const was = findRoom(before, room.id);
        if (!was) continue;
        for (const rev of room.plan.revisions) {
          if (rev.state !== 'approved') continue;
          const same = was.room.plan.revisions.find((r) => r.number === rev.number);
          if (!same || same.state !== 'approved' || canonicalJson(same) !== canonicalJson(rev)) changes.push({ roomId: room.id, roomName: room.name, revision: rev.number });
        }
      }
    }
  }
  return changes;
}
