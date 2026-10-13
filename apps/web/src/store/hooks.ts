import { findRoom, type RoomLocation } from '@glasshouse/domain';
import { useMemo } from 'react';
import { useWorkspaceStore } from './workspaceStore';

export function useRoomLocation(roomId: string | null): RoomLocation | null {
  const workspace = useWorkspaceStore((s) => s.workspace);
  return useMemo(() => (roomId ? findRoom(workspace, roomId) : null), [workspace, roomId]);
}
