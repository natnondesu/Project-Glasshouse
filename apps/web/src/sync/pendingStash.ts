import type { WorkspaceCommand } from '@glasshouse/domain';

const KEY = 'glasshouse:unsent';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface Stash {
  userId: string;
  clientId: string;
  commands: { commandId: string; command: WorkspaceCommand }[];
  savedAt: number;
}

/** Edits the server hadn't confirmed when the session ended, kept for this tab until the same person signs in. */
export function saveStash(entry: Omit<Stash, 'savedAt'>): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...entry, savedAt: Date.now() }));
  } catch (e) {
    console.error('Glasshouse could not keep unsent edits for after sign-in', e);
  }
}

/** Hands the stash to its own user once. Another user's stash stays for them; an unreadable or stale one is discarded. */
export function takeStash(userId: string, now = Date.now()): { clientId: string; commands: Stash['commands'] } | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    let s: Stash | null = null;
    try {
      s = JSON.parse(raw) as Stash;
    } catch {
      s = null;
    }
    const fresh = s !== null && Array.isArray(s.commands) && now - s.savedAt <= MAX_AGE_MS;
    if (fresh && s!.userId !== userId) return null;
    sessionStorage.removeItem(KEY);
    return fresh ? { clientId: s!.clientId, commands: s!.commands } : null;
  } catch {
    return null;
  }
}

/** How many unsent edits are waiting for a sign-in in this tab (the sign-in screen mentions them). */
export function stashCount(): number {
  try {
    const raw = sessionStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as Partial<Stash>) : null;
    return Array.isArray(s?.commands) ? s.commands.length : 0;
  } catch {
    return 0;
  }
}
