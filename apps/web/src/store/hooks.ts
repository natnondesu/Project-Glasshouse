import { findRoom, type Id, type PlanCommand, type ReviewCommand, type RoomLocation } from '@glasshouse/domain';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useWorkspaceStore } from './workspaceStore';

export type CommitFn = (command: PlanCommand, coalesceKey?: string) => string | null;

export function useRoomLocation(roomId: string | null): RoomLocation | null {
  const workspace = useWorkspaceStore((s) => s.workspace);
  return useMemo(() => (roomId ? findRoom(workspace, roomId) : null), [workspace, roomId]);
}

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

export type ReviewFn = (command: ReviewCommand) => string | null;

export function useReviewCommit(roomId: Id): ReviewFn {
  const dispatch = useWorkspaceStore((s) => s.dispatch);
  return useCallback<ReviewFn>((command) => dispatch({ type: 'review', roomId, command })?.message ?? null, [dispatch, roomId]);
}
