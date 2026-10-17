/** After this long without an edit, any editor may take a room over (P1 design, "room draft claiming"). */
export const CLAIM_IDLE_MS = 15 * 60 * 1000;

export interface Claim {
  roomId: string;
  userId: string;
  name: string;
  since: string;
  lastEditAt: string;
}

type Listener = (claims: Claim[]) => void;
interface Person {
  id: string;
  name: string;
}

/**
 * Who is editing which room's draft. Soft locks in memory: a restart clears them and the next edit claims again.
 * Single instance by design, so no cross-process coordination.
 */
export class ClaimRegistry {
  private readonly claims = new Map<string, Claim>();
  private readonly listeners = new Set<Listener>();

  constructor(
    private readonly now: () => Date = () => new Date(),
    private readonly onError: (message: string, error: unknown) => void = (message, error) => console.error(message, error),
  ) {}

  list(): Claim[] {
    return [...this.claims.values()];
  }

  holder(roomId: string): Claim | null {
    return this.claims.get(roomId) ?? null;
  }

  canEdit(roomId: string, userId: string): boolean {
    const held = this.claims.get(roomId);
    return !held || held.userId === userId;
  }

  idle(claim: Claim): boolean {
    return this.now().getTime() - Date.parse(claim.lastEditAt) >= CLAIM_IDLE_MS;
  }

  /** An accepted draft edit: claims a free room or renews the holder's claim. Callers check canEdit first. */
  touch(roomId: string, user: Person): void {
    const at = this.now().toISOString();
    const held = this.claims.get(roomId);
    this.claims.set(roomId, held && held.userId === user.id ? { ...held, name: user.name, lastEditAt: at } : { roomId, userId: user.id, name: user.name, since: at, lastEditAt: at });
    this.changed();
  }

  claim(roomId: string, user: Person, { admin }: { admin: boolean }): { ok: true; claim: Claim } | { ok: false; claim: Claim } {
    const held = this.claims.get(roomId);
    if (held && held.userId !== user.id && !admin && !this.idle(held)) return { ok: false, claim: held };
    const at = this.now().toISOString();
    const claim = held && held.userId === user.id ? { ...held, lastEditAt: at } : { roomId, userId: user.id, name: user.name, since: at, lastEditAt: at };
    this.claims.set(roomId, claim);
    this.changed();
    return { ok: true, claim };
  }

  release(roomId: string, userId: string, { admin }: { admin: boolean }): boolean {
    const held = this.claims.get(roomId);
    if (!held || (held.userId !== userId && !admin)) return false;
    this.claims.delete(roomId);
    this.changed();
    return true;
  }

  prune(exists: (roomId: string) => boolean): void {
    const gone = [...this.claims.keys()].filter((roomId) => !exists(roomId));
    if (gone.length === 0) return;
    for (const roomId of gone) this.claims.delete(roomId);
    this.changed();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed(): void {
    const snapshot = this.list();
    for (const listener of this.listeners) {
      // A broken stream must not fail the edit that changed the claim.
      try {
        listener(snapshot);
      } catch (e) {
        this.onError('A claims listener failed', e);
      }
    }
  }
}
