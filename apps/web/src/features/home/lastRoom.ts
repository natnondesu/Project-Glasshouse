import { useEffect } from 'react';

const LAST_ROOM_KEY = 'glasshouse:last-room';

/** Remembers the room on screen, so Home can offer it back first. Storage can fail (private mode): then Home just starts with the first room. */
export function useRememberRoom(roomId: string | null): void {
  useEffect(() => {
    if (!roomId) return;
    try {
      localStorage.setItem(LAST_ROOM_KEY, roomId);
    } catch (error) {
      console.warn('Glasshouse could not remember the last room', error);
    }
  }, [roomId]);
}

export function lastRoomId(): string | null {
  try {
    return localStorage.getItem(LAST_ROOM_KEY);
  } catch {
    return null;
  }
}
