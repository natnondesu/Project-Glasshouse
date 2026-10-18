import { archiveState, findRoom, type ArchiveKind, type ArchiveState, type Id, type PlanCommand, type ReviewCommand, type RoomLocation } from '@glasshouse/domain';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useWorkspaceStore } from './workspaceStore';

export type CommitFn = (command: PlanCommand, coalesceKey?: string) => string | null;

export function useRoomLocation(roomId: string | null): RoomLocation | null {
  const workspace = useWorkspaceStore((s) => s.workspace);
  return useMemo(() => (roomId ? findRoom(workspace, roomId) : null), [workspace, roomId]);
}

/** Whether the item, or anything above it, is archived: then it is read-only. */
export function useArchiveState(kind: ArchiveKind, id: string | null): ArchiveState {
  const workspace = useWorkspaceStore((s) => s.workspace);
  return useMemo(() => archiveState(workspace, kind, id ?? ''), [workspace, kind, id]);
}

export const useRoomArchived = (roomId: string): boolean => useArchiveState('room', roomId).archived;

/** Plan commands for one room; returns the domain error message or null. */
export function usePlanCommit(roomId: Id): CommitFn {
  const dispatch = useWorkspaceStore((s) => s.dispatch);
  return useCallback<CommitFn>(
    (command, coalesceKey) => dispatch({ type: 'plan', roomId, command }, coalesceKey === undefined ? {} : { coalesceKey })?.message ?? null,
    [dispatch, roomId],
  );
}

/** One URL search param as state (selection, chosen template) so a view survives reloads and can be shared. */
export function useSearchParamState(key: string): [string | null, (value: string | null) => void] {
  const [params, setParams] = useSearchParams();
  const set = useCallback(
    (value: string | null) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true },
      ),
    [key, setParams],
  );
  return [params.get(key), set];
}

type ReviewFn = (command: ReviewCommand) => string | null;

export function useReviewCommit(roomId: Id): ReviewFn {
  const dispatch = useWorkspaceStore((s) => s.dispatch);
  return useCallback<ReviewFn>((command) => dispatch({ type: 'review', roomId, command })?.message ?? null, [dispatch, roomId]);
}

/** The revision number in `?rev=` when an older revision is being viewed; null for the current one. */
export function useViewedRevisionNumber(): number | null {
  const [params] = useSearchParams();
  const raw = params.get('rev');
  const n = raw === null ? NaN : Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * The room as it was at revision `n`, for read-only viewing: later revisions are dropped,
 * so every view that reads the "current" revision shows that one. Null if `n` is current or unknown.
 */
export function locationAtRevision(location: RoomLocation, n: number | null): RoomLocation | null {
  const revisions = location.room.plan.revisions;
  if (n === null || n === revisions[revisions.length - 1]?.number || !revisions.some((r) => r.number === n)) return null;
  return { ...location, room: { ...location.room, plan: { ...location.room.plan, revisions: revisions.filter((r) => r.number <= n) } } };
}
